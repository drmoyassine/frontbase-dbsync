"""Add page_deployments and content_hash

Revision ID: e510beacc2ae
Revises: e23b4c5d6f7a
Create Date: 2026-02-28 01:44:40.125635

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = 'e510beacc2ae'
down_revision: Union[str, Sequence[str], None] = 'e23b4c5d6f7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    try:
        with op.batch_alter_table('pages', schema=None) as batch_op:
            batch_op.add_column(sa.Column('content_hash', sa.String(length=64), nullable=True))
    except Exception as e:
        print("Column content_hash might already exist:", e)

    try:
        op.create_table('page_deployments',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('page_id', sa.String(), nullable=False),
            sa.Column('edge_engine_id', sa.String(), nullable=False),
            sa.Column('status', sa.String(), nullable=True),
            sa.Column('version', sa.Integer(), nullable=True),
            sa.Column('content_hash', sa.String(length=64), nullable=True),
            sa.Column('published_at', sa.String(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
            sa.ForeignKeyConstraint(['edge_engine_id'], ['edge_engines.id'], ),
            sa.ForeignKeyConstraint(['page_id'], ['pages.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('page_id', 'edge_engine_id', name='uq_page_engine')
        )
    except Exception as e:
        print("Table page_deployments might already exist:", e)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('page_deployments')

    with op.batch_alter_table('pages', schema=None) as batch_op:
        batch_op.drop_column('content_hash')
