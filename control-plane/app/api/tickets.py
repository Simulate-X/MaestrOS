from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update

from app.db import SessionMaker
from app.models import Ticket
from app.services.audit import emit_audit
from app.services.orchestrator import handle_max_reworks_block

router = APIRouter(prefix="/tickets", tags=["tickets"])


# ── Schema ───────────────────────────────────────────────────────────────────

class TicketCreate(BaseModel):
    company_id: int
    assignee_agent_id: Optional[int] = None
    title: str
    body: str = ""
    status: str = "queued"
    priority: int = 0
    # Faz 2: workflow chain
    workflow_id: Optional[int] = None
    current_phase_id: Optional[int] = None
    context_doc_ids: list[int] = Field(default_factory=list)


class TicketRead(BaseModel):
    id: int
    company_id: int
    assignee_agent_id: Optional[int]
    title: str
    body: str
    status: str
    priority: int
    owner_agent_id: Optional[int]
    locked_at: Optional[datetime]
    created_at: datetime
    # Faz 2
    workflow_id: Optional[int]
    current_phase_id: Optional[int]
    context_doc_ids: list[int]
    # Faz 2.5
    parent_ticket_id: Optional[int]
    phase_visit_count: dict
    blocked_reason: Optional[str]
    # Faz 5: CEO swap sayacı
    ceo_swaps_used: int = 0
    model_config = ConfigDict(from_attributes=True)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", response_model=TicketRead, status_code=201)
async def create_ticket(data: TicketCreate):
    async with SessionMaker() as s:
        async with s.begin():
            ticket = Ticket(**data.model_dump())
            s.add(ticket)
            await s.flush()
    return ticket


@router.get("", response_model=list[TicketRead])
async def list_tickets():
    async with SessionMaker() as s:
        result = await s.execute(select(Ticket))
        return result.scalars().all()


@router.get("/{ticket_id}", response_model=TicketRead)
async def get_ticket(ticket_id: int):
    async with SessionMaker() as s:
        ticket = await s.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(404, "ticket not found")
    return ticket


@router.post("/{ticket_id}/approve")
async def approve_ticket(ticket_id: int):
    """
    needs_approval durumundaki ticket'ı queued'a çeker.
    Scheduler bir sonraki tick'te doğal olarak devam eder.
    """
    async with SessionMaker() as s:
        async with s.begin():
            result = await s.execute(
                update(Ticket)
                .where(Ticket.id == ticket_id, Ticket.status == "needs_approval")
                .values(status="queued")
                .returning(Ticket.id)
            )
            approved_id = result.scalar_one_or_none()
            if approved_id is None:
                raise HTTPException(
                    status_code=409,
                    detail="ticket is not in needs_approval state",
                )

            # Fetch ticket for audit label (title/company_id not changed by update)
            ticket = await s.get(Ticket, ticket_id)
            await emit_audit(
                s,
                actor_kind="operator",
                actor_label="operator",
                action="approved",
                target_kind="ticket",
                target_id=ticket_id,
                target_label=ticket.title if ticket else str(ticket_id),
                company_id=ticket.company_id if ticket else None,
            )

    return {"status": "approved", "ticket_id": ticket_id}


@router.post("/{ticket_id}/reject")
async def reject_ticket(ticket_id: int, reason: str = ""):
    """
    needs_approval ticket'ını reddeder — zinciri kırar.
    """
    async with SessionMaker() as s:
        async with s.begin():
            result = await s.execute(
                update(Ticket)
                .where(Ticket.id == ticket_id, Ticket.status == "needs_approval")
                .values(status="rejected")
                .returning(Ticket.id)
            )
            rejected_id = result.scalar_one_or_none()
            if rejected_id is None:
                raise HTTPException(
                    status_code=409,
                    detail="ticket is not in needs_approval state",
                )

            ticket = await s.get(Ticket, ticket_id)
            await emit_audit(
                s,
                actor_kind="operator",
                actor_label="operator",
                action="rejected",
                target_kind="ticket",
                target_id=ticket_id,
                target_label=ticket.title if ticket else str(ticket_id),
                detail=reason or None,
                company_id=ticket.company_id if ticket else None,
            )

    return {"status": "rejected", "ticket_id": ticket_id, "reason": reason}


@router.post("/{ticket_id}/ceo-adjudicate")
async def ceo_adjudicate(ticket_id: int):
    """
    Manuel CEO adjudication trigger.

    Blocked (max_reworks) bir ticket üzerinde CEO'yu devreye alır.
    CEO kararı (swap / escalate / replan) uygulanır.

    Test akışı: önce bu endpoint ile CEO'yu izle, ardından CEO_AUTONOMOUS_SWAP=true yap.
    """
    async with SessionMaker() as s:
        async with s.begin():
            ticket = await s.get(Ticket, ticket_id)
            if ticket is None:
                raise HTTPException(404, "ticket not found")
            if ticket.status not in ("blocked", "done"):
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"ticket status is {ticket.status!r}; "
                        "ceo-adjudicate only applies to blocked or done tickets"
                    ),
                )

            await handle_max_reworks_block(s, ticket_id=ticket_id)

            # Güncel durumu döndür
            await s.refresh(ticket)

    return {
        "ticket_id": ticket_id,
        "new_status": ticket.status,
        "blocked_reason": ticket.blocked_reason,
        "ceo_swaps_used": ticket.ceo_swaps_used,
    }

@router.post("/{ticket_id}/ceo-dry-run-test")
async def ceo_dry_run_test(ticket_id: int):
    """
    *** SUDE Panzehir Testi (Dry-Run) ***
    Hiçbir veriyi güncellemez (commit/swap yapmaz), sadece gerçek şemayı,
    list_models çağrısını ve CEO beynini canlı ticket verisine karşı doğrular.
    """
    # 🧠 CEO servis fonksiyonunu dosyanın üstünde ya da burada içe aktarabilirsin
    from app.services.ceo import ceo_adjudicate_blocked_ticket

    async with SessionMaker() as s:
        # 1. Biletin varlığını doğrula (Şema okuma testi)
        ticket = await s.get(Ticket, ticket_id)
        if ticket is None:
            raise HTTPException(404, "ticket not found")
            
        # Bilet durumunun test için uygun olup olmadığını kontrol et
        if ticket.status not in ("blocked", "done"):
            raise HTTPException(
                status_code=409,
                detail=f"ticket durumu {ticket.status!r}; dry-run sadece blocked veya done biletlerde çalışır."
            )

        try:
            # 2. 🚀 BEYNİ GERÇEK VERİTABANI SESSION'I VE CANLI TICKET İLE TETİKLE
            # s.begin() açmıyoruz çünkü veritabanına hiçbir şey YAZMAYACAĞIZ (Read-Only).
            decision = await ceo_adjudicate_blocked_ticket(s, ticket_id=ticket_id)
            
            # 3. Temiz bir CeoDecision döndüyse her şey yolunda demektir
            return {
                "status": "success",
                "message": "*** SUDE Panzehir Testi *** Kontrol listesi başarıyla geçildi! Şema ve adaptörler uyumlu.",
                "ceo_decision": decision
            }
            
        except AttributeError as ae:
            # ❌ 1. Risk: Şemada bir alan ismi (phase_visit_count, assignee_agent_id vb.) yanlış!
            raise HTTPException(
                status_code=500,
                detail=f"ŞEMA HATASI: Babanın uyardığı alan adı uyuşmazlığı çıktı! AttributeError: {str(ae)}"
            )
            
        except Exception as e:
            # ❌ 2. Risk: adapter_cls.list_models() classmethod değilse veya RunPacket alanları uyumsuzsa
            raise HTTPException(
                status_code=500,
                detail=f"ADAPTER / CONFIG HATASI: list_models veya RunPacket yapısı patladı! Hata: {repr(e)}"
            )
