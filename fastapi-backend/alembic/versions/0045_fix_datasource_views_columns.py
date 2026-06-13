"""Fix datasource_views columns and types

Revision ID: 0045_fix_datasource_views_columns
Revises: 440c4f10942f
Create Date: 2026-06-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0045_fix_datasource_views_columns'
down_revision: Union[str, Sequence[str], None] = '440c4f10942f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Columns the sync service model expects to exist
EXPECTED_COLUMNS = {
    'description': sa.Column('description', sa.Text(), nullable=True),
    'target_table': sa.Column('target_table', sa.String(255), nullable=True),
    'filters': sa.Column('filters', sa.JSON(), nullable=True),
    'field_mappings': sa.Column('field_mappings', sa.JSON(), nullable=True),
    'linked_views': sa.Column('linked_views', sa.JSON(), nullable=True),
    'visible_columns': sa.Column('visible_columns', sa.JSON(), nullable=True),
    'pinned_columns': sa.Column('pinned_columns', sa.JSON(), nullable=True),
    'column_order': sa.Column('column_order', sa.JSON(), nullable=True),
    'webhooks': sa.Column('webhooks', sa.JSON(), nullable=True),
}


def upgrade() -> None:
    """Upgrade database schema."""
    conn = op.get_bind()
    dialect = conn.dialect.name
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # If the table doesn't exist, create it from scratch with the full schema.
    if 'datasource_views' not in existing_tables:
        op.create_table(
            'datasource_views',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('name', sa.String(255), nullable=False, unique=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('datasource_id', sa.String(36), nullable=False),
            sa.Column('target_table', sa.String(255), nullable=False),
            sa.Column('filters', sa.JSON(), nullable=True),
            sa.Column('field_mappings', sa.JSON(), nullable=True),
            sa.Column('linked_views', sa.JSON(), nullable=True),
            sa.Column('visible_columns', sa.JSON(), nullable=True),
            sa.Column('pinned_columns', sa.JSON(), nullable=True),
            sa.Column('column_order', sa.JSON(), nullable=True),
            sa.Column('webhooks', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            # Add legacy columns as nullable for backward compatibility
            sa.Column('view_definition', sa.Text(), nullable=True),
            sa.Column('is_shared', sa.Boolean(), nullable=True),
            sa.Column('created_by', sa.String(), nullable=True),
        )
        print("Created table 'datasource_views' from scratch.")
        return

    # If the table already exists, inspect its columns
    existing_columns = {col['name']: col for col in inspector.get_columns('datasource_views')}

    # Find missing columns
    missing_columns = {}
    for name, col in EXPECTED_COLUMNS.items():
        if name not in existing_columns:
            missing_columns[name] = col

    # Perform alterations
    if dialect == 'sqlite':
        with op.batch_alter_table('datasource_views') as batch_op:
            # Add missing columns
            for name, col in missing_columns.items():
                batch_op.add_column(col)
            
            # Alter legacy columns to be nullable
            for col_name in ['view_definition', 'created_by', 'is_shared']:
                if col_name in existing_columns and not existing_columns[col_name]['nullable']:
                    batch_op.alter_column(col_name, nullable=True)

            # Alter created_at and updated_at to DateTime if they are String/VARCHAR
            for col_name in ['created_at', 'updated_at']:
                if col_name in existing_columns:
                    col_type = existing_columns[col_name]['type']
                    type_str = str(col_type).upper()
                    if 'VARCHAR' in type_str or 'CHAR' in type_str or 'TEXT' in type_str:
                        batch_op.alter_column(col_name, type_=sa.DateTime(), nullable=True)
        print("Updated table 'datasource_views' (SQLite).")
    else:
        # PostgreSQL / other
        # Add missing columns
        for name, col in missing_columns.items():
            op.add_column('datasource_views', col)

        # Alter legacy columns to be nullable
        for col_name in ['view_definition', 'created_by', 'is_shared']:
            if col_name in existing_columns and not existing_columns[col_name]['nullable']:
                op.alter_column('datasource_views', col_name, nullable=True)

        # Alter created_at and updated_at to DateTime if they are String/VARCHAR
        for col_name in ['created_at', 'updated_at']:
            if col_name in existing_columns:
                col_type = existing_columns[col_name]['type']
                type_str = str(col_type).upper()
                if 'VARCHAR' in type_str or 'CHAR' in type_str or 'TEXT' in type_str:
                    op.alter_column(
                        'datasource_views',
                        col_name,
                        type_=sa.DateTime(),
                        postgresql_using=f'{col_name}::timestamp without time zone',
                        nullable=True
                    )
        print("Updated table 'datasource_views' (PostgreSQL).")


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    dialect = conn.dialect.name
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'datasource_views' not in existing_tables:
        return

    # Just revert nullable status if needed, but typically downgrades can skip safety drops
    # to avoid losing data. We will define it as no-op or drop added columns.
    if dialect == 'sqlite':
        with op.batch_alter_table('datasource_views') as batch_op:
            for name in EXPECTED_COLUMNS:
                try:
                    batch_op.drop_column(name)
                except Exception:
                    pass
    else:
        for name in EXPECTED_COLUMNS:
            try:
                op.drop_column('datasource_views', name)
            except Exception:
                pass
