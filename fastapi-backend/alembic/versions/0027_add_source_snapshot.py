"""Add source_snapshot column to edge_engines

Revision ID: 0027_add_source_snapshot
Revises: 0026_add_automation_is_active
Create Date: 2026-03-08

Stores a JSON snapshot of all .ts source files per engine, captured on deploy.
Used by the Inspector IDE for per-engine code editing.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '0027_add_source_snapshot'
down_revision = '0026_add_automation_is_active'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)

    existing_tables = inspector.get_table_names()
    if 'edge_engines' not in existing_tables:
        return  # Table doesn't exist yet (fresh DB)
    columns = [c['name'] for c in inspector.get_columns('edge_engines')]
    if 'source_snapshot' not in columns:
        op.add_column('edge_engines', sa.Column('source_snapshot', sa.Text(), nullable=True))
        print("[Migration 0027] Added source_snapshot column to edge_engines")
    else:
        print("[Migration 0027] source_snapshot column already exists, skipping")


def downgrade():
    op.drop_column('edge_engines', 'source_snapshot')
