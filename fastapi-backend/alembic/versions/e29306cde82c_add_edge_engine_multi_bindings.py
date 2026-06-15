"""add_edge_engine_multi_bindings

Revision ID: e29306cde82c
Revises: 0045_fix_ds_views_cols
Create Date: 2026-06-16 01:54:10.687521

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e29306cde82c'
down_revision: Union[str, Sequence[str], None] = '0045_fix_ds_views_cols'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('engine_datasources',
        sa.Column('engine_id', sa.String(), nullable=False),
        sa.Column('datasource_id', sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(['engine_id'], ['edge_engines.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('engine_id', 'datasource_id')
    )
    op.create_table('engine_storages',
        sa.Column('engine_id', sa.String(), nullable=False),
        sa.Column('storage_id', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['engine_id'], ['edge_engines.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['storage_id'], ['storage_providers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('engine_id', 'storage_id')
    )
    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.add_column(sa.Column('edge_auth_id', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.drop_column('edge_auth_id')
    op.drop_table('engine_storages')
    op.drop_table('engine_datasources')
