"""Add missing target_table and filters columns

Revision ID: 0012_add_missing_target_table
Revises: 0011_ensure_ds_views_cols
Create Date: 2026-01-30

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision: str = '0012_add_missing_target_table'
down_revision: Union[str, Sequence[str], None] = '0011_ensure_ds_views_cols'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add missing columns using robust SQL checks."""
    conn = op.get_bind()
    dialect = conn.dialect.name
    
    if dialect == 'postgresql':
        # Use raw SQL with standard CAST syntax
        sql_statements = [
            "ALTER TABLE datasource_views ADD COLUMN IF NOT EXISTS target_table VARCHAR(255) DEFAULT '';",
            "ALTER TABLE datasource_views ADD COLUMN IF NOT EXISTS filters JSON DEFAULT CAST('[]' AS JSON);",
        ]
        
        # Use autocommit block to handle transactions correctly via Alembic
        with op.get_context().autocommit_block():
            for statement in sql_statements:
                try:
                    op.execute(sa.text(statement))
                    print(f"Executed: {statement}")
                except Exception as e:
                    print(f"Error executing {statement}: {e}")
                    pass

    else:
        # For SQLite...
        inspector = Inspector.from_engine(conn)
        columns = {col['name'] for col in inspector.get_columns('datasource_views')}
        
        cols_to_add = [
            ('target_table', sa.String(255)),
            ('filters', sa.JSON()),
        ]
        
        for name, type_ in cols_to_add:
            if name not in columns:
                try:
                    with op.batch_alter_table('datasource_views') as batch_op:
                        if name == 'target_table':
                            batch_op.add_column(sa.Column(name, type_, server_default=''))
                        elif name == 'filters':
                            batch_op.add_column(sa.Column(name, type_, server_default='[]'))
                    print(f"Added column {name} (SQLite)")
                except Exception as e:
                    print(f"Could not add column {name}: {e}")


def downgrade() -> None:
    """No-op downgrade."""
    pass
