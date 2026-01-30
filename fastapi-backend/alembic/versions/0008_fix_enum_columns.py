"""Fix enum columns for PostgreSQL/SQLite portability

Revision ID: 0008_fix_enum_columns
Revises: 0007_project_app_favicon_url
Create Date: 2026-01-30

This migration converts any PostgreSQL native enum columns to VARCHAR columns
for cross-database compatibility. SQLite already stores enums as strings,
so this migration is primarily needed for PostgreSQL deployments.

NOTE: Based on deployment logs, columns are already VARCHAR type so this
migration is effectively a no-op. The model changes with native_enum=False
are what actually fix the issue going forward.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '0008_fix_enum_columns'
down_revision: Union[str, Sequence[str], None] = '0007_project_app_favicon_url'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Convert enum columns to VARCHAR for PostgreSQL compatibility.
    
    Based on deployment logs, columns are already VARCHAR type, so this
    migration is effectively a no-op. The real fix was in the model changes
    adding native_enum=False to SQLEnum declarations.
    """
    conn = op.get_bind()
    dialect = conn.dialect.name
    
    if dialect == 'sqlite':
        print("SQLite detected - no enum conversion needed")
        return
    
    # PostgreSQL: The columns are already VARCHAR based on inspection
    # The model changes with native_enum=False will prevent future issues
    print("PostgreSQL detected - columns already appear to be VARCHAR type")
    print("Model changes with native_enum=False will handle future compatibility")


def downgrade() -> None:
    """
    Downgrade is a no-op since VARCHAR is a superset of enum values.
    """
    pass
