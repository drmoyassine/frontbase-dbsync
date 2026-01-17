"""Add redis_token and redis_type columns to project_settings

Revision ID: 0003_redis_settings_columns
Revises: 0002_sync_schema_updates
Create Date: 2026-01-18 00:11:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003_redis_settings_columns'
down_revision: Union[str, None] = '0002_sync_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add redis_token and redis_type columns to project_settings."""
    # Check if columns already exist (safe for re-runs)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = {col['name'] for col in inspector.get_columns('project_settings')}
    
    if 'redis_token' not in existing_cols:
        op.add_column('project_settings', 
            sa.Column('redis_token', sa.String(512), nullable=True)
        )
    
    if 'redis_type' not in existing_cols:
        op.add_column('project_settings', 
            sa.Column('redis_type', sa.String(32), nullable=False, server_default='upstash')
        )


def downgrade() -> None:
    """Remove redis_token and redis_type columns from project_settings."""
    op.drop_column('project_settings', 'redis_type')
    op.drop_column('project_settings', 'redis_token')
