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
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0002_sync_schema'
down_revision: Union[str, Sequence[str], None] = '0001_frontbase_core'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(inspector, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table (database-agnostic)."""
    try:
        columns = {col['name'] for col in inspector.get_columns(table_name)}
        return column_name in columns
    except:
        return False


def upgrade() -> None:
    """Add missing columns to sync tables."""
    conn = op.get_bind()
    inspector = inspect(conn)
    
    # ============================
    # sync_configs table updates
    # ============================
    
    if not column_exists(inspector, 'sync_configs', 'description'):
        op.add_column('sync_configs', sa.Column('description', sa.Text()))
    
    if not column_exists(inspector, 'sync_configs', 'master_datasource_id'):
        op.add_column('sync_configs', sa.Column('master_datasource_id', sa.Text()))
    
    if not column_exists(inspector, 'sync_configs', 'slave_datasource_id'):
        op.add_column('sync_configs', sa.Column('slave_datasource_id', sa.Text()))
    
    if not column_exists(inspector, 'sync_configs', 'master_view_id'):
        op.add_column('sync_configs', sa.Column('master_view_id', sa.Text()))
    
    if not column_exists(inspector, 'sync_configs', 'slave_view_id'):
        op.add_column('sync_configs', sa.Column('slave_view_id', sa.Text()))
    
    if not column_exists(inspector, 'sync_configs', 'master_table'):
        op.add_column('sync_configs', sa.Column('master_table', sa.Text()))
    
    if not column_exists(inspector, 'sync_configs', 'slave_table'):
        op.add_column('sync_configs', sa.Column('slave_table', sa.Text()))
    
    if not column_exists(inspector, 'sync_configs', 'master_pk_column'):
        op.add_column('sync_configs', sa.Column('master_pk_column', sa.Text(), server_default='id'))
    
    if not column_exists(inspector, 'sync_configs', 'slave_pk_column'):
        op.add_column('sync_configs', sa.Column('slave_pk_column', sa.Text(), server_default='id'))
    
    if not column_exists(inspector, 'sync_configs', 'conflict_strategy'):
        op.add_column('sync_configs', sa.Column('conflict_strategy', sa.Text(), server_default='source_wins'))
    
    if not column_exists(inspector, 'sync_configs', 'webhook_url'):
        op.add_column('sync_configs', sa.Column('webhook_url', sa.Text()))
    
    if not column_exists(inspector, 'sync_configs', 'is_active'):
        op.add_column('sync_configs', sa.Column('is_active', sa.Integer(), server_default='1'))
    
    if not column_exists(inspector, 'sync_configs', 'sync_deletes'):
        op.add_column('sync_configs', sa.Column('sync_deletes', sa.Integer(), server_default='0'))
    
    if not column_exists(inspector, 'sync_configs', 'batch_size'):
        op.add_column('sync_configs', sa.Column('batch_size', sa.Integer(), server_default='100'))
    
    if not column_exists(inspector, 'sync_configs', 'cron_schedule'):
        op.add_column('sync_configs', sa.Column('cron_schedule', sa.Text()))
    
    # ============================
    # sync_jobs table updates
    # ============================
    
    if not column_exists(inspector, 'sync_jobs', 'total_records'):
        op.add_column('sync_jobs', sa.Column('total_records', sa.Integer(), server_default='0'))
    
    if not column_exists(inspector, 'sync_jobs', 'processed_records'):
        op.add_column('sync_jobs', sa.Column('processed_records', sa.Integer(), server_default='0'))
    
    if not column_exists(inspector, 'sync_jobs', 'inserted_records'):
        op.add_column('sync_jobs', sa.Column('inserted_records', sa.Integer(), server_default='0'))
    
    if not column_exists(inspector, 'sync_jobs', 'updated_records'):
        op.add_column('sync_jobs', sa.Column('updated_records', sa.Integer(), server_default='0'))
    
    if not column_exists(inspector, 'sync_jobs', 'deleted_records'):
        op.add_column('sync_jobs', sa.Column('deleted_records', sa.Integer(), server_default='0'))
    
    if not column_exists(inspector, 'sync_jobs', 'conflict_count'):
        op.add_column('sync_jobs', sa.Column('conflict_count', sa.Integer(), server_default='0'))
    
    if not column_exists(inspector, 'sync_jobs', 'error_count'):
        op.add_column('sync_jobs', sa.Column('error_count', sa.Integer(), server_default='0'))
    
    if not column_exists(inspector, 'sync_jobs', 'error_details'):
        op.add_column('sync_jobs', sa.Column('error_details', sa.Text()))
    
    if not column_exists(inspector, 'sync_jobs', 'triggered_by'):
        op.add_column('sync_jobs', sa.Column('triggered_by', sa.Text(), server_default='manual'))


def downgrade() -> None:
    """SQLite doesn't support DROP COLUMN easily, skip for now."""
    pass
