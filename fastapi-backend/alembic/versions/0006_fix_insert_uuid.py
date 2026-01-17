"""Fix INSERT with UUID for project_settings

Revision ID: 0006_fix_insert_uuid
Revises: 0005_fix_preseed_insert
Create Date: 2026-01-18 00:45:00

Migration 0005 failed because id column needs UUID.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import uuid


# revision identifiers, used by Alembic.
revision: str = '0006_fix_insert_uuid'
down_revision: Union[str, None] = '0005_fix_preseed_insert'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create project_settings with UUID if missing."""
    conn = op.get_bind()
    
    result = conn.execute(sa.text("SELECT id FROM project_settings LIMIT 1"))
    row = result.fetchone()
    
    if not row:
        new_id = str(uuid.uuid4())
        conn.execute(sa.text("""
            INSERT INTO project_settings (
                id, redis_url, redis_token, redis_type, redis_enabled, 
                cache_ttl_data, cache_ttl_count
            ) VALUES (
                :id, 'http://redis-http:80', 'dev_token_change_in_prod', 'self-hosted', 1,
                60, 300
            )
        """), {"id": new_id})
        print(f"[Migration 0006] Created project_settings with id={new_id}")
    else:
        print("[Migration 0006] project_settings already exists")


def downgrade() -> None:
    pass
