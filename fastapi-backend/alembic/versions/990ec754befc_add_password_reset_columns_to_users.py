"""add_password_reset_columns_to_users

Revision ID: 990ec754befc
Revises: 880ec754befc
Create Date: 2026-06-04 02:18:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '990ec754befc'
down_revision: Union[str, Sequence[str], None] = '63aaae535d12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('users')]
    
    with op.batch_alter_table('users', schema=None) as batch_op:
        if 'reset_token' not in columns:
            batch_op.add_column(sa.Column('reset_token', sa.String(), nullable=True))
        if 'reset_token_expires_at' not in columns:
            batch_op.add_column(sa.Column('reset_token_expires_at', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('users')]
    
    with op.batch_alter_table('users', schema=None) as batch_op:
        if 'reset_token' in columns:
            batch_op.drop_column('reset_token')
        if 'reset_token_expires_at' in columns:
            batch_op.drop_column('reset_token_expires_at')
