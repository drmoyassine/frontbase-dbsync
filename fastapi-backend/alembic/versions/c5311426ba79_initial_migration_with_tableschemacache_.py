"""Initial migration with TableSchemaCache improvements

Revision ID: c5311426ba79
Revises: 
Create Date: 2026-01-06 09:35:35.486210

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c5311426ba79'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - MINIMAL: Only add missing columns to table_schema_cache."""
    
    # Clean up any leftover temp tables from previous failed runs
    op.execute("DROP TABLE IF EXISTS _alembic_tmp_table_schema_cache")
    op.execute("DROP TABLE IF EXISTS _alembic_tmp_app_variables")
    op.execute("DROP TABLE IF EXISTS _alembic_tmp_conflicts")
    op.execute("DROP TABLE IF EXISTS _alembic_tmp_user_sessions")
    op.execute("DROP TABLE IF EXISTS _alembic_tmp_user_settings")
    
    # THE CRITICAL FIX: Add missing columns to table_schema_cache
    # These columns are expected by the application but missing from the VPS database
    # Using raw SQL to avoid batch mode complications with SQLite
    
    # Check if columns exist before adding (idempotent)
    conn = op.get_bind()
    
    # First check if table exists
    result = conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name='table_schema_cache'"))
    if not result.fetchone():
        # Table doesn't exist - it will be created with correct schema by SQLAlchemy
        # Skip the ALTER TABLE commands
        return
    
    # Get existing columns
    result = conn.execute(sa.text("PRAGMA table_info(table_schema_cache)"))
    existing_columns = {row[1] for row in result.fetchall()}
    
    # Add 'columns' if missing
    if 'columns' not in existing_columns:
        op.execute("ALTER TABLE table_schema_cache ADD COLUMN columns TEXT")
    
    # Add 'foreign_keys' if missing
    if 'foreign_keys' not in existing_columns:
        op.execute("ALTER TABLE table_schema_cache ADD COLUMN foreign_keys TEXT")


def downgrade() -> None:
    """Downgrade schema - Remove added columns."""
    # SQLite doesn't support DROP COLUMN easily, so we just pass
    # In production, you'd recreate the table without these columns
    pass
