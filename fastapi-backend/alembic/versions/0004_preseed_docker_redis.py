"""Pre-seed Docker Redis defaults

Revision ID: 0004_preseed_docker_redis
Revises: 0003_redis_settings_columns
Create Date: 2026-01-18 00:32:00

This migration pre-seeds Redis configuration for out-of-box Docker setup.
Runs separately since 0003 may have already been applied before pre-seed logic was added.
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
    """Pre-seed Docker Redis defaults if not already configured."""
    conn = op.get_bind()
    
    # Check current settings
    result = conn.execute(sa.text("SELECT id, redis_url, redis_enabled FROM project_settings LIMIT 1"))
    row = result.fetchone()
    
    if row:
        settings_id, redis_url, redis_enabled = row
        # Only seed if not already configured
        if not redis_url or not redis_enabled:
            conn.execute(sa.text("""
                UPDATE project_settings SET
                    redis_url = 'http://redis-http:80',
                    redis_token = 'dev_token_change_in_prod',
                    redis_type = 'self-hosted',
                    redis_enabled = 1
                WHERE id = :id
            """), {"id": settings_id})
            print("[Migration 0004] Pre-seeded Docker Redis defaults (redis-http:80)")
        else:
            print(f"[Migration 0004] Redis already configured: {redis_url}")
    else:
        print("[Migration 0004] No project_settings record found")


def downgrade() -> None:
    """Clear Redis settings (optional - usually not needed)."""
    pass
