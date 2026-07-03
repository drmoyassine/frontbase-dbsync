"""Add portable-move state columns to edge_engines.

Revision ID: 0064
Revises: 73069b6c2c3e
Create Date: 2026-07-03

Adds three nullable columns backing the portable engine-move feature
(see docs/portable-engine-move-plan.md):
  - move_status       : null (normal) | 'moved_out' (soft-locked, pending move)
  - move_secret_hash  : sha256 hex of the one-time confirm token S (never bare S)
  - moved_out_at      : ISO timestamp; the TTL prune auto-reverts stale moves

The add_columns are idempotent under the env.py DDL contract (create_all runs
before upgrade), and the batch_alter_table form mirrors migration 0033.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0064'
down_revision: Union[str, Sequence[str], None] = '73069b6c2c3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.add_column(sa.Column('move_status', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('move_secret_hash', sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column('moved_out_at', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.drop_column('moved_out_at')
        batch_op.drop_column('move_secret_hash')
        batch_op.drop_column('move_status')
