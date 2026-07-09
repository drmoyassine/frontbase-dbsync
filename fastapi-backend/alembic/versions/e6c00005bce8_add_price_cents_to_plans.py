"""Add price_cents to plans

Revision ID: e6c00005bce8
Revises: 8fc824848fb3
Create Date: 2026-07-09 19:29:43.413962

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = 'e6c00005bce8'
down_revision: Union[str, Sequence[str], None] = '8fc824848fb3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    
    if 'plans' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('plans')]
        if 'price_cents' not in columns:
            with op.batch_alter_table('plans', schema=None) as batch_op:
                batch_op.add_column(sa.Column('price_cents', sa.Integer(), server_default='0', nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    if 'plans' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('plans')]
        if 'price_cents' in columns:
            with op.batch_alter_table('plans', schema=None) as batch_op:
                batch_op.drop_column('price_cents')
