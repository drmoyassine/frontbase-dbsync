"""Add engine_id and engine_name tracking to automation_executions

Revision ID: 109656903947
Revises: (auto-detected)
Create Date: 2026-03-02
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '109656903947'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def column_exists(table_name, column_name):
    """Check if a column exists (safe for re-runs)."""
    from alembic import op
    conn = op.get_bind()
    from sqlalchemy import inspect
    insp = inspect(conn)
    columns = [c['name'] for c in insp.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    if not column_exists('automation_executions', 'engine_id'):
        op.add_column('automation_executions', sa.Column('engine_id', sa.String(36), nullable=True))
    if not column_exists('automation_executions', 'engine_name'):
        op.add_column('automation_executions', sa.Column('engine_name', sa.String(100), nullable=True))

    # Backfill existing test records
    dialect = op.get_bind().dialect.name
    op.execute("UPDATE automation_executions SET engine_name = 'Test' WHERE engine_name IS NULL")


def downgrade() -> None:
    op.drop_column('automation_executions', 'engine_name')
    op.drop_column('automation_executions', 'engine_id')
