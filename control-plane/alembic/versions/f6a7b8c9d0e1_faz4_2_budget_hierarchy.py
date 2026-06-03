"""faz4.2 budget hierarchy

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-01

Eklenenler:
  agents: reporting_to (self-ref FK, nullable), budget_period (String, server_default='monthly')
  companies: budget_usd_limit (Numeric 10,4, nullable), budget_period (String, server_default='monthly')

Tüm yeni kolonlar nullable veya server_default'lu — mevcut data bozulmaz, 4.1 davranışı korunur.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── agents ───────────────────────────────────────────────────────────────
    op.add_column(
        "agents",
        sa.Column("reporting_to", sa.Integer(), nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column(
            "budget_period",
            sa.String(50),
            nullable=False,
            server_default="monthly",
        ),
    )
    op.create_foreign_key(
        "fk_agents_reporting_to",
        "agents", "agents",
        ["reporting_to"], ["id"],
    )

    # ── companies ────────────────────────────────────────────────────────────
    op.add_column(
        "companies",
        sa.Column("budget_usd_limit", sa.Numeric(10, 4), nullable=True),
    )
    op.add_column(
        "companies",
        sa.Column(
            "budget_period",
            sa.String(50),
            nullable=False,
            server_default="monthly",
        ),
    )


def downgrade() -> None:
    op.drop_column("companies", "budget_period")
    op.drop_column("companies", "budget_usd_limit")
    op.drop_constraint("fk_agents_reporting_to", "agents", type_="foreignkey")
    op.drop_column("agents", "budget_period")
    op.drop_column("agents", "reporting_to")
