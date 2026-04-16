"""Comprehensive schema sync — add ALL missing columns

Revision ID: 0028_sync_missing_columns
Revises: 0027_add_source_snapshot
Create Date: 2026-03-08

Catches every column present in SQLAlchemy models but absent from the
VPS SQLite database.  Each add_column is guarded by an existence check
so the migration is fully idempotent.

Tables touched:
  - automation_drafts   → deployed_engines
  - automation_executions → engine_id, engine_name
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = '0028_sync_missing_columns'
down_revision = '0027_add_source_snapshot'
branch_labels = None
depends_on = None


def _add_if_missing(inspector, table, col_name, col_type, **kwargs):
    """Add a column only if it doesn't already exist."""
    if table not in inspector.get_table_names():
        return  # Table doesn't exist yet (fresh DB)
    existing = [c['name'] for c in inspector.get_columns(table)]
    if col_name not in existing:
        op.add_column(table, sa.Column(col_name, col_type, **kwargs))
        print(f"[Migration 0028] Added {col_name} to {table}")
    else:
        print(f"[Migration 0028] {col_name} already exists on {table}, skipping")


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)

    existing_tables = inspector.get_table_names()

    # ── automation_drafts ──────────────────────────────────────────
    if 'automation_drafts' not in existing_tables:
        return  # Tables don't exist yet (fresh DB — create_all will handle)
    _add_if_missing(inspector, 'automation_drafts', 'deployed_engines',
                    sa.JSON(), nullable=True)

    # ── automation_executions ──────────────────────────────────────
    if 'automation_executions' in inspector.get_table_names():
        _add_if_missing(inspector, 'automation_executions', 'engine_id',
                        sa.String(36), nullable=True)
        _add_if_missing(inspector, 'automation_executions', 'engine_name',
                        sa.String(100), nullable=True)


def downgrade():
    op.drop_column('automation_drafts', 'deployed_engines')
    op.drop_column('automation_executions', 'engine_id')
    op.drop_column('automation_executions', 'engine_name')
