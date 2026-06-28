"""add tenant_agent_settings (tenant/user Workspace Agent overrides)

Adds the ``tenant_agent_settings`` table backing the gear-icon settings modal
in the Workspace Agent widget. One row per (tenant, user); ``user_id IS NULL``
is the tenant-wide default. ``settings`` stores the JSON ``AgentSettings``
envelope (generation params + optional system-prompt override).

Like the other feature-parity tables (0057), this is also created by the
startup ``Base.metadata.create_all()``; this migration exists for
record-keeping and environments that run ``alembic upgrade`` explicitly.

Revision ID: 0058
Revises: 0057
Create Date: 2026-06-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import reflection

revision: str = '0058'
down_revision: Union[str, Sequence[str], None] = '0057'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    tables = insp.get_table_names()

    if 'tenant_agent_settings' not in tables:
        op.create_table(
            'tenant_agent_settings',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('tenant_id', sa.String(length=36), nullable=True),
            sa.Column('user_id', sa.String(length=36), nullable=True),
            sa.Column('settings', sa.Text(), nullable=False),
            sa.Column('created_at', sa.String(length=50), nullable=False),
            sa.Column('updated_at', sa.String(length=50), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('tenant_id', 'user_id', name='uq_tenant_user_agent_settings'),
        )
        op.create_index('ix_tenant_agent_settings_tenant_id', 'tenant_agent_settings', ['tenant_id'])
        op.create_index('ix_tenant_agent_settings_user_id', 'tenant_agent_settings', ['user_id'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    tables = insp.get_table_names()

    if 'tenant_agent_settings' in tables:
        for idx in ('ix_tenant_agent_settings_user_id', 'ix_tenant_agent_settings_tenant_id'):
            try:
                if idx in [i['name'] for i in insp.get_indexes('tenant_agent_settings')]:
                    op.drop_index(idx, table_name='tenant_agent_settings')
            except Exception:
                pass
        try:
            op.drop_constraint('uq_tenant_user_agent_settings', 'tenant_agent_settings', type_='unique')
        except Exception:
            pass
        op.drop_table('tenant_agent_settings')
