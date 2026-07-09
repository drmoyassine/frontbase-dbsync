"""Add gateway_metadata to plans and drop plan_change_requests

Revision ID: 8fc824848fb3
Revises: 0064
Create Date: 2026-07-07 23:17:07.701604

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8fc824848fb3'
down_revision: Union[str, Sequence[str], None] = '0064'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_table('plan_change_requests')
    with op.batch_alter_table('plans', schema=None) as batch_op:
        batch_op.add_column(sa.Column('gateway_metadata', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('plans', schema=None) as batch_op:
        batch_op.drop_column('gateway_metadata')

    op.create_table('plan_change_requests',
    sa.Column('id', sa.VARCHAR(), nullable=False),
    sa.Column('tenant_id', sa.VARCHAR(), nullable=False),
    sa.Column('from_plan', sa.VARCHAR(length=50), nullable=False),
    sa.Column('to_plan', sa.VARCHAR(length=50), nullable=False),
    sa.Column('direction', sa.VARCHAR(length=20), nullable=False),
    sa.Column('status', sa.VARCHAR(length=20), nullable=True),
    sa.Column('note', sa.TEXT(), nullable=True),
    sa.Column('admin_note', sa.TEXT(), nullable=True),
    sa.Column('requested_by', sa.VARCHAR(), nullable=False),
    sa.Column('reviewed_by', sa.VARCHAR(), nullable=True),
    sa.Column('created_at', sa.VARCHAR(), nullable=False),
    sa.Column('reviewed_at', sa.VARCHAR(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
