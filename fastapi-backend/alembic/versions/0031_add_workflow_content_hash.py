"""Add content_hash to automation_drafts

Revision ID: 0031_add_workflow_content_hash
Revises: df956eaea66f
Create Date: 2026-03-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0031_add_workflow_content_hash'
down_revision: Union[str, Sequence[str], None] = 'df956eaea66f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c['name'] for c in inspector.get_columns('automation_drafts')]
    if 'content_hash' not in existing:
        op.add_column('automation_drafts', sa.Column('content_hash', sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column('automation_drafts', 'content_hash')
