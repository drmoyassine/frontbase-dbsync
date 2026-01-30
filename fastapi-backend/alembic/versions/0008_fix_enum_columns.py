"""Fix enum columns for PostgreSQL/SQLite portability

Revision ID: 0008_fix_enum_columns
Revises: 0007_project_app_favicon_url
Create Date: 2026-01-30

This migration converts any PostgreSQL native enum columns to VARCHAR columns
for cross-database compatibility. SQLite already stores enums as strings,
so this migration is primarily needed for PostgreSQL deployments.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

# revision identifiers, used by Alembic.
revision: str = '0008_fix_enum_columns'
down_revision: Union[str, Sequence[str], None] = '0007_project_app_favicon_url'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(inspector, table_name: str) -> bool:
    """Check if a table exists (database-agnostic)."""
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    """Convert enum columns to VARCHAR for PostgreSQL compatibility."""
    conn = op.get_bind()
    inspector = inspect(conn)
    dialect = conn.dialect.name  # 'sqlite' or 'postgresql'
    
    # SQLite already stores enums as strings, so no changes needed
    if dialect == 'sqlite':
        return
    
    # PostgreSQL: Convert enum columns to VARCHAR
    # This handles the case where tables were created with native enum types
    
    # 1. Fix datasources.type column
    if table_exists(inspector, 'datasources'):
        try:
            op.execute(text("""
                ALTER TABLE datasources 
                ALTER COLUMN type TYPE VARCHAR(50) 
                USING type::text
            """))
        except Exception as e:
            # Column might already be VARCHAR if created fresh
            print(f"Note: datasources.type may already be VARCHAR: {e}")
    
    # 2. Fix sync_jobs.status column
    if table_exists(inspector, 'sync_jobs'):
        try:
            op.execute(text("""
                ALTER TABLE sync_jobs 
                ALTER COLUMN status TYPE VARCHAR(30) 
                USING status::text
            """))
        except Exception as e:
            print(f"Note: sync_jobs.status may already be VARCHAR: {e}")
    
    # 3. Fix conflicts.status column
    if table_exists(inspector, 'conflicts'):
        try:
            op.execute(text("""
                ALTER TABLE conflicts 
                ALTER COLUMN status TYPE VARCHAR(30) 
                USING status::text
            """))
        except Exception as e:
            print(f"Note: conflicts.status may already be VARCHAR: {e}")
    
    # 4. Fix sync_configs.conflict_strategy column
    if table_exists(inspector, 'sync_configs'):
        try:
            op.execute(text("""
                ALTER TABLE sync_configs 
                ALTER COLUMN conflict_strategy TYPE VARCHAR(30) 
                USING conflict_strategy::text
            """))
        except Exception as e:
            print(f"Note: sync_configs.conflict_strategy may already be VARCHAR: {e}")
    
    # Drop any orphaned enum types that may have been created
    enum_types = ['datasourcetype', 'jobstatus', 'conflictstatus', 'conflictstrategy']
    for enum_type in enum_types:
        try:
            op.execute(text(f"DROP TYPE IF EXISTS {enum_type}"))
        except Exception:
            pass  # Type may not exist


def downgrade() -> None:
    """
    Downgrade is a no-op since VARCHAR is a superset of enum values.
    Converting back to native enums would require recreating the types.
    """
    pass
