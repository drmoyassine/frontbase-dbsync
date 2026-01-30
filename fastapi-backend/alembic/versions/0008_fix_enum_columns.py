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


def column_exists(inspector, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    if not table_exists(inspector, table_name):
        return False
    columns = {col['name'] for col in inspector.get_columns(table_name)}
    return column_name in columns


def safe_alter_column_to_varchar(conn, table_name: str, column_name: str, length: int, inspector) -> None:
    """Safely alter a column to VARCHAR if it exists and is an enum type."""
    if not column_exists(inspector, table_name, column_name):
        print(f"Skipping {table_name}.{column_name}: column does not exist")
        return
    
    # Check if the column is already VARCHAR/TEXT
    columns = inspector.get_columns(table_name)
    col_info = next((c for c in columns if c['name'] == column_name), None)
    if col_info:
        col_type = str(col_info['type']).upper()
        if 'VARCHAR' in col_type or 'TEXT' in col_type or 'CHARACTER' in col_type:
            print(f"Skipping {table_name}.{column_name}: already VARCHAR/TEXT type")
            return
    
    try:
        conn.execute(text(f"""
            ALTER TABLE {table_name} 
            ALTER COLUMN {column_name} TYPE VARCHAR({length}) 
            USING {column_name}::text
        """))
        print(f"Converted {table_name}.{column_name} to VARCHAR({length})")
    except Exception as e:
        print(f"Note: Could not alter {table_name}.{column_name}: {e}")


def upgrade() -> None:
    """Convert enum columns to VARCHAR for PostgreSQL compatibility."""
    conn = op.get_bind()
    inspector = inspect(conn)
    dialect = conn.dialect.name  # 'sqlite' or 'postgresql'
    
    # SQLite already stores enums as strings, so no changes needed
    if dialect == 'sqlite':
        print("SQLite detected - no enum conversion needed")
        return
    
    print("PostgreSQL detected - checking enum columns...")
    
    # 1. Fix datasources.type column
    safe_alter_column_to_varchar(conn, 'datasources', 'type', 50, inspector)
    
    # 2. Fix sync_jobs.status column
    safe_alter_column_to_varchar(conn, 'sync_jobs', 'status', 30, inspector)
    
    # 3. Fix conflicts.status column (may not exist in all schemas)
    safe_alter_column_to_varchar(conn, 'conflicts', 'status', 30, inspector)
    
    # 4. Fix sync_configs.conflict_strategy column
    safe_alter_column_to_varchar(conn, 'sync_configs', 'conflict_strategy', 30, inspector)
    
    # Drop any orphaned enum types that may have been created
    enum_types = ['datasourcetype', 'jobstatus', 'conflictstatus', 'conflictstrategy']
    for enum_type in enum_types:
        try:
            conn.execute(text(f"DROP TYPE IF EXISTS {enum_type}"))
        except Exception:
            pass  # Type may not exist
    
    print("Enum column migration complete")


def downgrade() -> None:
    """
    Downgrade is a no-op since VARCHAR is a superset of enum values.
    Converting back to native enums would require recreating the types.
    """
    pass
