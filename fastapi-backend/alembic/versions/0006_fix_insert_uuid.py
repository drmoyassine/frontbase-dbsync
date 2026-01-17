"""Fix insert uuid (noop)

Revision ID: 0006_fix_insert_uuid
Revises: 0005_fix_preseed_insert
Create Date: 2026-01-18 00:45:00

This migration is now a no-op as the fix was integrated into 0005.
Kept to preserve migration chain history.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0006_fix_insert_uuid'
down_revision: Union[str, None] = '0005_fix_preseed_insert'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op."""
    pass


def downgrade() -> None:
    """No-op."""
    pass
