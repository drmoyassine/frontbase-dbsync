"""Pre-seed Docker Redis defaults

Revision ID: 0004_preseed_docker_redis
Revises: 0003_redis_settings_columns
Create Date: 2026-01-18 00:32:00

This migration pre-seeds Redis configuration for out-of-box Docker setup.
Note: If project_settings doesn't exist yet, migration 0005 handles it.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0004_preseed_docker_redis'
down_revision: Union[str, None] = '0003_redis_settings_columns'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Pre-seed Docker Redis defaults if record exists."""
    conn = op.get_bind()
    
    # Check if project_settings record exists
    result = conn.execute(sa.text("SELECT id, redis_url, redis_enabled FROM project_settings LIMIT 1"))
    row = result.fetchone()
    
    if row:
        settings_id, redis_url, redis_enabled = row
        # Only seed if not already configured
        if not redis_url or not redis_enabled:
            dialect = conn.dialect.name
            true_val = '1' if dialect == 'sqlite' else 'true'
            
            conn.execute(sa.text(f"""
                UPDATE project_settings SET
                    redis_url = 'http://redis-http:80',
                    redis_token = 'dev_token_change_in_prod',
                    redis_type = 'self-hosted',
                    redis_enabled = {true_val}
                WHERE id = :id
            """), {"id": settings_id})
            print("[Migration 0004] Pre-seeded Docker Redis defaults")
        else:
            print(f"[Migration 0004] Redis already configured: {redis_url}")
    else:
        # Record doesn't exist - migration 0005 will handle it
        print("[Migration 0004] No project_settings yet - 0005 will create it")


def downgrade() -> None:
    """Nothing to do."""
    pass
