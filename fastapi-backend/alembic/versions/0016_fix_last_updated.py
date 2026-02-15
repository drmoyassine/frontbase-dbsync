"""Fix table_schema_cache legacy columns - make last_updated nullable

Revision ID: 0016_fix_last_updated
Revises: 0015_fix_schema_cache
Create Date: 2026-02-01

Fixes:
- Makes table_schema_cache.last_updated NULLABLE (legacy column not in new model)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0016_fix_last_updated'
down_revision = '0015_fix_schema_cache'
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

        # Make last_updated nullable (legacy column not in new model)
        # Use IF EXISTS check to handle case where column doesn't exist
        op.execute("""
            DO $$ 
            BEGIN 
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'table_schema_cache' AND column_name = 'last_updated'
                ) THEN 
                    ALTER TABLE table_schema_cache ALTER COLUMN last_updated DROP NOT NULL;
                END IF;
            END $$;
        """)
    # SQLite doesn't support ALTER COLUMN, and columns are already nullable by default


def downgrade():
    # Note: Making last_updated NOT NULL again could fail if there are NULL values
    pass
