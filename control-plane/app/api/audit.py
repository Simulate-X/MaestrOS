from datetime import datetime
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.db import SessionMaker
from app.models import AuditEvent

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditEventRead(BaseModel):
    id: int
    ts: datetime
    actor_kind: str
    actor_id: Optional[int]
    actor_label: str
    action: str
    target_kind: str
    target_id: int
    target_label: str
    detail: Optional[str]
    company_id: Optional[int]
    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=list[AuditEventRead])
async def list_audit(
    company_id: Optional[int] = None,
    actor_kind: Optional[str] = None,
    action: Optional[str] = None,
    target_kind: Optional[str] = None,
    since: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0,
):
    """
    Append-only audit log — sadece okuma.
    POST / PATCH / DELETE endpoint'i yoktur; kayıtlar yalnız emit_audit() ile yazılır.

    Sıralama: ts DESC (en yeni önce).
    """
    async with SessionMaker() as s:
        q = select(AuditEvent)
        if company_id is not None:
            q = q.where(AuditEvent.company_id == company_id)
        if actor_kind is not None:
            q = q.where(AuditEvent.actor_kind == actor_kind)
        if action is not None:
            q = q.where(AuditEvent.action == action)
        if target_kind is not None:
            q = q.where(AuditEvent.target_kind == target_kind)
        if since is not None:
            q = q.where(AuditEvent.ts >= since)
        q = q.order_by(AuditEvent.ts.desc()).limit(limit).offset(offset)
        return (await s.execute(q)).scalars().all()
