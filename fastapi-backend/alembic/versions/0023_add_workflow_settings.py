"""Add settings column to automation_drafts

Revision ID: 0023_add_workflow_settings
Revises: 0022_add_edge_queues
Create Date: 2026-03-04

Per-workflow configuration: rate limiting, debounce, timeouts, queue options.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '0023_add_workflow_settings'
down_revision = '0022_add_edge_queues'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)

    columns = [c['name'] for c in inspector.get_columns('automation_drafts')]
    if 'settings' not in columns:
        op.add_column('automation_drafts', sa.Column('settings', sa.JSON(), nullable=True))
        print("[Migration 0023] Added settings column to automation_drafts")
    else:
        print("[Migration 0023] settings column already exists, skipping")


def downgrade():
    op.drop_column('automation_drafts', 'settings')
