"""add_is_system_to_edge_caches_and_seed_local_redis

Revision ID: d12a3b4c5e6f
Revises: c79d5e6983cc
Create Date: 2026-02-26 03:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers, used by Alembic.
revision: str = 'd12a3b4c5e6f'
down_revision: Union[str, Sequence[str], None] = 'c79d5e6983cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SYSTEM_CACHE_ID = 'system-local-redis'


def upgrade() -> None:
    """Add is_system column and seed the Local Redis system cache."""
    with op.batch_alter_table('edge_caches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_system', sa.Boolean(), nullable=True, server_default=sa.text('0')))

    # Seed the Local Redis system cache
    now = datetime.utcnow().isoformat() + 'Z'
    edge_caches = sa.table(
        'edge_caches',
        sa.column('id', sa.String),
        sa.column('name', sa.String),
        sa.column('provider', sa.String),
        sa.column('cache_url', sa.String),
        sa.column('cache_token', sa.String),
        sa.column('is_default', sa.Boolean),
        sa.column('is_system', sa.Boolean),
        sa.column('created_at', sa.String),
        sa.column('updated_at', sa.String),
    )
    op.execute(
        edge_caches.insert().values(
            id=SYSTEM_CACHE_ID,
            name='Local Redis',
            provider='redis',
            cache_url='redis://redis:6379',
            cache_token=None,
            is_default=True,
            is_system=True,
            created_at=now,
            updated_at=now,
        )
    )


def downgrade() -> None:
    """Remove the system cache and the is_system column."""
    # Delete the seeded system cache
    edge_caches = sa.table('edge_caches', sa.column('id', sa.String))
    op.execute(edge_caches.delete().where(edge_caches.c.id == SYSTEM_CACHE_ID))

    with op.batch_alter_table('edge_caches', schema=None) as batch_op:
        batch_op.drop_column('is_system')
