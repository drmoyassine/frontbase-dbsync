"""Fix pre-seed: Create project_settings if missing

Revision ID: 0005_fix_preseed_insert
Revises: 0004_preseed_docker_redis
Create Date: 2026-01-18 00:40:00

Migration 0004 failed because project_settings didn't exist.
This migration creates the record if missing and sets Redis defaults.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005_fix_preseed_insert'
down_revision: Union[str, None] = '0004_preseed_docker_redis'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create project_settings record with Redis defaults if missing."""
    conn = op.get_bind()
    
    # Check if project_settings record exists
    result = conn.execute(sa.text("SELECT id, redis_url, redis_enabled FROM project_settings LIMIT 1"))
    row = result.fetchone()
    
    if not row:
        # Create project_settings record with Redis defaults
        conn.execute(sa.text("""
            INSERT INTO project_settings (
                redis_url, redis_token, redis_type, redis_enabled, 
                cache_ttl_data, cache_ttl_count
            ) VALUES (
                'http://redis-http:80', 'dev_token_change_in_prod', 'self-hosted', 1,
                60, 300
            )
        """))
        print("[Migration 0005] Created project_settings with Docker Redis defaults")
    else:
        settings_id, redis_url, redis_enabled = row
        # Update if not already configured
        if not redis_url or not redis_enabled:
            conn.execute(sa.text("""
                UPDATE project_settings SET
                    redis_url = 'http://redis-http:80',
                    redis_token = 'dev_token_change_in_prod',
                    redis_type = 'self-hosted',
                    redis_enabled = 1
                WHERE id = :id
            """), {"id": settings_id})
            print("[Migration 0005] Pre-seeded Docker Redis defaults")
        else:
            print(f"[Migration 0005] Redis already configured: {redis_url}")


def downgrade() -> None:
    """Nothing to do - leave settings as-is."""
    pass
