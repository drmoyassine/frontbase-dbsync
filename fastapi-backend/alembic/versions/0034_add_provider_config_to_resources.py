"""Add provider_config column to edge_databases and edge_caches.

EdgeQueue already has this column. This aligns all three resource
tables for storing provider-specific metadata (e.g., scoped CF API
token IDs, CF account IDs) as JSON without per-provider column sprawl.

Revision ID: 0034_add_provider_config_to_resources
Revises: 0033_add_is_imported_to_edge_engines
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa


revision = '0034_add_provider_config_to_resources'
down_revision = '0033_add_is_imported_to_edge_engines'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('edge_databases', schema=None) as batch_op:
        batch_op.add_column(sa.Column('provider_config', sa.Text(), nullable=True))

    with op.batch_alter_table('edge_caches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('provider_config', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('edge_caches', schema=None) as batch_op:
        batch_op.drop_column('provider_config')

    with op.batch_alter_table('edge_databases', schema=None) as batch_op:
        batch_op.drop_column('provider_config')
