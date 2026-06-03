"""
Auto-chain v2 (Faz 2.5): verdict-aware routing + loop limit + body composition.

KRİTİK: Bu fonksiyon MEVCUT transaction içinde çağrılmalıdır.
Yeni session veya yeni transaction açmaz — atomik garanti buradan gelir.

Üç çıktı durumu:
  1. Yeni ticket yarat (forward veya backward branch)
  2. Mevcut ticket'ı blocked yap (unparseable verdict, agent yok, loop limit aşıldı)
  3. Hiçbir şey yapma (workflow son fazı)

"Sessiz default approve/rework yok" — belirsiz her durum blocked ile insanı çağırır.
"""

import logging
from sqlalchemy import select

from app.models import Phase, Ticket, Agent
from app.services.verdict_parser import parse_verdict
from app.services.audit import emit_audit

log = logging.getLogger("auto_chain")

# Verdict string → audit action
_VERDICT_ACTION: dict[str, str] = {
    "approve": "approved",
    "rework": "requested_rework",
    "escalate": "awaiting_approval",
    "ship": "shipped",
    "hold": "requested_rework",
}

# Phase name → audit action for default-forward (no verdict needed)
_PHASE_ACTION: dict[str, str] = {
    "plan": "planned",
    "build": "built",
    "review": "reviewed",
    "ship": "shipped",
}


async def on_run_complete(
    session,
    ticket: Ticket,
    run_status: str,
    work_product: str,
    agent=None,
) -> Ticket | None:
    """
    Çağrı koşulları:
      - run_status == "done" olmalı
      - ticket.workflow_id ve ticket.current_phase_id dolu olmalı

    Döndürür:
      - Yeni Ticket nesnesi (yaratıldıysa)
      - None (zincir bitti, son faz, veya blocked yapıldı)

    Faz 4.5: agent opsiyonel olarak alınır; audit emission için kullanılır.
    """
    if run_status != "done":
        return None
    if ticket.workflow_id is None or ticket.current_phase_id is None:
        return None

    current_phase = await session.get(Phase, ticket.current_phase_id)
    if current_phase is None:
        return None

    # ── 1) VERDICT RESOLUTION ────────────────────────────────────────────────
    target_phase_name: str | None = await _default_next_name(session, current_phase)
    is_backward = False
    branch_map: dict = current_phase.branch_on_verdict or {}
    default_verdict: str = current_phase.default_verdict or "approve"

    # Phase verdict üretiyor mu? (branch var veya default standart "approve" değilse)
    needs_verdict = bool(branch_map) or default_verdict != "approve"

    # Audit için action — verdict resolution'dan sonra belirlenir
    _audit_action: str | None = None
    decision: str | None = None

    if needs_verdict:
        decision, err = parse_verdict(work_product)
        if decision == "unparseable":
            await _block_ticket(session, ticket, f"verdict unparseable: {err}")
            return None

        # Phase-aware semantik validasyon: izinli set = branch_map.keys() ∪ {default_verdict}
        allowed = set(branch_map.keys()) | {default_verdict}
        if decision not in allowed:
            await _block_ticket(
                session,
                ticket,
                f"verdict {decision!r} not in allowed set {sorted(allowed)} for phase {current_phase.name}",
            )
            return None

        if decision in branch_map:
            target_phase_name = branch_map[decision]
            is_backward = True
        # else: decision == default_verdict → target_phase_name stays as default_next

        _audit_action = _VERDICT_ACTION.get(decision, decision)
    else:
        # Default forward — no verdict parsing needed
        _audit_action = _PHASE_ACTION.get(current_phase.name, current_phase.name)

    if target_phase_name is None:
        # Workflow son fazı — zincir kapandı
        log.info(
            "auto_chain: zincir kapandı | ticket=%d workflow=%d",
            ticket.id, ticket.workflow_id,
        )
        return None

    # ── 2) TARGET PHASE RESOLVE ──────────────────────────────────────────────
    target_phase = await _resolve_phase_by_name(session, ticket.workflow_id, target_phase_name)
    if target_phase is None:
        await _block_ticket(
            session,
            ticket,
            f"target phase {target_phase_name!r} not found in workflow {ticket.workflow_id}",
        )
        return None

    # ── 3) LOOP LIMIT ────────────────────────────────────────────────────────
    visit_count: dict = dict(ticket.phase_visit_count or {})
    next_visit = visit_count.get(target_phase.name, 0) + 1
    if target_phase.max_reworks is not None and next_visit > target_phase.max_reworks:
        await _block_ticket(
            session,
            ticket,
            f"max_reworks ({target_phase.max_reworks}) exceeded for {target_phase.name}",
        )
        return None

    # ── 4) BODY COMPOSITION ──────────────────────────────────────────────────
    if is_backward:
        body = await _compose_backward_body(
            session, ticket, work_product, target_phase, next_visit
        )
    else:
        body = work_product      # forward: önceki fazın çıktısı yeni fazın girdisi

    # ── 5) NEXT AGENT ────────────────────────────────────────────────────────
    next_agent = await _find_agent_for_phase(session, ticket.company_id, target_phase)
    if next_agent is None:
        await _block_ticket(
            session,
            ticket,
            f"no active agent with default_skill_id={target_phase.skill_id} in company {ticket.company_id}",
        )
        return None

    # ── 6) CREATE NEXT TICKET ────────────────────────────────────────────────
    visit_count[target_phase.name] = next_visit
    initial_status = "needs_approval" if target_phase.gate == "human_approval" else "queued"

    new_ticket = Ticket(
        company_id=ticket.company_id,
        workflow_id=ticket.workflow_id,
        current_phase_id=target_phase.id,
        parent_ticket_id=ticket.id,                             # chain tracing
        assignee_agent_id=next_agent.id,
        title=_compose_title(ticket, target_phase, next_visit, is_backward),
        body=body,
        status=initial_status,
        context_doc_ids=list(ticket.context_doc_ids or []),     # context zincirden taşınır
        phase_visit_count=visit_count,
    )
    session.add(new_ticket)
    await session.flush()      # id üret (commit beklemeden log için)

    # ── 7) AUDIT EMISSION ────────────────────────────────────────────────────
    if agent is not None and _audit_action is not None:
        await emit_audit(
            session,
            actor_kind="agent",
            actor_id=agent.id,
            actor_label=agent.title,
            action=_audit_action,
            target_kind="ticket",
            target_id=ticket.id,
            target_label=ticket.title,
            company_id=ticket.company_id,
        )

    log.info(
        "auto_chain: ticket=%d → %s id=%d status=%s iter=%d",
        ticket.id, target_phase.name, new_ticket.id, initial_status, next_visit,
    )
    return new_ticket


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _block_ticket(session, ticket: Ticket, reason: str) -> None:
    """
    Mevcut ticket'ı in-place blocked yap ve audit emit et.
    Flush etmez — caller'ın (wake.py PERSIST adımı) transaction commit'i flush'u tetikler.
    Atomik garanti: ticket.done → blocked + blocked_reason + audit_log aynı txn'de.
    """
    ticket.status = "blocked"
    ticket.blocked_reason = reason
    log.warning("auto_chain: ticket=%d BLOCKED | reason=%s", ticket.id, reason)

    await emit_audit(
        session,
        actor_kind="system",
        actor_label="scheduler",
        action="blocked",
        target_kind="ticket",
        target_id=ticket.id,
        target_label=ticket.title,
        detail=reason,
        company_id=ticket.company_id,
    )


async def _default_next_name(session, phase: Phase) -> str | None:
    """Phase.next_phase_id'yi ada çevir."""
    if phase.next_phase_id is None:
        return None
    nxt = await session.get(Phase, phase.next_phase_id)
    return nxt.name if nxt else None


async def _resolve_phase_by_name(session, workflow_id: int, name: str) -> Phase | None:
    return (await session.execute(
        select(Phase).where(
            Phase.workflow_id == workflow_id,
            Phase.name == name,
        )
    )).scalar_one_or_none()


async def _find_agent_for_phase(session, company_id: int, phase: Phase) -> Agent | None:
    return (await session.execute(
        select(Agent).where(
            Agent.company_id == company_id,
            Agent.default_skill_id == phase.skill_id,
            Agent.status == "active",
        ).limit(1)
    )).scalar_one_or_none()


async def _walk_back_to_phase(session, ticket: Ticket, target_phase_id: int) -> Ticket | None:
    """
    Parent zincirinde target_phase_id'ye sahip ticket'ı bul.
    Güvenlik: 50 hop tavanı — schema bütünlüğü bozulsa bile sonsuz döngüye girme.
    """
    current = ticket
    for _ in range(50):
        if current is None:
            return None
        if current.current_phase_id == target_phase_id:
            return current
        if current.parent_ticket_id is None:
            return None
        current = await session.get(Ticket, current.parent_ticket_id)
    return None


async def _compose_backward_body(
    session,
    current_ticket: Ticket,
    current_work_product: str,
    target_phase: Phase,
    iteration: int,
) -> str:
    """3-bileşenli rework body: Original Input + Previous Attempt + Feedback + Instruction."""
    target_history = await _walk_back_to_phase(session, current_ticket, target_phase.id)
    original_input = (
        target_history.body if target_history is not None
        else "[chain history before target phase not found — proceeding with limited context]"
    )
    previous_attempt = current_ticket.body

    return (
        f"# Rework Iteration {iteration} → {target_phase.name}\n\n"
        f"## Original Input (from earlier {target_phase.name})\n{original_input}\n\n"
        f"## Previous Attempt\n{previous_attempt}\n\n"
        f"## Feedback / Reason for Rework\n{current_work_product}\n\n"
        f"## Instruction\n"
        f"Patch the issues identified in **Feedback / Reason for Rework**. "
        f"Do **not** rewrite from scratch.\n"
        f"Preserve what worked in **Previous Attempt**; change only what the feedback flags.\n"
        f"In your Decision Log, summarize *what changed and why* in this iteration."
    )


def _compose_title(parent: Ticket, target_phase: Phase, iteration: int, is_backward: bool) -> str:
    if is_backward:
        return f"{parent.title} ↺ {target_phase.name} (iter {iteration})"
    return f"{parent.title} → {target_phase.name}"
