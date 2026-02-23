"""Add deployment_targets table

Revision ID: 0017_add_deployment_targets
Revises: 0016_fix_last_updated
Create Date: 2026-02-24

Adds the deployment_targets table for registering edge provider endpoints.
Used by the publish pipeline to push pages to multiple edge deployments.
LB-ready: future sprint adds weight/quota columns to this table.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '0017_add_deployment_targets'
down_revision = '0016_fix_last_updated'
branch_labels = None
depends_on = None


def upgrade():
    """Create deployment_targets table."""
    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()

    if 'deployment_targets' not in tables:
        op.create_table('deployment_targets',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('provider', sa.String(50), nullable=False),
            sa.Column('adapter_type', sa.String(20), nullable=False),
            sa.Column('url', sa.String(500), nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='1'),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
        )


def downgrade():
    """Drop deployment_targets table."""
    op.drop_table('deployment_targets')
