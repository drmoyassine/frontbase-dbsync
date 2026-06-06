"""add_project_id_to_api_keys_and_agent_profiles

Revision ID: 440c4f10942f
Revises: 82c103298c41
Create Date: 2026-06-06 00:19:47.452327

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '440c4f10942f'
down_revision: Union[str, Sequence[str], None] = '82c103298c41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. edge_agent_profiles
    if 'edge_agent_profiles' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('edge_agent_profiles')]
        if 'project_id' not in columns:
            with op.batch_alter_table('edge_agent_profiles') as batch_op:
                batch_op.add_column(sa.Column('project_id', sa.String(), nullable=True))
                batch_op.create_foreign_key('fk_edge_agent_profiles_project_id', 'project', ['project_id'], ['id'])

    # 2. edge_api_keys
    if 'edge_api_keys' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('edge_api_keys')]
        if 'project_id' not in columns:
            with op.batch_alter_table('edge_api_keys') as batch_op:
                batch_op.add_column(sa.Column('project_id', sa.String(), nullable=True))
                batch_op.create_foreign_key('fk_edge_api_keys_project_id', 'project', ['project_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if 'edge_api_keys' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('edge_api_keys')]
        if 'project_id' in columns:
            with op.batch_alter_table('edge_api_keys') as batch_op:
                batch_op.drop_constraint('fk_edge_api_keys_project_id', type_='foreignkey')
                batch_op.drop_column('project_id')

    if 'edge_agent_profiles' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('edge_agent_profiles')]
        if 'project_id' in columns:
            with op.batch_alter_table('edge_agent_profiles') as batch_op:
                batch_op.drop_constraint('fk_edge_agent_profiles_project_id', type_='foreignkey')
                batch_op.drop_column('project_id')
