"""Add plans and plan_change_requests tables (admin-configurable tiers).

Also merges the two pre-existing alembic heads so ``upgrade head`` resolves.

Revision ID: 0046
Revises: 109656903947, f25be2c47890
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '0046'
down_revision = ('109656903947', 'f25be2c47890')
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()

    if 'plans' not in existing:
        op.create_table(
            'plans',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('slug', sa.String(length=50), nullable=False, unique=True),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('infra_mode', sa.String(length=20), server_default='byo'),
            sa.Column('price_display', sa.String(length=50), nullable=True),
            sa.Column('price_period', sa.String(length=50), nullable=True),
            sa.Column('limits', sa.Text(), nullable=True),
            sa.Column('features', sa.Text(), nullable=True),
            sa.Column('is_public', sa.Boolean(), server_default='0'),
            sa.Column('is_active', sa.Boolean(), server_default='1'),
            sa.Column('is_default', sa.Boolean(), server_default='0'),
            sa.Column('highlighted', sa.Boolean(), server_default='0'),
            sa.Column('badge', sa.String(length=50), nullable=True),
            sa.Column('sort_order', sa.Integer(), server_default='0'),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
        )

    if 'plan_change_requests' not in existing:
        op.create_table(
            'plan_change_requests',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('tenant_id', sa.String(), nullable=False),
            sa.Column('from_plan', sa.String(length=50), nullable=False),
            sa.Column('to_plan', sa.String(length=50), nullable=False),
            sa.Column('direction', sa.String(length=20), nullable=False),
            sa.Column('status', sa.String(length=20), server_default='pending'),
            sa.Column('note', sa.Text(), nullable=True),
            sa.Column('admin_note', sa.Text(), nullable=True),
            sa.Column('requested_by', sa.String(), nullable=False),
            sa.Column('reviewed_by', sa.String(), nullable=True),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('reviewed_at', sa.String(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()
    if 'plan_change_requests' in existing:
        op.drop_table('plan_change_requests')
    if 'plans' in existing:
        op.drop_table('plans')
