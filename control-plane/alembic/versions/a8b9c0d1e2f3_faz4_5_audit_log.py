"""faz4_5 audit_log table

Revision ID: a8b9c0d1e2f3
Revises: f6a7b8c9d0e1
Create Date: 2026-06-02

Append-only audit event log.  UPDATE / DELETE intentionally never issued against this table.
"""
from alembic import op
import sqlalchemy as sa

revision = 'a8b9c0d1e2f3'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'audit_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column(
            'ts',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('actor_kind', sa.String(), nullable=False),   # operator | agent | system
        sa.Column('actor_id', sa.Integer(), nullable=True),     # agent.id when actor_kind=="agent"
        sa.Column('actor_label', sa.String(), nullable=False),  # "operator" | "scheduler" | "budget" | agent title
        sa.Column('action', sa.String(), nullable=False),       # free string — no enum constraint
        sa.Column('target_kind', sa.String(), nullable=False),  # ticket | agent | company
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('target_label', sa.String(), nullable=False), # DENORMALIZED snapshot (immutable)
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_audit_log_ts', 'audit_log', ['ts'])
    op.create_index('ix_audit_log_action', 'audit_log', ['action'])
    op.create_index('ix_audit_log_company_id', 'audit_log', ['company_id'])


def downgrade() -> None:
    op.drop_index('ix_audit_log_company_id', table_name='audit_log')
    op.drop_index('ix_audit_log_action', table_name='audit_log')
    op.drop_index('ix_audit_log_ts', table_name='audit_log')
    op.drop_table('audit_log')
