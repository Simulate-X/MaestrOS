from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.db import SessionMaker
from app.models import Workflow, Phase
from app.services.workflow_loader import load_workflow_from_yaml

router = APIRouter(prefix="/workflows", tags=["workflows"])


# ── Request / Response schema'ları ──────────────────────────────────────────

class WorkflowLoadIn(BaseModel):
    company_id: int
    yaml_text: str


class PhaseRead(BaseModel):
    id: int
    ordinal: int
    name: str
    skill_id: int
    gate: str
    next_phase_id: Optional[int]
    default_context_doc_names: list
    max_reworks: Optional[int] = None
    branch_on_verdict: dict = {}
    default_verdict: str = "approve"
    model_config = ConfigDict(from_attributes=True)


class WorkflowRead(BaseModel):
    id: int
    company_id: int
    name: str
    version: str
    description: Optional[str]
    phases: list[PhaseRead] = []
    model_config = ConfigDict(from_attributes=True)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/load")
async def load_workflow(payload: WorkflowLoadIn):
    """YAML metnini parse edip DB'ye yükler. Aynı isimde workflow varsa günceller."""
    try:
        async with SessionMaker() as s:
            wf = await load_workflow_from_yaml(s, payload.company_id, payload.yaml_text)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"workflow_id": wf.id, "name": wf.name, "version": wf.version}


@router.get("", response_model=list[WorkflowRead])
async def list_workflows():
    async with SessionMaker() as s:
        workflows = (await s.execute(select(Workflow))).scalars().all()
        # Phase'leri her workflow için ayrı yükle
        result = []
        for wf in workflows:
            phases = (await s.execute(
                select(Phase)
                .where(Phase.workflow_id == wf.id)
                .order_by(Phase.ordinal)
            )).scalars().all()
            wf_data = WorkflowRead(
                id=wf.id,
                company_id=wf.company_id,
                name=wf.name,
                version=wf.version,
                description=wf.description,
                phases=[PhaseRead.model_validate(p) for p in phases],
            )
            result.append(wf_data)
    return result


@router.get("/{wf_id}", response_model=WorkflowRead)
async def get_workflow(wf_id: int):
    async with SessionMaker() as s:
        wf = await s.get(Workflow, wf_id)
        if wf is None:
            raise HTTPException(404, "workflow not found")
        phases = (await s.execute(
            select(Phase)
            .where(Phase.workflow_id == wf_id)
            .order_by(Phase.ordinal)
        )).scalars().all()

    return WorkflowRead(
        id=wf.id,
        company_id=wf.company_id,
        name=wf.name,
        version=wf.version,
        description=wf.description,
        phases=[PhaseRead.model_validate(p) for p in phases],
    )
