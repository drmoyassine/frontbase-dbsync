"""Fix table_schema_cache schema_data constraint and add missing columns

Revision ID: 0015_fix_schema_cache
Revises: 0014_add_logo_fetched_at
Create Date: 2026-02-01

Fixes:
- Makes table_schema_cache.schema_data NULLABLE (legacy column, new model uses columns/foreign_keys)
- Adds table_schema_cache.columns (JSON) if missing
- Adds table_schema_cache.foreign_keys (JSON) if missing
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0015_fix_schema_cache'
down_revision = '0014_add_logo_fetched_at'
branch_labels = None
depends_on = None


def upgrade():
    # Get connection and dialect
    conn = op.get_bind()
    dialect = conn.dialect.name
    
    if dialect == 'postgresql':
        # Check if table exists first (fresh deploys)
        result = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'table_schema_cache'"
        ))
        if not result.fetchone():
            print("table_schema_cache does not exist yet - skipping")
            return

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
        # This is safe because new code uses columns/foreign_keys instead
        op.execute("""
            ALTER TABLE table_schema_cache ALTER COLUMN schema_data DROP NOT NULL;
        """)
    else:
        # SQLite - check if table exists first
        inspector = sa.inspect(conn)
        if 'table_schema_cache' not in inspector.get_table_names():
            print("table_schema_cache does not exist yet - skipping")
            return

        result = conn.execute(sa.text("PRAGMA table_info(table_schema_cache)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'columns' not in columns:
            op.add_column('table_schema_cache', sa.Column('columns', sa.JSON(), nullable=True))
        if 'foreign_keys' not in columns:
            op.add_column('table_schema_cache', sa.Column('foreign_keys', sa.JSON(), nullable=True))
        # SQLite doesn't support ALTER COLUMN, but columns are already nullable by default


def downgrade():
    # Note: Making schema_data NOT NULL again could fail if there are NULL values
    pass
