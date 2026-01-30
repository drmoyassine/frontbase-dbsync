"""Sync migration state

Revision ID: 0010_sync_migration_state
Revises: 0009_datasource_views_columns
Create Date: 2026-01-30

This is a no-op migration to ensure migration state is synchronized.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0010_sync_migration_state'
down_revision: Union[str, Sequence[str], None] = '0009_datasource_views_columns'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op migration."""
    pass


def downgrade() -> None:
    """No-op migration."""
    pass
