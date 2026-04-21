"""Add is_shared column to edge_engines for community engine support.

Revision ID: 0044
Revises: 1107e0ddc6fa
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '0044'
down_revision = '1107e0ddc6fa'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'edge_engines' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('edge_engines')]
        if 'is_shared' not in columns:
            with op.batch_alter_table('edge_engines', schema=None) as batch_op:
                batch_op.add_column(
                    sa.Column('is_shared', sa.Boolean(), nullable=True, server_default='0')
                )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'edge_engines' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('edge_engines')]
        if 'is_shared' in columns:
            with op.batch_alter_table('edge_engines', schema=None) as batch_op:
                batch_op.drop_column('is_shared')
