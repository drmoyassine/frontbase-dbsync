"""edge_providers_and_engines

Revision ID: 7db54b70a363
Revises: 0020_add_provider_config
Create Date: 2026-02-25 16:15:13.761863

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7db54b70a363'
down_revision: Union[str, Sequence[str], None] = '0020_add_provider_config'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()

    # 1. Create edge_providers_accounts table
    if 'edge_providers_accounts' not in tables:
        op.create_table('edge_providers_accounts',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('provider', sa.String(length=50), nullable=False),
            sa.Column('provider_credentials', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=True),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )

    # 2. Rename deployment_targets to edge_engines
    if 'deployment_targets' in tables and 'edge_engines' not in tables:
        op.rename_table('deployment_targets', 'edge_engines')
    elif 'deployment_targets' in tables and 'edge_engines' in tables:
        op.drop_table('deployment_targets')

    # Re-evaluate tables and inspector after rename
    inspector = inspect(conn)
    tables = inspector.get_table_names()

    # 3. Batch alter edge_engines to rename/add/drop columns
    if 'edge_engines' in tables:
        columns = [c['name'] for c in inspector.get_columns('edge_engines')]
        # We only alter if columns are not already in the new shape
        if 'edge_provider_id' not in columns or 'provider_config' in columns or 'provider' in columns:
            with op.batch_alter_table('edge_engines', schema=None) as batch_op:
                if 'edge_provider_id' not in columns:
                    batch_op.add_column(sa.Column('edge_provider_id', sa.String(), nullable=True))
                if 'provider_config' in columns:
                    batch_op.alter_column('provider_config', new_column_name='engine_config', existing_type=sa.Text())
                if 'provider' in columns:
                    batch_op.drop_column('provider')



def downgrade() -> None:
    # 1. Revert edge_engines columns
    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.add_column(sa.Column('provider', sa.String(length=50), nullable=True))
        # Drop the foreign key (by name if we created it with a name)
        batch_op.drop_constraint('fk_edge_engines_provider_id', type_='foreignkey')
        batch_op.alter_column('engine_config', new_column_name='provider_config', existing_type=sa.Text())
        batch_op.drop_column('edge_provider_id')

    # 2. Rename back to deployment_targets
    op.rename_table('edge_engines', 'deployment_targets')

    # 3. Drop edge_providers_accounts table
    op.drop_table('edge_providers_accounts')
