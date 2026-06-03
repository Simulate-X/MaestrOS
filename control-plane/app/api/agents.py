import logging
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.db import SessionMaker
from app.models import Agent
from app.services.wake import run_wake
from app.services.audit import emit_audit
from app.services import budget

log = logging.getLogger("api.agents")
router = APIRouter(prefix="/agents", tags=["agents"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    company_id: int
    role: str
    title: str
    provider: str = "ollama"
    model: str
    params: dict = Field(default_factory=dict)
    default_skill_id: Optional[int] = None
    budget_usd_limit: Optional[Decimal] = None
    budget_period: str = "monthly"         # "daily" | "monthly" | "all_time"
    reporting_to: Optional[int] = None


class AgentUpdate(BaseModel):
    """PATCH — sadece set edilen alanlar güncellenir."""
    title: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    params: Optional[dict] = None
    default_skill_id: Optional[int] = None
    status: Optional[str] = None
    budget_usd_limit: Optional[Decimal] = None
    budget_period: Optional[str] = None
    reporting_to: Optional[int] = None


class AgentRead(BaseModel):
    id: int
    company_id: int
    role: str
    title: str
    provider: str
    model: str
    params: dict
    default_skill_id: Optional[int]
    status: str
    budget_usd_limit: Optional[float] = None  # Decimal → float: frontend number beklediği için
    budget_period: str = "monthly"
    paused_reason: Optional[str] = None
    reporting_to: Optional[int] = None
    # Faz 4.5: computed field — period spend for roster display
    cost_spent_period: float = 0.0
    model_config = ConfigDict(from_attributes=True)


# ── Cycle validation ──────────────────────────────────────────────────────────

async def validate_no_reporting_cycle(
    session,
    agent_id: Optional[int],
    proposed_reporting_to: Optional[int],
) -> None:
    """A→B→A döngüsünü engelle.
    agent_id=None → yeni agent (henüz id yok), sadece zincir kontrol edilir.
    ValueError → HTTP 400 olarak yukarıda yakalanır.
    """
    if proposed_reporting_to is None:
        return
    seen: set[int] = set()
    if agent_id is not None:
        seen.add(agent_id)
    current = proposed_reporting_to
    while current is not None:
        if current in seen:
            raise ValueError(
                f"reporting_to creates a cycle (agent {current} already in chain)"
            )
        seen.add(current)
        parent = await session.get(Agent, current)
        if parent is None:
            raise ValueError(
                f"reporting_to references nonexistent agent {current}"
            )
        current = parent.reporting_to
        if len(seen) > 100:  # güvenlik tavanı — sonsuz döngü engeli
            raise ValueError("reporting chain too deep (>100 hops)")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=AgentRead, status_code=201)
async def create_agent(data: AgentCreate):
    async with SessionMaker() as s:
        async with s.begin():
            try:
                await validate_no_reporting_cycle(
                    s, agent_id=None, proposed_reporting_to=data.reporting_to
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            agent = Agent(**data.model_dump())
            s.add(agent)
            await s.flush()

            await emit_audit(
                s,
                actor_kind="operator",
                actor_label="operator",
                action="hired",
                target_kind="agent",
                target_id=agent.id,
                target_label=agent.title,
                company_id=agent.company_id,
            )
    return agent


@router.get("", response_model=list[AgentRead])
async def list_agents():
    async with SessionMaker() as s:
        agents = (await s.execute(select(Agent))).scalars().all()
        result = []
        for a in agents:
            spent = await budget.compute_agent_spent(s, a)
            obj = AgentRead.model_validate(a)
            result.append(obj.model_copy(update={"cost_spent_period": float(spent)}))
    return result


@router.get("/{agent_id}", response_model=AgentRead)
async def get_agent(agent_id: int):
    async with SessionMaker() as s:
        agent = await s.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(404, "agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentRead)
async def update_agent(agent_id: int, data: AgentUpdate):
    async with SessionMaker() as s:
        async with s.begin():
            agent = await s.get(Agent, agent_id)
            if agent is None:
                raise HTTPException(404, "agent not found")

            if data.reporting_to is not None or "reporting_to" in data.model_fields_set:
                try:
                    await validate_no_reporting_cycle(
                        s, agent_id=agent_id, proposed_reporting_to=data.reporting_to
                    )
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e))

            prev_status = agent.status
            update_data = data.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                setattr(agent, field, value)

            # Determine audit action based on status transition
            new_status = update_data.get("status")
            if new_status == "terminated":
                audit_action = "terminated"
            elif new_status == "active" and prev_status == "paused":
                audit_action = "resumed"
            else:
                audit_action = "edited"

            await emit_audit(
                s,
                actor_kind="operator",
                actor_label="operator",
                action=audit_action,
                target_kind="agent",
                target_id=agent.id,
                target_label=agent.title,
                company_id=agent.company_id,
            )
    return agent


@router.post("/{agent_id}/wake")
async def wake(agent_id: int):
    return await run_wake(agent_id)
