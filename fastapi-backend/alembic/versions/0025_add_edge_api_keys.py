"""Add edge_api_keys table for tenant API key management.

Revision ID: 0025_add_edge_api_keys
Revises: 0024_add_edge_gpu_models
"""
from alembic import op
import sqlalchemy as sa

revision = '0025_add_edge_api_keys'
down_revision = '0024_add_edge_gpu_models'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name
    now_func = "datetime('now')" if dialect == 'sqlite' else "NOW()"

    # Check if table already exists (idempotent)
    inspector = sa.inspect(conn)
    if 'edge_api_keys' in inspector.get_table_names():
        return

    op.create_table(
        'edge_api_keys',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('prefix', sa.String(20), nullable=False),
        sa.Column('key_hash', sa.String(128), nullable=False),
        sa.Column('edge_engine_id', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='1'),
        sa.Column('expires_at', sa.String(), nullable=True),
        sa.Column('last_used_at', sa.String(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['edge_engine_id'], ['edge_engines.id']),
        sa.UniqueConstraint('key_hash'),
    )


def downgrade():
    op.drop_table('edge_api_keys')
