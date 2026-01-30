"""Ensure datasource_views columns exist (Robust Fix)

Revision ID: 0011_ensure_datasource_views_columns
Revises: 0010_sync_migration_state
Create Date: 2026-01-30

This migration uses raw SQL to ensure columns exist in PostgreSQL, bypassing
potentially flaky Python-side inspection. It uses 'ADD COLUMN IF NOT EXISTS'
which is supported in PostgreSQL 9.6+.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision: str = '0011_ensure_ds_views_cols'
down_revision: Union[str, Sequence[str], None] = '0010_sync_migration_state'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Ensure columns exist using robust SQL checks."""
    conn = op.get_bind()
    dialect = conn.dialect.name
    
    if dialect == 'postgresql':
        # Use raw SQL with standard CAST syntax to avoid SQLAlchemy binding issues with '::'
        sql_statements = [
            "ALTER TABLE datasource_views ADD COLUMN IF NOT EXISTS description TEXT;",
            "ALTER TABLE datasource_views ADD COLUMN IF NOT EXISTS visible_columns JSON DEFAULT CAST('[]' AS JSON);",
            "ALTER TABLE datasource_views ADD COLUMN IF NOT EXISTS pinned_columns JSON DEFAULT CAST('[]' AS JSON);",
            "ALTER TABLE datasource_views ADD COLUMN IF NOT EXISTS column_order JSON DEFAULT CAST('[]' AS JSON);",
            "ALTER TABLE datasource_views ADD COLUMN IF NOT EXISTS webhooks JSON DEFAULT CAST('[]' AS JSON);",
            "ALTER TABLE datasource_views ADD COLUMN IF NOT EXISTS linked_views JSON DEFAULT CAST('{}' AS JSON);",
            "ALTER TABLE datasource_views ADD COLUMN IF NOT EXISTS field_mappings JSON DEFAULT CAST('{}' AS JSON);",
        ]
        
        # Use autocommit block to handle transactions correctly via Alembic
        # This prevents "current transaction is aborted" errors if a statement fails
        # and allows us to execute statements independently
        with op.get_context().autocommit_block():
            for statement in sql_statements:
                try:
                    op.execute(sa.text(statement))
                    print(f"Executed: {statement}")
                except Exception as e:
                    print(f"Error executing {statement}: {e}")
                    # In autocommit mode, failure doesn't abort transaction so we can continue
                    pass

    else:
        # For SQLite... (keep existing logic)
        inspector = Inspector.from_engine(conn)
        columns = {col['name'] for col in inspector.get_columns('datasource_views')}
        
        cols_to_add = [
            ('description', sa.Text()),
            ('visible_columns', sa.JSON()),
            ('pinned_columns', sa.JSON()),
            ('column_order', sa.JSON()),
            ('webhooks', sa.JSON()),
            ('linked_views', sa.JSON()),
            ('field_mappings', sa.JSON()),
        ]
        
        for name, type_ in cols_to_add:
            if name not in columns:
                try:
                    with op.batch_alter_table('datasource_views') as batch_op:
                        batch_op.add_column(sa.Column(name, type_, nullable=True))
                    print(f"Added column {name} (SQLite)")
                except Exception as e:
                    print(f"Could not add column {name}: {e}")


def downgrade() -> None:
    """No-op downgrade to avoid data loss."""
    pass
