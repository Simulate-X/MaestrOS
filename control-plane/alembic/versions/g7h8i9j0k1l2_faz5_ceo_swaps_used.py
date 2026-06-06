"""faz5 ceo_swaps_used on tickets

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-05

Eklenenler:
  tickets: ceo_swaps_used INT NOT NULL DEFAULT 0
    Per-ticket CEO autonomous swap sayacı.
    ≥ 1 → ikinci hata halinde insan onayına iletilir (bounded autonomy).
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "g7h8i9j0k1l2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column(
            "ceo_swaps_used",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("tickets", "ceo_swaps_used")
