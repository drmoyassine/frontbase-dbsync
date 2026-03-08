"""Add is_active column to automation_drafts

Revision ID: 0026_add_automation_is_active
Revises: 0025_add_edge_api_keys
Create Date: 2026-03-08

Adds is_active boolean toggle for enabling/disabling automation drafts.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '0026_add_automation_is_active'
down_revision = '0025_add_edge_api_keys'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)

    columns = [c['name'] for c in inspector.get_columns('automation_drafts')]
    if 'is_active' not in columns:
        op.add_column('automation_drafts', sa.Column('is_active', sa.Boolean(), server_default='1'))
        print("[Migration 0026] Added is_active column to automation_drafts")
    else:
        print("[Migration 0026] is_active column already exists, skipping")


def downgrade():
    op.drop_column('automation_drafts', 'is_active')
