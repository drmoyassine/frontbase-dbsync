"""Initial migration with TableSchemaCache improvements

Revision ID: c5311426ba79
Revises: 
Create Date: 2026-01-06 09:35:35.486210

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = 'c5311426ba79'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - MINIMAL: Only add missing columns to table_schema_cache."""
    
    conn = op.get_bind()
    inspector = inspect(conn)
    
    # Clean up any leftover temp tables from previous failed runs
    for table_name in ['_alembic_tmp_table_schema_cache', '_alembic_tmp_app_variables', 
                       '_alembic_tmp_conflicts', '_alembic_tmp_user_sessions', '_alembic_tmp_user_settings']:
        try:
            op.drop_table(table_name)
        except:
            pass  # Table doesn't exist, that's fine
    
    # Check if table_schema_cache exists
    existing_tables = inspector.get_table_names()
    if 'table_schema_cache' not in existing_tables:
        # Table doesn't exist - it will be created with correct schema by SQLAlchemy
        # Skip the ALTER TABLE commands
        return
    
    # Get existing columns (database-agnostic)
    existing_columns = {col['name'] for col in inspector.get_columns('table_schema_cache')}
    
    # Add 'columns' if missing
    if 'columns' not in existing_columns:
        op.add_column('table_schema_cache', sa.Column('columns', sa.Text(), nullable=True))
    
    # Add 'foreign_keys' if missing
    if 'foreign_keys' not in existing_columns:
        op.add_column('table_schema_cache', sa.Column('foreign_keys', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema - Remove added columns."""
    # In production, you'd recreate the table without these columns
    pass
