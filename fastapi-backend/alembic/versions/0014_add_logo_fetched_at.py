"""Add missing logo_url and fetched_at columns

Revision ID: 0014_add_logo_fetched_at
Revises: 0013_ensure_table_exists
Create Date: 2026-02-01

Adds:
- project.logo_url (TEXT) - Custom logo URL for branding
- table_schema_cache.fetched_at (TIMESTAMP) - When schema was fetched
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0014_add_logo_fetched_at'
down_revision = '0013_ensure_table_exists'
branch_labels = None
depends_on = None


def upgrade():
    # Get connection and dialect
    conn = op.get_bind()
    dialect = conn.dialect.name
    
    # Add logo_url to project table if not exists
    if dialect == 'postgresql':
        op.execute("""
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'project' AND column_name = 'logo_url'
                ) THEN 
                    ALTER TABLE project ADD COLUMN logo_url TEXT;
                END IF;
            END $$;
        """)
    else:
        # SQLite - check if column exists first
        result = conn.execute(sa.text("PRAGMA table_info(project)"))
        columns = [row[1] for row in result.fetchall()]
        if 'logo_url' not in columns:
            op.add_column('project', sa.Column('logo_url', sa.String(), nullable=True))
    
    # Add fetched_at to table_schema_cache if not exists
    if dialect == 'postgresql':
        op.execute("""
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'table_schema_cache' AND column_name = 'fetched_at'
                ) THEN 
                    ALTER TABLE table_schema_cache ADD COLUMN fetched_at TIMESTAMP;
                END IF;
            END $$;
        """)
    else:
        # SQLite - check if column exists first
        result = conn.execute(sa.text("PRAGMA table_info(table_schema_cache)"))
        columns = [row[1] for row in result.fetchall()]
        if 'fetched_at' not in columns:
            op.add_column('table_schema_cache', sa.Column('fetched_at', sa.DateTime(), nullable=True))


def downgrade():
    # Note: Dropping columns is risky in production - leaving as no-op
    pass
