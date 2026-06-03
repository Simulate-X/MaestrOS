"""faz2 workflow context

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-29

Eklenenler:
  - context_documents tablosu
  - workflows tablosu
  - phases tablosu (self-referential next_phase_id)
  - tickets tablosuna: workflow_id, current_phase_id, context_doc_ids
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, ARRAY

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) context_documents
    op.create_table(
        "context_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(100), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "name", name="uq_context_documents_company_name"),
    )

    # 2) workflows
    op.create_table(
        "workflows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("yaml_source", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 3) phases (self-referential FK for next_phase_id added after table creation)
    op.create_table(
        "phases",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workflow_id", sa.Integer(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("skill_id", sa.Integer(), nullable=False),
        sa.Column("gate", sa.String(50), nullable=False),
        sa.Column("next_phase_id", sa.Integer(), nullable=True),
        sa.Column("default_context_doc_names", JSONB(), nullable=False, server_default="[]"),
        sa.ForeignKeyConstraint(["workflow_id"], ["workflows.id"]),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    # Self-referential FK ayrı eklenir (tablo var olduktan sonra)
    op.create_foreign_key(
        "fk_phases_next_phase_id",
        "phases", "phases",
        ["next_phase_id"], ["id"],
    )

    # 4) tickets tablosuna yeni kolonlar
    op.add_column("tickets", sa.Column("workflow_id", sa.Integer(), nullable=True))
    op.add_column("tickets", sa.Column("current_phase_id", sa.Integer(), nullable=True))
    op.add_column(
        "tickets",
        sa.Column(
            "context_doc_ids",
            ARRAY(sa.Integer()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.create_foreign_key(
        "fk_tickets_workflow_id",
        "tickets", "workflows",
        ["workflow_id"], ["id"],
    )
    op.create_foreign_key(
        "fk_tickets_current_phase_id",
        "tickets", "phases",
        ["current_phase_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_tickets_current_phase_id", "tickets", type_="foreignkey")
    op.drop_constraint("fk_tickets_workflow_id", "tickets", type_="foreignkey")
    op.drop_column("tickets", "context_doc_ids")
    op.drop_column("tickets", "current_phase_id")
    op.drop_column("tickets", "workflow_id")
    op.drop_constraint("fk_phases_next_phase_id", "phases", type_="foreignkey")
    op.drop_table("phases")
    op.drop_table("workflows")
    op.drop_table("context_documents")
