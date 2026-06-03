import logging
from datetime import datetime, timezone

from sqlalchemy import update

from app.db import SessionMaker
from app.models import Ticket, Run, Skill, Agent
from app.services.claim import claim_ticket
from app.services.context import build_run_packet
from app.services.auto_chain import on_run_complete
from app.services.audit import emit_audit
from app.adapters import build_adapter

log = logging.getLogger("wake")


async def run_wake(agent_id: int) -> dict:
    """
    Bir agent için tek wake döngüsü.
    HTTP endpoint ve scheduler tarafından ortaklaşa kullanılır.

    Session disiplini (3 ayrı kısa session):
      1) CLAIM  — kısa transaction, sadece status çevirir
      2) PACKET — kısa okuma, RunPacket inşa eder (context injection dahil)
      3) PERSIST — Run kaydı + Ticket bitirir + auto_chain + budget check (atomik)
    """

    # ── 1) CLAIM ─────────────────────────────────────────────────────────────
    async with SessionMaker() as s:
        ticket_id = await claim_ticket(s, agent_id)
    if ticket_id is None:
        return {"status": "no_work"}

    # ── 2) PACKET ─────────────────────────────────────────────────────────────
    async with SessionMaker() as s:
        agent = await s.get(Agent, agent_id)
        ticket = await s.get(Ticket, ticket_id)
        skill = None
        if agent and agent.default_skill_id:
            skill = await s.get(Skill, agent.default_skill_id)
        packet = await build_run_packet(s, ticket, skill)
    # session KAPANDI — expire_on_commit=False ile agent.provider hâlâ erişilebilir

    # ── 3) KOŞUŞ — hiçbir session/transaction AÇIK DEĞİL ────────────────────
    adapter = build_adapter(agent)
    result = await adapter.run(packet)

    if result.status == "done" and not result.work_product:
        result.status = "error"
        result.logs.append("empty_work_product: adapter done bildirdi ancak içerik boş")

    # ── 4) PERSIST (atomik: Run + Ticket + auto_chain + audit) ───────────────
    async with SessionMaker() as s:
        async with s.begin():
            # Ticket'ı ORM olarak yükle (auto_chain ve audit için gerekli)
            ticket_obj = await s.get(Ticket, ticket_id)

            s.add(
                Run(
                    ticket_id=ticket_id,
                    agent_id=agent_id,
                    status=result.status,
                    work_product=result.work_product,
                    logs=result.logs,
                    cost_tokens=result.cost_tokens,
                    cost_usd=result.cost_usd,          # Faz 4.1: Decimal
                    ended_at=datetime.now(timezone.utc),
                )
            )
            await s.execute(
                update(Ticket)
                .where(Ticket.id == ticket_id)
                .values(
                    status="done" if result.status == "done" else "error",
                    owner_agent_id=None,
                    locked_at=None,
                )
            )

            if result.status != "done":
                # Hata durumu: audit emit (on_run_complete zaten early return yapacak)
                await emit_audit(
                    s,
                    actor_kind="system",
                    actor_label="scheduler",
                    action="error",
                    target_kind="ticket",
                    target_id=ticket_id,
                    target_label=ticket_obj.title if ticket_obj else str(ticket_id),
                    detail="; ".join(result.logs[-3:]) if result.logs else None,
                    company_id=ticket_obj.company_id if ticket_obj else None,
                )

            # Auto-chain: mevcut transaction içinde sonraki phase ticket'ını yarat.
            # agent geçiriliyor → verdict emission auto_chain içinde yapılır.
            await on_run_complete(s, ticket_obj, result.status, result.work_product, agent=agent)
            # Budget enforcement claim-time'a taşındı (claim.py) — burada YOK.

    return {"status": result.status, "ticket_id": ticket_id}
