"""Add missing logo_url and fetched_at columns, fix schema_data constraint

Revision ID: 0014_add_logo_fetched_at
Revises: 0013_ensure_table_exists
Create Date: 2026-02-01

Adds:
- project.logo_url (TEXT) - Custom logo URL for branding
- table_schema_cache.fetched_at (TIMESTAMP) - When schema was fetched
- table_schema_cache.columns (JSON) - Cached column definitions
- table_schema_cache.foreign_keys (JSON) - Cached FK relationships
- Makes table_schema_cache.schema_data NULLABLE (legacy column)
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
        # Check if table exists first (fresh deploys)
        result = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_name = 'project'"
        ))
        if result.fetchone():
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
        # SQLite - check if table and column exist first
        inspector = sa.inspect(conn)
        if 'project' in inspector.get_table_names():
            result = conn.execute(sa.text("PRAGMA table_info(project)"))
            columns = [row[1] for row in result.fetchall()]
            if 'logo_url' not in columns:
                op.add_column('project', sa.Column('logo_url', sa.String(), nullable=True))
    
    # Fix table_schema_cache: add missing columns and make schema_data nullable
    # Check if table exists first (fresh deploys won't have it yet)
    if dialect == 'postgresql':
        result = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'table_schema_cache'"
        ))
        if not result.fetchone():
            print("table_schema_cache does not exist yet - skipping (will be created by model init)")
            return

        # Add fetched_at if not exists
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
        
        # Add columns if not exists
        op.execute("""
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'table_schema_cache' AND column_name = 'columns'
                ) THEN 
                    ALTER TABLE table_schema_cache ADD COLUMN columns JSON;
                END IF;
            END $$;
        """)
        
        # Add foreign_keys if not exists
        op.execute("""
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'table_schema_cache' AND column_name = 'foreign_keys'
                ) THEN 
                    ALTER TABLE table_schema_cache ADD COLUMN foreign_keys JSON DEFAULT '[]';
                END IF;
            END $$;
        """)
        
        # Make schema_data nullable (legacy column, now optional)
        op.execute("""
            ALTER TABLE table_schema_cache ALTER COLUMN schema_data DROP NOT NULL;
        """)
    else:
        # SQLite - check if table exists first
        inspector = sa.inspect(conn)
        if 'table_schema_cache' not in inspector.get_table_names():
            print("table_schema_cache does not exist yet - skipping (will be created by model init)")
            return

        result = conn.execute(sa.text("PRAGMA table_info(table_schema_cache)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'fetched_at' not in columns:
            op.add_column('table_schema_cache', sa.Column('fetched_at', sa.DateTime(), nullable=True))
        if 'columns' not in columns:
            op.add_column('table_schema_cache', sa.Column('columns', sa.JSON(), nullable=True))
        if 'foreign_keys' not in columns:
            op.add_column('table_schema_cache', sa.Column('foreign_keys', sa.JSON(), nullable=True))
        # SQLite doesn't support ALTER COLUMN, but columns are already nullable by default


def downgrade():
    # Note: Dropping columns is risky in production - leaving as no-op
    pass

