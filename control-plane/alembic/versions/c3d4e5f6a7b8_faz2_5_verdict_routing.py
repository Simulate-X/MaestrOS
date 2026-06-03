"""faz2.5 verdict routing

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-29

Eklenenler:
  tickets: parent_ticket_id (self-ref FK), phase_visit_count (JSONB), blocked_reason (Text)
  phases:  max_reworks (Integer), branch_on_verdict (JSONB)
  status enum: 'blocked' eklendi (string-based, data migration yok)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── tickets ──────────────────────────────────────────────────────────────
    op.add_column(
        "tickets",
        sa.Column("parent_ticket_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "tickets",
        sa.Column(
            "phase_visit_count",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "tickets",
        sa.Column("blocked_reason", sa.Text(), nullable=True),
    )
    op.create_foreign_key(
        "fk_tickets_parent_ticket_id",
        "tickets", "tickets",
        ["parent_ticket_id"], ["id"],
    )

    # ── phases ────────────────────────────────────────────────────────────────
    op.add_column(
        "phases",
        sa.Column("max_reworks", sa.Integer(), nullable=True),
    )
    op.add_column(
        "phases",
        sa.Column(
            "branch_on_verdict",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("phases", "branch_on_verdict")
    op.drop_column("phases", "max_reworks")
    op.drop_constraint("fk_tickets_parent_ticket_id", "tickets", type_="foreignkey")
    op.drop_column("tickets", "blocked_reason")
    op.drop_column("tickets", "phase_visit_count")
    op.drop_column("tickets", "parent_ticket_id")
