"""Add provider_config column to deployment_targets

Revision ID: 0019_add_provider_config
Revises: 0018_add_edge_databases
Create Date: 2026-02-25

Adds provider_config TEXT column for storing provider-specific credentials
and metadata as JSON. Examples:
  Cloudflare: {"api_token": "...", "account_id": "...", "secret_names": [...]}
  Vercel: {"team_id": "...", "project_id": "...", "api_token": "..."}
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '0020_add_provider_config'
down_revision = '0019_add_is_system_and_seed'
branch_labels = None
depends_on = None


def upgrade():
    """Add provider_config column to deployment_targets."""
    conn = op.get_bind()
    inspector = inspect(conn)

    # Check if column already exists (idempotent)
    existing_tables = inspector.get_table_names()
    if 'deployment_targets' not in existing_tables:
        return  # Table doesn't exist yet (fresh DB)
    columns = [c['name'] for c in inspector.get_columns('deployment_targets')]
    if 'provider_config' not in columns:
        op.add_column('deployment_targets', sa.Column('provider_config', sa.Text(), nullable=True))
        print("[Migration 0019] Added provider_config column to deployment_targets")
    else:
        print("[Migration 0019] provider_config column already exists, skipping")


def downgrade():
    """Remove provider_config column."""
    op.drop_column('deployment_targets', 'provider_config')
