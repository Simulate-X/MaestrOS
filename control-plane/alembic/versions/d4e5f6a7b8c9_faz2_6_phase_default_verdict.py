"""faz2.6 phase default_verdict

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-29

Eklenenler:
  phases: default_verdict (String, NOT NULL, server_default='approve')
  Mevcut Phase satırları "approve" default'u alır — review için zaten doğru.
  Ship phase'i workflow reload anında "ship"e set edilir.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "phases",
        sa.Column(
            "default_verdict",
            sa.String(100),
            nullable=False,
            server_default="approve",
        ),
    )


def downgrade() -> None:
    op.drop_column("phases", "default_verdict")
