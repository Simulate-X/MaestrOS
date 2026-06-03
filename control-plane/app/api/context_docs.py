from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.db import SessionMaker
from app.models import ContextDocument

router = APIRouter(prefix="/context-docs", tags=["context-docs"])


# ── Schema ───────────────────────────────────────────────────────────────────

class ContextDocCreate(BaseModel):
    company_id: int
    name: str
    kind: str = "general"   # api_schema | style_guide | project_context | general
    body: str


class ContextDocRead(BaseModel):
    id: int
    company_id: int
    name: str
    kind: str
    body: str
    model_config = ConfigDict(from_attributes=True)


class ContextDocUpdate(BaseModel):
    kind: Optional[str] = None
    body: Optional[str] = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", response_model=ContextDocRead, status_code=201)
async def create_context_doc(data: ContextDocCreate):
    async with SessionMaker() as s:
        async with s.begin():
            doc = ContextDocument(**data.model_dump())
            s.add(doc)
            await s.flush()
    return doc


@router.get("", response_model=list[ContextDocRead])
async def list_context_docs(company_id: Optional[int] = None):
    async with SessionMaker() as s:
        q = select(ContextDocument)
        if company_id is not None:
            q = q.where(ContextDocument.company_id == company_id)
        return (await s.execute(q)).scalars().all()


@router.get("/{doc_id}", response_model=ContextDocRead)
async def get_context_doc(doc_id: int):
    async with SessionMaker() as s:
        doc = await s.get(ContextDocument, doc_id)
    if doc is None:
        raise HTTPException(404, "context document not found")
    return doc


@router.patch("/{doc_id}", response_model=ContextDocRead)
async def update_context_doc(doc_id: int, data: ContextDocUpdate):
    async with SessionMaker() as s:
        async with s.begin():
            doc = await s.get(ContextDocument, doc_id)
            if doc is None:
                raise HTTPException(404, "context document not found")
            if data.kind is not None:
                doc.kind = data.kind
            if data.body is not None:
                doc.body = data.body
    return doc


@router.delete("/{doc_id}", status_code=204)
async def delete_context_doc(doc_id: int):
    async with SessionMaker() as s:
        async with s.begin():
            doc = await s.get(ContextDocument, doc_id)
            if doc is None:
                raise HTTPException(404, "context document not found")
            await s.delete(doc)
