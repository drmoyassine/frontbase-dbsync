"""Sync Schema Updates - Add missing columns to sync tables

Revision ID: 0002_sync_schema
Revises: 0001_frontbase_core
Create Date: 2026-01-17

This migration adds columns that were added to the sync models
but not included in the original migration.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002_sync_schema'
down_revision: Union[str, Sequence[str], None] = '0001_frontbase_core'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a SQLite table."""
    result = conn.execute(sa.text(f"PRAGMA table_info({table_name})"))
    columns = [row[1] for row in result.fetchall()]
    return column_name in columns


def upgrade() -> None:
    """Add missing columns to sync tables."""
    conn = op.get_bind()
    
    # ============================
    # sync_configs table updates
    # ============================
    
    if not column_exists(conn, 'sync_configs', 'description'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN description TEXT")
    
    if not column_exists(conn, 'sync_configs', 'master_datasource_id'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN master_datasource_id TEXT")
    
    if not column_exists(conn, 'sync_configs', 'slave_datasource_id'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN slave_datasource_id TEXT")
    
    if not column_exists(conn, 'sync_configs', 'master_view_id'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN master_view_id TEXT")
    
    if not column_exists(conn, 'sync_configs', 'slave_view_id'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN slave_view_id TEXT")
    
    if not column_exists(conn, 'sync_configs', 'master_table'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN master_table TEXT")
    
    if not column_exists(conn, 'sync_configs', 'slave_table'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN slave_table TEXT")
    
    if not column_exists(conn, 'sync_configs', 'master_pk_column'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN master_pk_column TEXT DEFAULT 'id'")
    
    if not column_exists(conn, 'sync_configs', 'slave_pk_column'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN slave_pk_column TEXT DEFAULT 'id'")
    
    if not column_exists(conn, 'sync_configs', 'conflict_strategy'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN conflict_strategy TEXT DEFAULT 'source_wins'")
    
    if not column_exists(conn, 'sync_configs', 'webhook_url'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN webhook_url TEXT")
    
    if not column_exists(conn, 'sync_configs', 'is_active'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN is_active INTEGER DEFAULT 1")
    
    if not column_exists(conn, 'sync_configs', 'sync_deletes'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN sync_deletes INTEGER DEFAULT 0")
    
    if not column_exists(conn, 'sync_configs', 'batch_size'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN batch_size INTEGER DEFAULT 100")
    
    if not column_exists(conn, 'sync_configs', 'cron_schedule'):
        op.execute("ALTER TABLE sync_configs ADD COLUMN cron_schedule TEXT")
    
    # ============================
    # sync_jobs table updates
    # ============================
    
    if not column_exists(conn, 'sync_jobs', 'total_records'):
        op.execute("ALTER TABLE sync_jobs ADD COLUMN total_records INTEGER DEFAULT 0")
    
    if not column_exists(conn, 'sync_jobs', 'processed_records'):
        op.execute("ALTER TABLE sync_jobs ADD COLUMN processed_records INTEGER DEFAULT 0")
    
    if not column_exists(conn, 'sync_jobs', 'inserted_records'):
        op.execute("ALTER TABLE sync_jobs ADD COLUMN inserted_records INTEGER DEFAULT 0")
    
    if not column_exists(conn, 'sync_jobs', 'updated_records'):
        op.execute("ALTER TABLE sync_jobs ADD COLUMN updated_records INTEGER DEFAULT 0")
    
    if not column_exists(conn, 'sync_jobs', 'deleted_records'):
        op.execute("ALTER TABLE sync_jobs ADD COLUMN deleted_records INTEGER DEFAULT 0")
    
    if not column_exists(conn, 'sync_jobs', 'conflict_count'):
        op.execute("ALTER TABLE sync_jobs ADD COLUMN conflict_count INTEGER DEFAULT 0")
    
    if not column_exists(conn, 'sync_jobs', 'error_count'):
        op.execute("ALTER TABLE sync_jobs ADD COLUMN error_count INTEGER DEFAULT 0")
    
    if not column_exists(conn, 'sync_jobs', 'error_details'):
        op.execute("ALTER TABLE sync_jobs ADD COLUMN error_details TEXT")
    
    if not column_exists(conn, 'sync_jobs', 'triggered_by'):
        op.execute("ALTER TABLE sync_jobs ADD COLUMN triggered_by TEXT DEFAULT 'manual'")


def downgrade() -> None:
    """SQLite doesn't support DROP COLUMN easily, skip for now."""
    pass
