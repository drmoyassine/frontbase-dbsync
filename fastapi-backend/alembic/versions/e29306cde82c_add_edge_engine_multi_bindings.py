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
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()

    if 'engine_datasources' not in tables:
        op.create_table('engine_datasources',
            sa.Column('engine_id', sa.String(), nullable=False),
            sa.Column('datasource_id', sa.String(length=36), nullable=False),
            sa.ForeignKeyConstraint(['engine_id'], ['edge_engines.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('engine_id', 'datasource_id')
        )

    if 'engine_storages' not in tables:
        op.create_table('engine_storages',
            sa.Column('engine_id', sa.String(), nullable=False),
            sa.Column('storage_id', sa.String(), nullable=False),
            sa.ForeignKeyConstraint(['engine_id'], ['edge_engines.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['storage_id'], ['storage_providers.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('engine_id', 'storage_id')
        )

    if 'edge_engines' in tables:
        columns = [c['name'] for c in inspector.get_columns('edge_engines')]
        if 'edge_auth_id' not in columns:
            with op.batch_alter_table('edge_engines', schema=None) as batch_op:
                batch_op.add_column(sa.Column('edge_auth_id', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()

    if 'edge_engines' in tables:
        columns = [c['name'] for c in inspector.get_columns('edge_engines')]
        if 'edge_auth_id' in columns:
            with op.batch_alter_table('edge_engines', schema=None) as batch_op:
                batch_op.drop_column('edge_auth_id')

    if 'engine_storages' in tables:
        op.drop_table('engine_storages')

    if 'engine_datasources' in tables:
        op.drop_table('engine_datasources')
