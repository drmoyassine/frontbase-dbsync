"""Add is_imported column to edge_engines.

Revision ID: 0033_add_is_imported_to_edge_engines
Revises: 0032_add_storage_providers
Create Date: 2026-03-14
"""
from alembic import op
import sqlalchemy as sa


revision = '0033_add_is_imported_to_edge_engines'
down_revision = '0032_add_storage_providers'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_imported', sa.Boolean(), nullable=True, server_default='0'))


def downgrade():
    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.drop_column('is_imported')
