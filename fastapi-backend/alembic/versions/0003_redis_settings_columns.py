"""Add redis_token and redis_type columns to project_settings

Revision ID: 0003_redis_settings_columns
Revises: 0002_sync_schema
Create Date: 2026-01-18 00:11:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '0003_redis_settings_columns'
down_revision: Union[str, None] = '0002_sync_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add redis_token and redis_type columns to project_settings."""
    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()

    if 'project_settings' not in tables:
        # Table missing (e.g. skipped in 0001), create it now with all columns
        op.create_table('project_settings',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('redis_url', sa.String(512), nullable=True),
            sa.Column('redis_token', sa.String(512), nullable=True),
            sa.Column('redis_type', sa.String(32), nullable=False, server_default='upstash'),
            sa.Column('redis_enabled', sa.Boolean(), server_default='false'),
            sa.Column('cache_ttl_data', sa.Integer(), server_default='60'),
            sa.Column('cache_ttl_count', sa.Integer(), server_default='300'),
            sa.Column('updated_at', sa.DateTime(timezone=True))
        )
    else:
        # Table exists, check for columns
        existing_cols = {col['name'] for col in inspector.get_columns('project_settings')}
        
        if 'redis_token' not in existing_cols:
            op.add_column('project_settings', 
                sa.Column('redis_token', sa.String(512), nullable=True)
            )
        
        if 'redis_type' not in existing_cols:
            op.add_column('project_settings', 
                sa.Column('redis_type', sa.String(32), nullable=False, server_default='self-hosted')
            )


def downgrade() -> None:
    """Remove redis_token and redis_type columns from project_settings."""
    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()
    
    if 'project_settings' in tables:
        # We can't easily distinguish if we created the table or just added columns.
        # Strict downgrade would drop columns.
        op.drop_column('project_settings', 'redis_type')
        op.drop_column('project_settings', 'redis_token')
