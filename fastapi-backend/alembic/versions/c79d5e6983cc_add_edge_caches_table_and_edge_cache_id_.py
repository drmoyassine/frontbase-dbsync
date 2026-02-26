"""add_edge_caches_table_and_edge_cache_id_fk

Revision ID: c79d5e6983cc
Revises: 7db54b70a363
Create Date: 2026-02-26 03:03:06.435052

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c79d5e6983cc'
down_revision: Union[str, Sequence[str], None] = '7db54b70a363'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create edge_caches table and add edge_cache_id FK to edge_engines."""
    # Drop edge_caches if it was partially created by a failed auto-migration
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'edge_caches' in inspector.get_table_names():
        op.drop_table('edge_caches')

    # Create the edge_caches table
    op.create_table(
        'edge_caches',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('cache_url', sa.String(length=500), nullable=False),
        sa.Column('cache_token', sa.String(length=1000), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # Add edge_cache_id FK to edge_engines (batch mode for SQLite compat)
    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.add_column(sa.Column('edge_cache_id', sa.String(), nullable=True))
        batch_op.create_foreign_key(
            'fk_edge_engines_edge_cache_id',
            'edge_caches',
            ['edge_cache_id'],
            ['id'],
        )


def downgrade() -> None:
    """Drop edge_cache_id FK from edge_engines and drop edge_caches table."""
    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.drop_constraint('fk_edge_engines_edge_cache_id', type_='foreignkey')
        batch_op.drop_column('edge_cache_id')

    op.drop_table('edge_caches')
