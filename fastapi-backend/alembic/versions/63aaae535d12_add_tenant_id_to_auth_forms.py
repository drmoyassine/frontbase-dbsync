"""add tenant_id to auth_forms

Revision ID: 63aaae535d12
Revises: 880ec754befc
Create Date: 2026-05-31 17:23:11.381297

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '63aaae535d12'
down_revision: Union[str, Sequence[str], None] = '880ec754befc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'auth_forms' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('auth_forms')]
        if 'tenant_id' not in columns:
            op.add_column('auth_forms', sa.Column('tenant_id', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'auth_forms' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('auth_forms')]
        if 'tenant_id' in columns:
            with op.batch_alter_table('auth_forms') as batch_op:
                batch_op.drop_column('tenant_id')
