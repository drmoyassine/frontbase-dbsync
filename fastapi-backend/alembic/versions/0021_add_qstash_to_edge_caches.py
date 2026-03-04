"""Add QStash columns to edge_caches

Revision ID: 0021_add_qstash_to_edge_caches
Revises: 0020_add_provider_config
Create Date: 2026-03-03

Adds QStash credentials to EdgeCache for durable workflow execution.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '0021_add_qstash_to_edge_caches'
down_revision = ('0020_add_provider_config', '109656903947')
branch_labels = None
depends_on = None


def upgrade():
    """Add QStash columns to edge_caches."""
    conn = op.get_bind()
    inspector = inspect(conn)

    columns = [c['name'] for c in inspector.get_columns('edge_caches')]
    
    new_cols = {
        'qstash_url': sa.Column('qstash_url', sa.String(500), nullable=True),
        'qstash_token': sa.Column('qstash_token', sa.String(1000), nullable=True),
        'qstash_signing_key': sa.Column('qstash_signing_key', sa.String(500), nullable=True),
        'qstash_next_signing_key': sa.Column('qstash_next_signing_key', sa.String(500), nullable=True),
    }

    for col_name, col_def in new_cols.items():
        if col_name not in columns:
            op.add_column('edge_caches', col_def)
            print(f"[Migration 0021] Added {col_name} to edge_caches")
        else:
            print(f"[Migration 0021] {col_name} already exists, skipping")


def downgrade():
    """Remove QStash columns."""
    for col_name in ['qstash_url', 'qstash_token', 'qstash_signing_key', 'qstash_next_signing_key']:
        op.drop_column('edge_caches', col_name)
