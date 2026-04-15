"""Add provider_account_id to datasources

Revision ID: e7f8a9b1c2d3
Revises: 0042_add_universal_llm_fields
Create Date: 2026-04-15 00:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e7f8a9b1c2d3'
down_revision: Union[str, Sequence[str], None] = '0042_add_universal_llm_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('datasources')]
    if 'provider_account_id' not in columns:
        with op.batch_alter_table('datasources', schema=None) as batch_op:
            batch_op.add_column(
                sa.Column('provider_account_id', sa.String(36), nullable=True)
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('datasources')]
    if 'provider_account_id' in columns:
        with op.batch_alter_table('datasources', schema=None) as batch_op:
            batch_op.drop_column('provider_account_id')
