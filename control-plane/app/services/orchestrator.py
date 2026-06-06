"""
Orchestrator: handle_max_reworks_block (Faz 5)

max_reworks aşıldığında CEO'nun karar vermesini ve kararı uygulamasını sağlar.

Akış:
  1. ceo_swaps_used >= 1 → insan bloğu (swap bütçesi tükendi)
  2. ceo_adjudicate_blocked_ticket → CeoDecision al
  3. swap_model → swap_worker_model + ceo_swaps_used++ + review rework reset + re-queue
     escalate_human / replan → insan bloğu (CEO'nun gerekçesiyle)

Guardrails (kod katmanı — modele güvenme):
  - swap_worker_model: CEO initiated → sadece ollama (NeedsHumanApproval guard)
  - ceo_swaps_used tavanı: 1 swap/ticket
  - Feature flag CEO_AUTONOMOUS_SWAP=false → bu fonksiyon çağrılmaz
"""

import logging

from sqlalchemy import select, update

from app.models import Ticket, Agent, Phase
from app.services.audit import emit_audit
from app.services.agents import swap_worker_model, NeedsHumanApproval
from app.services.ceo import ceo_adjudicate_blocked_ticket, CeoDecision

log = logging.getLogger("services.orchestrator")

_CEO_SWAP_BUDGET = 1   # max autonomous swap per ticket (v1)


async def handle_max_reworks_block(session, *, ticket_id: int) -> None:
    """
    max_reworks aşıldığında CEO'yu devreye al.

    Bu fonksiyon MEVCUT transaction içinde çağrılmalıdır (auto_chain gibi).
    Atomik garanti: swap + rework reset + re-queue + audit aynı txn'de.

    Olası çıktılar:
      A) CEO swap_model kararı: worker modeli güncellendi, ticket re-queued
      B) CEO escalate_human/replan: ticket blocked (CEO gerekçesiyle)
      C) Swap bütçesi tükendi: ticket blocked (budget exhausted)
      D) CEO agent yok / hata: ticket blocked (safe default)
    """
    ticket = await session.get(Ticket, ticket_id)
    if ticket is None:
        log.error("handle_max_reworks_block: ticket %d not found", ticket_id)
        return

    # ── 1) SWAP BÜTÇE KONTROLÜ ────────────────────────────────────────────────
    if (ticket.ceo_swaps_used or 0) >= _CEO_SWAP_BUDGET:
        reason = (
            f"max_reworks exceeded AND CEO swap budget exhausted "
            f"({ticket.ceo_swaps_used}/{_CEO_SWAP_BUDGET} swaps used)"
        )
        log.warning(
            "handle_max_reworks_block: ticket=%d budget_exhausted | %s",
            ticket_id, reason,
        )
        await _block(session, ticket, reason)
        return

    # ── 2) CEO ADJUDICATION ──────────────────────────────────────────────────
    # CEO adapter çağrısı aktif transaction içinde yapılamaz (uzun sürer, lock riski)
    # Ancak burada session aktif olduğu için context okuma yapılıyor.
    # Adapter çağrısı (HTTP) session flush'tan önce yapılır — session lock'lanmaz.
    try:
        decision: CeoDecision = await ceo_adjudicate_blocked_ticket(
            session, ticket_id=ticket_id
        )
    except Exception as exc:
        reason = f"CEO adjudication failed: {exc}"
        log.exception("handle_max_reworks_block: CEO error | ticket=%d", ticket_id)
        await _block(session, ticket, reason)
        return

    # Audit: CEO'nun kararı her zaman görünür
    await emit_audit(
        session,
        actor_kind="agent",
        actor_label="ceo",
        action="ceo_decision",
        target_kind="ticket",
        target_id=ticket_id,
        target_label=ticket.title,
        detail=(
            f"action={decision.action} | "
            f"model={decision.new_provider}/{decision.new_model} | "
            f"reason={decision.reason}"
        ),
        company_id=ticket.company_id,
    )

    # ── 3) KARAR UYGULAMA ────────────────────────────────────────────────────
    if decision.action == "swap_model":
        await _execute_swap(session, ticket, decision)
    else:
        # escalate_human veya replan → insan bloğu
        reason = (
            f"CEO decision={decision.action}: {decision.reason}"
        )
        await _block(session, ticket, reason)


async def _execute_swap(
    session,
    ticket: Ticket,
    decision: CeoDecision,
) -> None:
    """
    CEO swap_model kararını uygula:
      1. swap_worker_model (initiated_by='ceo' → guardrail aktif)
      2. ceo_swaps_used++
      3. review rework counter reset (phase_visit_count'tan 'review' sil)
      4. Ticket'ı build aşamasına re-queue et
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
        # Kod katmanı guardrail devreye girdi
        log.warning(
            "_execute_swap: NeedsHumanApproval | ticket=%d | %s",
            ticket.id, e,
        )
        await _block(session, ticket, f"CEO swap rejected by guardrail: {e}")
        return
    except ValueError as e:
        log.error(
            "_execute_swap: swap failed | ticket=%d | %s",
            ticket.id, e,
        )
        await _block(session, ticket, f"CEO swap failed: {e}")
        return

    # ── visit_count: 'review' rework sayacını sıfırla ───────────────────────
    visit_count = dict(ticket.phase_visit_count or {})
    visit_count.pop("review", None)   # review karşı-sayaç sıfırlandı

    # ── Re-queue: build aşamasına geri döndür ───────────────────────────────
    # Ticket'ın mevcut phase'i build olmalı ya da parent zincirindeki build bulunmalı.
    # Basit yaklaşım: status='queued', phase_visit_count güncelle, blocked_reason temizle.
    # Scheduler bir sonraki tick'te assignee agent'ı (artık yeni model) çalıştıracak.
    ticket.status = "queued"
    ticket.blocked_reason = None
    ticket.phase_visit_count = visit_count
    ticket.ceo_swaps_used = (ticket.ceo_swaps_used or 0) + 1

    # Re-queue önceki build phase'e mi gitsin? Bunu belirlemek için current_phase'e bak.
    # Eğer hâlâ review phase'deyse, build'e geri dönmemiz gerekiyor.
    # auto_chain backward branch logic'ini yeniden tetiklemek yerine
    # doğrudan assignee'yi yeni worker yap ve build phase'e set et.
    await _requeue_to_build(session, ticket)

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


async def _requeue_to_build(session, ticket: Ticket) -> None:
    """
    Ticket'ı build aşamasına yönlendir.
    Workflow varsa build phase'i bul ve current_phase_id'yi set et.
    Workflow yoksa sadece status=queued (single-agent ticket — direkt yeniden çalışır).
    """
    if ticket.workflow_id is None or ticket.current_phase_id is None:
        # Basit ticket — direkt re-queue
        return

    # Workflow'dan 'build' adlı phase'i bul
    from app.models import Phase
    from sqlalchemy import select

    build_phase = (await session.execute(
        select(Phase).where(
            Phase.workflow_id == ticket.workflow_id,
            Phase.name == "build",
        )
    )).scalar_one_or_none()

    if build_phase is None:
        # 'build' adlı phase yok — mevcut phase'de bırak
        log.warning(
            "_requeue_to_build: ticket=%d no 'build' phase found in workflow=%d",
            ticket.id, ticket.workflow_id,
        )
        return

    # assignee'yi build phase'in ajanına güncelle
    from app.services.auto_chain import _find_agent_for_phase
    build_agent = await _find_agent_for_phase(session, ticket.company_id, build_phase)
    if build_agent:
        ticket.assignee_agent_id = build_agent.id

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

    log.warning(
        "handle_max_reworks_block: ticket=%d BLOCKED | %s",
        ticket.id, reason,
    )
