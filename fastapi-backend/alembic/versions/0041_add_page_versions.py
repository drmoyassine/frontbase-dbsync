"""Add page_versions table

Revision ID: 0041_add_page_versions
Revises: 0040_add_edge_agent_profiles_table
Create Date: 2026-04-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0041_add_page_versions'
down_revision: Union[str, Sequence[str], None] = '0040_add_edge_agent_profiles_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the page_versions table for version history & rollback."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'page_versions' not in tables:
        op.create_table('page_versions',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('page_id', sa.String(), nullable=False),
            sa.Column('version_number', sa.Integer(), nullable=False),
            sa.Column('layout_data', sa.Text(), nullable=False),
            sa.Column('content_hash', sa.String(length=64), nullable=True),
            sa.Column('label', sa.String(length=200), nullable=True),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.ForeignKeyConstraint(['page_id'], ['pages.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )


def downgrade() -> None:
    """Drop the page_versions table."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'page_versions' in tables:
        op.drop_table('page_versions')
