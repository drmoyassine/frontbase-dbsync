"""add agent_credit_balances + agent_credit_usage_log tables

Per-tenant credit quota system for the Workspace Agent (cloud mode). Workspace
Agent turns (backend PydanticAI) draw from a per-tenant credit pool driven by the
plan's agent_credits_daily / agent_credits_monthly limits; Edge Agents are
unaffected (they run on the tenant's own providers).

Both tables are also created by the startup Base.metadata.create_all(); this
migration exists for record-keeping and environments that run alembic upgrade
explicitly.

Revision ID: 0056
Revises: 0055
Create Date: 2026-06-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import reflection

revision: str = '0056'
down_revision: Union[str, Sequence[str], None] = '0055'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    tables = insp.get_table_names()

    if 'agent_credit_balances' not in tables:
        op.create_table(
            'agent_credit_balances',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('tenant_id', sa.String(length=36), nullable=False),
            sa.Column('daily_credits_remaining', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('daily_credits_last_reset_at', sa.String(length=50), nullable=True),
            sa.Column('monthly_credits_remaining', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('monthly_credits_last_reset_at', sa.String(length=50), nullable=True),
            sa.Column('bonus_daily', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('bonus_monthly', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('total_consumed', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.String(length=50), nullable=False),
            sa.Column('updated_at', sa.String(length=50), nullable=False),
            sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('tenant_id'),
        )
        op.create_index('ix_agent_credit_balances_tenant_id', 'agent_credit_balances', ['tenant_id'])

    if 'agent_credit_usage_log' not in tables:
        op.create_table(
            'agent_credit_usage_log',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('tenant_id', sa.String(length=36), nullable=False),
            sa.Column('user_id', sa.String(length=36), nullable=False),
            sa.Column('pool_type', sa.String(length=20), nullable=False),
            sa.Column('use_type', sa.String(length=20), nullable=False),
            sa.Column('agent_profile', sa.String(length=50), nullable=True),
            sa.Column('provider_id', sa.String(length=36), nullable=True),
            sa.Column('model_id', sa.String(length=100), nullable=True),
            sa.Column('tokens_input', sa.Integer(), nullable=True),
            sa.Column('tokens_output', sa.Integer(), nullable=True),
            sa.Column('tool_calls_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('duration_ms', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.String(length=50), nullable=False),
            sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_agent_credit_usage_log_tenant_id', 'agent_credit_usage_log', ['tenant_id'])
        op.create_index('ix_agent_credit_usage_log_created_at', 'agent_credit_usage_log', ['created_at'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    tables = insp.get_table_names()

    if 'agent_credit_usage_log' in tables:
        try:
            op.drop_index('ix_agent_credit_usage_log_created_at', table_name='agent_credit_usage_log')
            op.drop_index('ix_agent_credit_usage_log_tenant_id', table_name='agent_credit_usage_log')
        except Exception:
            pass
        op.drop_table('agent_credit_usage_log')

    if 'agent_credit_balances' in tables:
        try:
            op.drop_index('ix_agent_credit_balances_tenant_id', table_name='agent_credit_balances')
        except Exception:
            pass
        op.drop_table('agent_credit_balances')
