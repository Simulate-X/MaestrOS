from datetime import datetime
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.db import SessionMaker
from app.models import Run

router = APIRouter(prefix="/runs", tags=["runs"])


class RunRead(BaseModel):
    id: int
    ticket_id: int
    agent_id: int
    status: str
    work_product: str
    logs: list
    cost_tokens: int
    cost_usd: float          # Decimal → float: frontend number beklediği için
    started_at: datetime
    ended_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=list[RunRead])
async def list_runs(
    ticket_id: Optional[int] = None,
    agent_id: Optional[int] = None,
    since: Optional[datetime] = None,
    limit: int = 50,
    offset: int = 0,
):
    """
    Filtrelenmiş Run listesi.

    Sıralama: ended_at DESC NULLS FIRST (running/in-progress run'lar en üstte),
    sonra id DESC.

    Filtreler:
      ticket_id — o ticket'a ait run'lar
      agent_id  — o agent'ın run'ları
      since     — ended_at >= since
      limit     — max satır (default 50)
      offset    — sayfalama
    """
    async with SessionMaker() as s:
        q = select(Run)
        if ticket_id is not None:
            q = q.where(Run.ticket_id == ticket_id)
        if agent_id is not None:
            q = q.where(Run.agent_id == agent_id)
        if since is not None:
            q = q.where(Run.ended_at >= since)
        q = (
            q.order_by(Run.ended_at.desc().nullsfirst(), Run.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return (await s.execute(q)).scalars().all()
