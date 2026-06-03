"""
Budget servisi — tek otoriter spend hesaplama ve enforcement noktası.

İki seviye:
  - Agent-level : aşılırsa o agent paused (suçlu o).
  - Company-level: aşılırsa scheduler pre-filter ile tüm şirket skip edilir
                   (agent'lar paused OLMAZ — suçlu değiller).

Period penceresi deterministik — reset job YOK:
  current_period_start() saati ilerledikçe pencereyi kaydırır,
  DB'de saklanan timestamp gereksiz.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, func

from app.models import Run, Agent, Company

log = logging.getLogger("budget")

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def current_period_start(period: str, now: datetime | None = None) -> datetime:
    """Periyodun başlangıç anını deterministik hesapla.

    "daily"    → bu günün 00:00:00 UTC
    "monthly"  → bu ayın 1. günü 00:00:00 UTC
    "all_time" → epoch (1970-01-01) — hiç resetlenmez
    """
    now = now or _utcnow()
    if period == "daily":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "monthly":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return EPOCH  # all_time


async def compute_agent_spent(session, agent: Agent) -> Decimal:
    """Agent'ın mevcut period penceresi içindeki toplam harcaması."""
    if agent.budget_usd_limit is None:
        return Decimal(0)
    since = current_period_start(agent.budget_period)
    total = await session.scalar(
        select(func.coalesce(func.sum(Run.cost_usd), 0))
        .where(Run.agent_id == agent.id, Run.ended_at >= since)
    )
    return Decimal(str(total or 0))


async def compute_company_spent(session, company: Company) -> Decimal:
    """Şirketin mevcut period penceresi içindeki toplam harcaması (tüm agent'lar)."""
    if company.budget_usd_limit is None:
        return Decimal(0)
    since = current_period_start(company.budget_period)
    total = await session.scalar(
        select(func.coalesce(func.sum(Run.cost_usd), 0))
        .join(Agent, Run.agent_id == Agent.id)
        .where(Agent.company_id == company.id, Run.ended_at >= since)
    )
    return Decimal(str(total or 0))


async def check_budget(
    session, agent: Agent
) -> tuple[bool, str | None, str | None]:
    """Pre-flight budget kontrolü. Agent-level önce kontrol edilir.

    Returns (ok, scope, reason)
      ok    : True → claim devam edebilir
      scope : None | "agent" | "company"
      reason: insan-okunabilir açıklama
    """
    # Agent-level
    if agent.budget_usd_limit is not None:
        spent = await compute_agent_spent(session, agent)
        if spent >= agent.budget_usd_limit:
            return (
                False, "agent",
                f"agent budget exhausted: ${spent:.4f} >= "
                f"${agent.budget_usd_limit:.4f} ({agent.budget_period})",
            )

    # Company-level
    company = await session.get(Company, agent.company_id)
    if company is not None and company.budget_usd_limit is not None:
        spent = await compute_company_spent(session, company)
        if spent >= company.budget_usd_limit:
            return (
                False, "company",
                f"company budget exhausted: ${spent:.4f} >= "
                f"${company.budget_usd_limit:.4f} ({company.budget_period})",
            )

    return (True, None, None)


async def over_budget_company_ids(session) -> list[int]:
    """Scheduler tick pre-filter: limit'i olan ve aşmış şirketlerin id'leri.
    Tick başına bir kez çağrılır — O(şirket sayısı) sorgu."""
    companies = (await session.execute(
        select(Company).where(Company.budget_usd_limit.isnot(None))
    )).scalars().all()

    blocked: list[int] = []
    for c in companies:
        spent = await compute_company_spent(session, c)
        if spent >= c.budget_usd_limit:
            blocked.append(c.id)
            log.info(
                "budget: company=%d BLOCKED | spent=%.4f >= limit=%.4f (%s)",
                c.id, spent, c.budget_usd_limit, c.budget_period,
            )
    return blocked
