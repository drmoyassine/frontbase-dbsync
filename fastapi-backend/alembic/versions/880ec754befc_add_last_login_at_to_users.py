"""add_last_login_at_to_users

Revision ID: 880ec754befc
Revises: 398ac30d65ff
Create Date: 2026-05-31 16:27:49.889678

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '880ec754befc'
down_revision: Union[str, Sequence[str], None] = '398ac30d65ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('users')]
    if 'last_login_at' not in columns:
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.add_column(sa.Column('last_login_at', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('users')]
    if 'last_login_at' in columns:
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.drop_column('last_login_at')
