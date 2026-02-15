"""Ensure datasource_views table exists

Revision ID: 0013_ensure_table_exists
Revises: 0012_add_missing_target_table
Create Date: 2026-01-31

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0013_ensure_table_exists'
down_revision: Union[str, Sequence[str], None] = '0012_add_missing_target_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Ensure datasource_views table exists."""
    # Create valid table structure if it doesn't exist
    # Using raw SQL for robustness across drivers, focusing on Postgres
    
    conn = op.get_bind()
    dialect = conn.dialect.name
    
    if dialect == 'postgresql':
        # Check if datasources table exists (FK target) — on fresh deploys it doesn't yet
        inspector = sa.inspect(conn)
        if 'datasources' not in inspector.get_table_names():
            print("datasources table does not exist yet - skipping (will be created by SQLAlchemy)")
            return
        if 'datasource_views' in inspector.get_table_names():
            print("datasource_views table already exists - skipping")
            return

        create_table_sql = """
        CREATE TABLE datasource_views (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            datasource_id VARCHAR(36) NOT NULL REFERENCES datasources(id),
            target_table VARCHAR(255) NOT NULL,
            filters JSON DEFAULT '[]'::json,
            field_mappings JSON DEFAULT '{}'::json,
            linked_views JSON DEFAULT '{}'::json,
            visible_columns JSON DEFAULT '[]'::json,
            pinned_columns JSON DEFAULT '[]'::json,
            column_order JSON DEFAULT '[]'::json,
            webhooks JSON DEFAULT '[]'::json,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc')
        );
        """
        op.execute(sa.text(create_table_sql))
        print("Created table 'datasource_views' (PostgreSQL)")
        
    else:
        # Check if tables exist for SQLite
        inspector = sa.inspect(conn)
        if 'datasources' not in inspector.get_table_names():
            print("datasources table does not exist yet - skipping (will be created by SQLAlchemy)")
            return
        if 'datasource_views' not in inspector.get_table_names():
            op.create_table('datasource_views',
                sa.Column('id', sa.String(36), primary_key=True),
                sa.Column('name', sa.String(255), nullable=False, unique=True),
                sa.Column('description', sa.Text(), nullable=True),
                sa.Column('datasource_id', sa.String(36), sa.ForeignKey('datasources.id'), nullable=False),
                sa.Column('target_table', sa.String(255), nullable=False),
                sa.Column('filters', sa.JSON(), server_default='[]'),
                sa.Column('field_mappings', sa.JSON(), server_default='{}'),
                sa.Column('linked_views', sa.JSON(), server_default='{}'),
                sa.Column('visible_columns', sa.JSON(), server_default='[]'),
                sa.Column('pinned_columns', sa.JSON(), server_default='[]'),
                sa.Column('column_order', sa.JSON(), server_default='[]'),
                sa.Column('webhooks', sa.JSON(), server_default='[]'),
                sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
                sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now())
            )
            print("Created table 'datasource_views' (SQLite)")


def downgrade() -> None:
    """Downgrade: Drop the table if desired (skipped for safety)."""
    # op.drop_table('datasource_views')
    pass
