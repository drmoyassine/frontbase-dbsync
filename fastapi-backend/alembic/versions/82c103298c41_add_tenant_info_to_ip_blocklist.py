"""add tenant info to ip blocklist

Revision ID: 82c103298c41
Revises: 8fe51fd5bc45
Create Date: 2026-06-05 01:42:23.276815

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '82c103298c41'
down_revision: Union[str, Sequence[str], None] = '8fe51fd5bc45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'ip_blocklist' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('ip_blocklist')]
        
        # 1. Add tenant_id and tenant_slug if they don't exist
        with op.batch_alter_table('ip_blocklist', schema=None) as batch_op:
            if 'tenant_id' not in columns:
                batch_op.add_column(sa.Column('tenant_id', sa.String(length=50), nullable=True))
            if 'tenant_slug' not in columns:
                batch_op.add_column(sa.Column('tenant_slug', sa.String(length=100), nullable=True))

        # 2. Drop the global unique constraint on ip_or_range
        # For SQLite, rebuild table using recreate='always' to drop unique index.
        # Alembic will derive the new table DDL from the python model (which has unique=False).
        if conn.dialect.name == 'sqlite':
            with op.batch_alter_table('ip_blocklist', schema=None, recreate='always') as batch_op:
                pass
        else:
            # Find and drop unique constraint on Postgres
            unique_constraints = inspector.get_unique_constraints('ip_blocklist')
            for uc in unique_constraints:
                if 'ip_or_range' in uc['column_names']:
                    with op.batch_alter_table('ip_blocklist', schema=None) as batch_op:
                        batch_op.drop_constraint(uc['name'], type_='unique')
                    break


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'ip_blocklist' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('ip_blocklist')]
        with op.batch_alter_table('ip_blocklist', schema=None) as batch_op:
            if 'tenant_id' in columns:
                batch_op.drop_column('tenant_id')
            if 'tenant_slug' in columns:
                batch_op.drop_column('tenant_slug')
            try:
                batch_op.create_unique_constraint('uq_ip_blocklist_ip_or_range', ['ip_or_range'])
            except Exception:
                pass
