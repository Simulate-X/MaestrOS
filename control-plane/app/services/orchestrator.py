"""
Orchestrator: handle_max_reworks_block (Faz 5)

max_reworks aşıldığında CEO'nun karar vermesini ve kararı uygulamasını sağlar.

Akış:
  1. ceo_swaps_used >= 1 → insan bloğu (swap bütçesi tükendi)
  2. ceo_adjudicate_blocked_ticket → CeoDecision al
  3. Glass Box Audit -> CEO kararı dallanmadan önce günlüğe yazılır.
  4. swap_model → swap_worker_model + ceo_swaps_used++ + review rework reset + re-queue
     escalate_human / replan → insan bloğu (CEO'nun gerekçesiyle)

Guardrails (kod katmanı — modele güvenme):
  - swap_worker_model: CEO initiated → sadece ollama (NeedsHumanApproval guard)
  - ceo_swaps_used tavanı: 1 swap/ticket
  - Feature flag CEO_AUTONOMOUS_SWAP=false → bu fonksiyon çağrılmaz
"""

import logging

from sqlalchemy import select

from app.models import Ticket, Agent, Phase
from app.services.audit import emit_audit
from app.services.agents import swap_worker_model, NeedsHumanApproval
from app.services.ceo import ceo_adjudicate_blocked_ticket, CeoDecision

log = logging.getLogger("services.orchestrator")

_CEO_SWAP_BUDGET = 1   # max autonomous swap per ticket (v1)


async def handle_max_reworks_block(session, *, ticket_id: int) -> None:
    """
    max_reworks aşıldığında CEO'yu devreye al.
    """
    ticket = await session.get(Ticket, ticket_id)
    if ticket is None:
        log.warning("handle_max_reworks_block: ticket=%d not found", ticket_id)
        return

    # 1. Cap Kontrolü: 1 ticket için max 1 autonomous swap
    swaps_used = ticket.ceo_swaps_used or 0
    if swaps_used >= _CEO_SWAP_BUDGET:
        log.info(
            "handle_max_reworks_block: swap budget exhausted | ticket=%d | used=%d >= limit=%d",
            ticket_id, swaps_used, _CEO_SWAP_BUDGET
        )
        await _block(
            session,
            ticket,
            f"Human intervention required: CEO autonomous swap budget exhausted ({swaps_used}/{_CEO_SWAP_BUDGET})"
        )
        return

    log.info("handle_max_reworks_block: invoking CEO adjudication | ticket=%d", ticket_id)

    # 2. CEO Karar Mekanizması (Brain)
    try:
        decision = await ceo_adjudicate_blocked_ticket(session, ticket_id=ticket_id)
    except Exception as exc:
        log.error("handle_max_reworks_block: CEO adjudication crashed | ticket=%d | %s", ticket_id, exc)
        await _block(session, ticket, f"CEO adjudication system error: {exc}")
        return

    action = decision.action
    reason = decision.reason or "No reason provided by CEO."

    # 🌟 Glass Box Audit: Kararı işleme almadan önce ham fikri izleme günlüğüne yazıyoruz
    await emit_audit(
        session,
        actor_kind="agent",
        actor_label="ceo",
        action="adjudicated",
        target_kind="ticket",
        target_id=ticket.id,
        target_label=ticket.title,
        detail=f"CEO Adjudication completed. Action: {action.upper()} | Reason: {reason}",
        company_id=ticket.company_id,
    )

    # 3. Kararı Uygula (Execution Branching)
    if action == "swap_model":
        await _execute_swap(session, ticket, decision)

    elif action == "escalate_human":
        log.info("handle_max_reworks_block: CEO requested escalation | ticket=%d | reason=%s", ticket_id, reason)
        await _block(session, ticket, f"CEO Escalation: {reason}")

    elif action == "replan":
        log.info("handle_max_reworks_block: CEO requested replan | ticket=%d | reason=%s", ticket_id, reason)
        await _block(session, ticket, f"CEO Replan Request (v2 feature): {reason}")

    else:
        log.error("handle_max_reworks_block: unknown CEO action | ticket=%d | action=%r", ticket_id, action)
        await _block(session, ticket, f"System Error: Unknown CEO action {action!r}")


async def _execute_swap(
    session,
    ticket: Ticket,
    decision: CeoDecision,
) -> None:
    """
    CEO swap_model kararını uygula.
    🌟 DÜZELTMESİ YAPILDI: UnboundLocalError riski yok edildi.
    """
    try:
        swap_result = await swap_worker_model(
            session,
            agent_id=decision.target_agent_id,
            new_provider=decision.new_provider,
            new_model=decision.new_model,
            initiated_by="ceo",
            reason=decision.reason,
        )
    except NeedsHumanApproval as e:
        log.warning("_execute_swap: NeedsHumanApproval | ticket=%d | %s", ticket.id, e)
        await _block(session, ticket, f"CEO swap rejected by guardrail: {e}")
        return
    except ValueError as e:
        log.error("_execute_swap: swap failed | ticket=%d | %s", ticket.id, e)
        await _block(session, ticket, f"CEO swap failed: {e}")
        return

    # ── visit_count: 'review' rework sayacını sıfırla ───────────────────────
    visit_count = dict(ticket.phase_visit_count or {})
    visit_count.pop("review", None)

    ticket.status = "queued"
    ticket.blocked_reason = None
    ticket.phase_visit_count = visit_count
    ticket.ceo_swaps_used = (ticket.ceo_swaps_used or 0) + 1

    # 🌟 3(a) Doğrulaması: Terfi alan ajanı doğrudan alt fonksiyona dikiyoruz
    await _requeue_to_build(session, ticket, target_agent_id=decision.target_agent_id)

    log.info(
        "_execute_swap: ticket=%d re-queued | worker=%d %s/%s→%s/%s | ceo_swaps_used=%d",
        ticket.id,
        decision.target_agent_id,
        swap_result.old_provider, swap_result.old_model,
        decision.new_provider, decision.new_model,
        ticket.ceo_swaps_used,
    )

    await emit_audit(
        session,
        actor_kind="agent",
        actor_label="ceo",
        action="requeued_after_swap",
        target_kind="ticket",
        target_id=ticket.id,
        target_label=ticket.title,
        detail=(
            f"worker model swapped {swap_result.old_model}→{decision.new_model} | "
            f"ticket re-queued to build | reason: {decision.reason}"
        ),
        company_id=ticket.company_id,
    )


async def _requeue_to_build(session, ticket: Ticket, target_agent_id: int) -> None:
    """
    Ticket'ı build aşamasına yönlendirir.
    """
    if ticket.workflow_id is None or ticket.current_phase_id is None:
        return

    build_phase = (await session.execute(
        select(Phase).where(
            Phase.workflow_id == ticket.workflow_id,
            Phase.name == "build",
        )
    )).scalar_one_or_none()

    if build_phase is None:
        log.warning(
            "_requeue_to_build: ticket=%d no 'build' phase found in workflow=%d",
            ticket.id, ticket.workflow_id,
        )
        return

    ticket.assignee_agent_id = target_agent_id
    ticket.current_phase_id = build_phase.id


async def _block(session, ticket: Ticket, reason: str) -> None:
    """Ticket'ı blocked yap + audit yaz."""
    ticket.status = "blocked"
    ticket.blocked_reason = reason

    await emit_audit(
        session,
        actor_kind="system",
        actor_label="ceo-orchestrator",
        action="blocked",
        target_kind="ticket",
        target_id=ticket.id,
        target_label=ticket.title,
        detail=reason,
        company_id=ticket.company_id,
    )