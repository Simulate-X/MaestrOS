from datetime import datetime
from typing import Optional
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy import String, Text, Integer, Numeric, ForeignKey, DateTime, func, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB, ARRAY


class Base(DeclarativeBase):
    pass


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Faz 4.2: company-level budget
    budget_usd_limit: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 4), nullable=True
    )
    budget_period: Mapped[str] = mapped_column(
        String(50), nullable=False, default="monthly", server_default="monthly"
    )


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0")
    markdown_body: Mapped[str] = mapped_column(Text, nullable=False)


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="ollama")
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    default_skill_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("skills.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    # Faz 4.1: budget enforcement
    budget_usd_limit: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 4), nullable=True
    )  # null = sınırsız (mevcut davranış korunur)
    paused_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Faz 4.2: period + org chart
    budget_period: Mapped[str] = mapped_column(
        String(50), nullable=False, default="monthly", server_default="monthly"
    )
    reporting_to: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("agents.id"), nullable=True
    )


class ContextDocument(Base):
    """Yeniden kullanılabilir bağlam belgeleri (API schema, stil kılavuzu, vb.)."""
    __tablename__ = "context_documents"
    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_context_documents_company_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(100), nullable=False)  # api_schema | style_guide | project_context | general
    body: Mapped[str] = mapped_column(Text, nullable=False)


class Workflow(Base):
    """Çok aşamalı ajan iş akışı tanımı (YAML kaynaklı)."""
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False, default="0.1")
    yaml_source: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class Phase(Base):
    """Workflow'un sıralı tek adımı."""
    __tablename__ = "phases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workflow_id: Mapped[int] = mapped_column(Integer, ForeignKey("workflows.id"), nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)   # "plan", "build", …
    skill_id: Mapped[int] = mapped_column(Integer, ForeignKey("skills.id"), nullable=False)
    gate: Mapped[str] = mapped_column(String(50), nullable=False)     # "auto" | "human_approval"
    next_phase_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("phases.id"), nullable=True
    )
    # Role'ün + phase'in context_refs birleşimi — loader tarafından yazılır
    default_context_doc_names: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # Faz 2.5: loop limit + verdict-aware routing
    max_reworks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    branch_on_verdict: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=sa.text("'{}'::jsonb")
    )
    # Faz 2.6: forward yolunu işaret eden verdict adı ("approve", "ship", ...)
    default_verdict: Mapped[str] = mapped_column(
        String(100), nullable=False, default="approve", server_default="approve"
    )


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    assignee_agent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("agents.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="queued")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    owner_agent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("agents.id"), nullable=True
    )
    locked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Faz 2: workflow chain
    workflow_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("workflows.id"), nullable=True
    )
    current_phase_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("phases.id", ondelete="SET NULL"), nullable=True
    )
    # Faz 2: context injection — bu ticket'a enjekte edilecek ContextDocument id'leri
    context_doc_ids: Mapped[list] = mapped_column(
        ARRAY(Integer), nullable=False, default=list, server_default=sa.text("{}")
    )
    # Faz 2.5: chain tracing + verdict routing
    parent_ticket_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("tickets.id"), nullable=True
    )
    phase_visit_count: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=sa.text("'{}'::jsonb")
    )
    blocked_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Faz 5: CEO autonomous swap sayacı (bounded autonomy — max 1 CEO swap per ticket)
    ceo_swaps_used: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id"), nullable=False)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    work_product: Mapped[str] = mapped_column(Text, nullable=False, default="")
    logs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    cost_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, default=Decimal("0"))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class AuditEvent(Base):
    """Append-only immutable audit log. UPDATE / DELETE never issued against this table.
    target_label is intentionally denormalized — snapshot of the name at event time."""
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    actor_kind: Mapped[str] = mapped_column(String, nullable=False)    # operator | agent | system
    actor_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # agent.id when actor==agent
    actor_label: Mapped[str] = mapped_column(String, nullable=False)   # "operator" | "scheduler" | "budget" | agent.title
    action: Mapped[str] = mapped_column(String, nullable=False, index=True)
    target_kind: Mapped[str] = mapped_column(String, nullable=False)   # ticket | agent | company
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    target_label: Mapped[str] = mapped_column(String, nullable=False)  # DENORMALIZED snapshot
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    company_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("companies.id"), nullable=True, index=True
    )
