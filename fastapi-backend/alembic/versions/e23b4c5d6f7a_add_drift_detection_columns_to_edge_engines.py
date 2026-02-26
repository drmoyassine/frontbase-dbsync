"""add_drift_detection_columns_to_edge_engines

Revision ID: e23b4c5d6f7a
Revises: d12a3b4c5e6f
Create Date: 2026-02-27 01:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e23b4c5d6f7a'
down_revision: Union[str, Sequence[str], None] = 'd12a3b4c5e6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add drift detection columns to edge_engines."""
    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.add_column(sa.Column('bundle_checksum', sa.String(64), nullable=True))
        batch_op.add_column(sa.Column('config_checksum', sa.String(64), nullable=True))
        batch_op.add_column(sa.Column('last_deployed_at', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('last_synced_at', sa.String(), nullable=True))


def downgrade() -> None:
    """Remove drift detection columns."""
    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.drop_column('last_synced_at')
        batch_op.drop_column('last_deployed_at')
        batch_op.drop_column('config_checksum')
        batch_op.drop_column('bundle_checksum')
