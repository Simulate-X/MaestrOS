"""faz4.1 budgets and pause

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-29

Eklenenler:
  agents: budget_usd_limit (Numeric 10,4, nullable), paused_reason (Text, nullable)
  status enum'a 'paused' zaten var — sadece anlam genişlemesi; data migration yok.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("budget_usd_limit", sa.Numeric(10, 4), nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column("paused_reason", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("agents", "paused_reason")
    op.drop_column("agents", "budget_usd_limit")
