"""add provider_account_id FK to edge infra and datasources

Revision ID: df956eaea66f
Revises: 0030_add_datasource_views_description
Create Date: 2026-03-09 04:29:30.681323

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'df956eaea66f'
down_revision: Union[str, Sequence[str], None] = '0030_add_datasource_views_description'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add provider_account_id FK to edge_databases, edge_caches, edge_queues."""
    with op.batch_alter_table('edge_databases', schema=None) as batch_op:
        batch_op.add_column(sa.Column('provider_account_id', sa.String(), nullable=True))
        batch_op.create_foreign_key(
            'fk_edge_databases_provider_account',
            'edge_providers_accounts', ['provider_account_id'], ['id']
        )

    with op.batch_alter_table('edge_caches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('provider_account_id', sa.String(), nullable=True))
        batch_op.create_foreign_key(
            'fk_edge_caches_provider_account',
            'edge_providers_accounts', ['provider_account_id'], ['id']
        )

    with op.batch_alter_table('edge_queues', schema=None) as batch_op:
        batch_op.add_column(sa.Column('provider_account_id', sa.String(), nullable=True))
        batch_op.create_foreign_key(
            'fk_edge_queues_provider_account',
            'edge_providers_accounts', ['provider_account_id'], ['id']
        )


def downgrade() -> None:
    """Remove provider_account_id FK from edge tables."""
    with op.batch_alter_table('edge_queues', schema=None) as batch_op:
        batch_op.drop_constraint('fk_edge_queues_provider_account', type_='foreignkey')
        batch_op.drop_column('provider_account_id')

    with op.batch_alter_table('edge_caches', schema=None) as batch_op:
        batch_op.drop_constraint('fk_edge_caches_provider_account', type_='foreignkey')
        batch_op.drop_column('provider_account_id')

    with op.batch_alter_table('edge_databases', schema=None) as batch_op:
        batch_op.drop_constraint('fk_edge_databases_provider_account', type_='foreignkey')
        batch_op.drop_column('provider_account_id')
