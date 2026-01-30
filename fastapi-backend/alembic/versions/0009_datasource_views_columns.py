"""Add missing columns to datasource_views table

Revision ID: 0009_datasource_views_columns
Revises: 0008_fix_enum_columns
Create Date: 2026-01-30

This migration adds missing columns to the datasource_views table that exist
in the model but may not have been created in PostgreSQL deployments.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '0009_datasource_views_columns'
down_revision: Union[str, Sequence[str], None] = '0008_fix_enum_columns'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(inspector, table_name: str) -> bool:
    """Check if a table exists."""
    return table_name in inspector.get_table_names()


def column_exists(inspector, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    if not table_exists(inspector, table_name):
        return False
    columns = {col['name'] for col in inspector.get_columns(table_name)}
    return column_name in columns


def upgrade() -> None:
    """Add missing columns to datasource_views table."""
    conn = op.get_bind()
    inspector = inspect(conn)
    
    if not table_exists(inspector, 'datasource_views'):
        print("datasource_views table does not exist - it will be created by SQLAlchemy")
        return
    
    # List of columns to add with their types
    columns_to_add = [
        ('description', sa.Text(), True),
        ('visible_columns', sa.JSON(), False),
        ('pinned_columns', sa.JSON(), False),
        ('column_order', sa.JSON(), False),
        ('webhooks', sa.JSON(), False),
        ('linked_views', sa.JSON(), False),
        ('field_mappings', sa.JSON(), False),
    ]
    
    for column_name, column_type, nullable in columns_to_add:
        if not column_exists(inspector, 'datasource_views', column_name):
            print(f"Adding column: datasource_views.{column_name}")
            # For JSON columns, use empty array/object as default
            if isinstance(column_type, sa.JSON):
                op.add_column('datasource_views', 
                    sa.Column(column_name, column_type, nullable=True, server_default='{}'))
            else:
                op.add_column('datasource_views', 
                    sa.Column(column_name, column_type, nullable=nullable))
        else:
            print(f"Column already exists: datasource_views.{column_name}")
    
    print("datasource_views columns migration complete")


def downgrade() -> None:
    """Remove added columns - use with caution as this will lose data."""
    columns_to_remove = [
        'description', 'visible_columns', 'pinned_columns', 
        'column_order', 'webhooks', 'linked_views', 'field_mappings'
    ]
    
    for column_name in columns_to_remove:
        try:
            op.drop_column('datasource_views', column_name)
        except Exception:
            pass  # Column may not exist
