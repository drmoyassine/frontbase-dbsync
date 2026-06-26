"""add security_events table

Records security-relevant events (blocked SSRF attempts, upstream auth failures,
credential-resolution failures) for monitoring and auditing. The table is also
created by the startup Base.metadata.create_all(); this migration exists for
record-keeping and environments that run alembic upgrade explicitly.

Revision ID: 0054
Revises: 0053
Create Date: 2026-06-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import reflection

revision: str = '0054'
down_revision: Union[str, Sequence[str], None] = '0053'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    tables = insp.get_table_names()

    if 'security_events' not in tables:
        op.create_table(
            'security_events',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('event_type', sa.String(length=80), nullable=False),
            sa.Column('severity', sa.String(length=20), nullable=False),
            sa.Column('tenant_id', sa.String(length=36), nullable=True),
            sa.Column('project_id', sa.String(length=36), nullable=True),
            sa.Column('user_id', sa.String(length=36), nullable=True),
            sa.Column('source_ip', sa.String(length=64), nullable=True),
            sa.Column('details', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.String(length=50), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_security_events_event_type', 'security_events', ['event_type'])
        op.create_index('ix_security_events_tenant_id', 'security_events', ['tenant_id'])
        op.create_index('ix_security_events_created_at', 'security_events', ['created_at'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    tables = insp.get_table_names()

    if 'security_events' in tables:
        try:
            op.drop_index('ix_security_events_created_at', table_name='security_events')
            op.drop_index('ix_security_events_tenant_id', table_name='security_events')
            op.drop_index('ix_security_events_event_type', table_name='security_events')
        except Exception:
            pass
        op.drop_table('security_events')
