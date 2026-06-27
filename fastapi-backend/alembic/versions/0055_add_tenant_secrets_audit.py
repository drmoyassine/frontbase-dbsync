"""add tenant_secrets_audit table

Centralized audit trail of tenant-secrets operations (push / delete / rotate) on
shared/community edge engines. The control plane is the authority for tenant
secrets, so this record lives in the backend DB (not the worker state-DB) to
survive worker redeployments and give a unified, multi-tenant view.

The table is also created by the startup Base.metadata.create_all(); this
migration exists for record-keeping and environments that run alembic upgrade
explicitly.

Revision ID: 0055
Revises: 0054
Create Date: 2026-06-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import reflection

revision: str = '0055'
down_revision: Union[str, Sequence[str], None] = '0054'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    tables = insp.get_table_names()

    if 'tenant_secrets_audit' not in tables:
        op.create_table(
            'tenant_secrets_audit',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('operation', sa.String(length=50), nullable=False),
            sa.Column('tenant_slug', sa.String(length=100), nullable=False),
            sa.Column('kind', sa.String(length=50), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('error_message', sa.String(length=500), nullable=True),
            sa.Column('engine_id', sa.String(length=36), nullable=True),
            sa.Column('initiated_by', sa.String(length=50), nullable=False),
            sa.Column('initiated_by_user_id', sa.String(length=36), nullable=True),
            sa.Column('timestamp', sa.String(length=50), nullable=False),
            sa.Column('audit_metadata', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(['engine_id'], ['edge_engines.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_tenant_secrets_audit_tenant_slug', 'tenant_secrets_audit', ['tenant_slug', 'timestamp'])
        op.create_index('ix_tenant_secrets_audit_engine_id', 'tenant_secrets_audit', ['engine_id', 'timestamp'])
        op.create_index('ix_tenant_secrets_audit_operation', 'tenant_secrets_audit', ['operation'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    tables = insp.get_table_names()

    if 'tenant_secrets_audit' in tables:
        try:
            op.drop_index('ix_tenant_secrets_audit_operation', table_name='tenant_secrets_audit')
            op.drop_index('ix_tenant_secrets_audit_engine_id', table_name='tenant_secrets_audit')
            op.drop_index('ix_tenant_secrets_audit_tenant_slug', table_name='tenant_secrets_audit')
        except Exception:
            pass
        op.drop_table('tenant_secrets_audit')
