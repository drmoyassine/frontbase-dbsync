"""post-sprint 2.2: file_move_jobs table

Revision ID: 0051
Revises: 0050
Create Date: 2026-06-23

Tracks large cross-bucket / cross-provider file moves that run as background
jobs so the client can poll progress instead of blocking the request.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0051'
down_revision: Union[str, Sequence[str], None] = '0050'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use if_not_exists=True because the table may have been created by
    # Base.metadata.create_all during bootstrap before this migration runs.
    # This makes the migration idempotent for prod DBs that already ran bootstrap.
    op.create_table(
        'file_move_jobs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('source_provider_id', sa.String(), nullable=False),
        sa.Column('source_bucket', sa.String(), nullable=False),
        sa.Column('source_key', sa.String(), nullable=False),
        sa.Column('dest_provider_id', sa.String(), nullable=False),
        sa.Column('dest_bucket', sa.String(), nullable=False),
        sa.Column('dest_key', sa.String(), nullable=False),
        sa.Column('tenant_id', sa.String(), nullable=True),
        sa.Column('project_id', sa.String(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('phase', sa.String(length=20), nullable=True),
        sa.Column('bytes_total', sa.Integer(), nullable=False),
        sa.Column('bytes_transferred', sa.Integer(), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,  # <-- idempotent: no error if table already exists
    )


def downgrade() -> None:
    # Use if_exists=True for idempotent downgrade
    op.drop_table('file_move_jobs', if_exists=True)
