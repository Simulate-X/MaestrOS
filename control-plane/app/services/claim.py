import logging
from sqlalchemy import select, update, func

from app.models import Agent, Company, Ticket
from app.services.budget import check_budget
from app.services.audit import emit_audit

log = logging.getLogger("claim")


async def claim_ticket(session, agent_id: int) -> int | None:
    """
    Bu agent'a atanmış sıradaki queued ticket'ı atomik kapar.

    Faz 4.2: budget pre-flight (TEK enforcement noktası).
    - Agent-level limit aşıldı → agent paused (görünürlük), None döner.
    - Company-level limit aşıldı → agent paused OLMAZ (suçlu değil),
      scheduler pre-filter zaten bu tick'te skip etti; yine de None döner.

    Faz 4.5: Audit emission:
      - claimed       → ticket başarıyla claim edildi
      - paused_budget → agent kendi limitini aştı
      - budget_exceeded → company limiti aşıldı

    Kısa transaction — sadece budget kontrolü + status çevirme.
    Asıl koşuş commit'ten SONRA, session dışında.
    """
    async with session.begin():
        agent = await session.get(Agent, agent_id)
        if agent is None:
            return None

        # ── Budget pre-flight ─────────────────────────────────────────────
        ok, scope, reason = await check_budget(session, agent)
        if not ok:
            if scope == "agent":
                # Agent kendi limitini aştı → visible pause (suçlu bu agent)
                agent.status = "paused"
                agent.paused_reason = reason
                log.warning("claim: agent=%d PAUSED | %s", agent_id, reason)

                await emit_audit(
                    session,
                    actor_kind="system",
                    actor_label="budget",
                    action="paused_budget",
                    target_kind="agent",
                    target_id=agent.id,
                    target_label=agent.title,
                    detail=reason,
                    company_id=agent.company_id,
                )

            elif scope == "company":
                # scope == "company" → agent'ı pause ETME; scheduler pre-filter halleder
                log.warning("claim: company=%d over budget, skipping agent=%d", agent.company_id, agent_id)

                company = await session.get(Company, agent.company_id)
                await emit_audit(
                    session,
                    actor_kind="system",
                    actor_label="budget",
                    action="budget_exceeded",
                    target_kind="company",
                    target_id=agent.company_id,
                    target_label=company.name if company else str(agent.company_id),
                    detail=reason,
                    company_id=agent.company_id,
                )

            return None

        # ── SKIP LOCKED claim (Faz 0'dan) ────────────────────────────────
        row = (await session.execute(
            select(Ticket.id)
            .where(
                Ticket.status == "queued",
                Ticket.assignee_agent_id == agent_id,
            )
            .order_by(Ticket.priority.desc(), Ticket.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )).scalar_one_or_none()

        if row is None:
            return None

        await session.execute(
            update(Ticket)
            .where(Ticket.id == row)
            .values(status="running", owner_agent_id=agent_id, locked_at=func.now())
        )

        # ── Claimed audit ─────────────────────────────────────────────────
        ticket_obj = await session.get(Ticket, row)
        if ticket_obj is not None:
            await emit_audit(
                session,
                actor_kind="agent",
                actor_id=agent.id,
                actor_label=agent.title,
                action="claimed",
                target_kind="ticket",
                target_id=row,
                target_label=ticket_obj.title,
                company_id=agent.company_id,
            )

        return row
