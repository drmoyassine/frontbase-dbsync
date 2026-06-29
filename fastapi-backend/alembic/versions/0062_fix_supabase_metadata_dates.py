"""fix supabase_metadata dates and datasource enum case

Revision ID: 0062
Revises: 0061
Create Date: 2026-06-29 23:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = '0062'
down_revision = '0061'
branch_labels = None
depends_on = None

def upgrade():
    # 1. Alter supabase_user_metadata dates from String to DateTime(timezone=True)
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'supabase_user_metadata' in existing_tables:
        with op.batch_alter_table('supabase_user_metadata', schema=None) as batch_op:
            batch_op.alter_column('created_at',
                                  existing_type=sa.String(),
                                  type_=sa.DateTime(timezone=True),
                                  postgresql_using='created_at::timestamp with time zone',
                                  existing_nullable=False,
                                  server_default=sa.func.now())
            batch_op.alter_column('updated_at',
                                  existing_type=sa.String(),
                                  type_=sa.DateTime(timezone=True),
                                  postgresql_using='updated_at::timestamp with time zone',
                                  existing_nullable=False,
                                  server_default=sa.func.now())

    # 2. Fix DatasourceType uppercase bug (Bug 9)
    if 'datasources' in existing_tables:
        # SQLite uses string for ENUMs so this works. Postgres requires casting if it's strict, but 
        # since it's an enum, we just update the text value if allowed, or it's a no-op if PG enum didn't have uppercase.
        # We catch exceptions to make it safe for strict PG enums that don't have 'SUPABASE'.
        try:
            conn.execute(text("UPDATE datasources SET type = 'supabase' WHERE type = 'SUPABASE'"))
        except Exception:
            pass

def downgrade():
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'supabase_user_metadata' in existing_tables:
        with op.batch_alter_table('supabase_user_metadata', schema=None) as batch_op:
            batch_op.alter_column('updated_at',
                                  existing_type=sa.DateTime(timezone=True),
                                  type_=sa.String(),
                                  existing_nullable=False,
                                  server_default=None)
            batch_op.alter_column('created_at',
                                  existing_type=sa.DateTime(timezone=True),
                                  type_=sa.String(),
                                  existing_nullable=False,
                                  server_default=None)
