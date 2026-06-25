"""add automation_versions table

Revision ID: 0052
Revises: 0051
Create Date: 2026-06-25

Tracks workflow/automation versions for history and rollback.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0052'
down_revision: Union[str, Sequence[str], None] = '0051'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'automation_versions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('automation_id', sa.String(length=36), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('trigger_type', sa.String(length=50), nullable=False),
        sa.Column('trigger_config', sa.JSON(), nullable=True),
        sa.Column('nodes', sa.JSON(), nullable=False),
        sa.Column('edges', sa.JSON(), nullable=False),
        sa.Column('settings', sa.JSON(), nullable=True),
        sa.Column('content_hash', sa.String(length=64), nullable=True),
        sa.Column('label', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('created_by', sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(['automation_id'], ['automation_drafts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_table('automation_versions', if_exists=True)
