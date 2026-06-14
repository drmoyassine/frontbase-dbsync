"""tenant_scoping_columns

Revision ID: 3ff5da2b43e2
Revises: 0043
Create Date: 2026-04-18 02:04:39.531265

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = '3ff5da2b43e2'
down_revision: Union[str, Sequence[str], None] = '0043'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()

    if 'app_variables' in tables:
        with op.batch_alter_table('app_variables', schema=None) as batch_op:
            columns = [c['name'] for c in inspector.get_columns('app_variables')]
            if 'project_id' not in columns:
                batch_op.add_column(sa.Column('project_id', sa.String(), nullable=True))
                batch_op.create_foreign_key('fk_app_variables_project_id_project', 'project', ['project_id'], ['id'])

    if 'automation_drafts' in tables:
        with op.batch_alter_table('automation_drafts', schema=None) as batch_op:
            columns = [c['name'] for c in inspector.get_columns('automation_drafts')]
            if 'project_id' not in columns:
                batch_op.add_column(sa.Column('project_id', sa.String(), nullable=True))
                batch_op.create_foreign_key('fk_automation_drafts_project_id_project', 'project', ['project_id'], ['id'])

    if 'edge_caches' in tables:
        with op.batch_alter_table('edge_caches', schema=None) as batch_op:
            columns = [c['name'] for c in inspector.get_columns('edge_caches')]
            if 'project_id' not in columns:
                batch_op.add_column(sa.Column('project_id', sa.String(), nullable=True))
                batch_op.create_foreign_key('fk_edge_caches_project_id_project', 'project', ['project_id'], ['id'])

    if 'edge_databases' in tables:
        with op.batch_alter_table('edge_databases', schema=None) as batch_op:
            columns = [c['name'] for c in inspector.get_columns('edge_databases')]
            if 'project_id' not in columns:
                batch_op.add_column(sa.Column('project_id', sa.String(), nullable=True))
                batch_op.create_foreign_key('fk_edge_databases_project_id_project', 'project', ['project_id'], ['id'])

    if 'edge_engines' in tables:
        with op.batch_alter_table('edge_engines', schema=None) as batch_op:
            columns = [c['name'] for c in inspector.get_columns('edge_engines')]
            if 'project_id' not in columns:
                batch_op.add_column(sa.Column('project_id', sa.String(), nullable=True))
                batch_op.create_foreign_key('fk_edge_engines_project_id_project', 'project', ['project_id'], ['id'])

    if 'storage_providers' in tables:
        with op.batch_alter_table('storage_providers', schema=None) as batch_op:
            columns = [c['name'] for c in inspector.get_columns('storage_providers')]
            if 'project_id' not in columns:
                batch_op.add_column(sa.Column('project_id', sa.String(), nullable=True))
                batch_op.create_foreign_key('fk_storage_providers_project_id_project', 'project', ['project_id'], ['id'])

    if 'sync_configs' in tables:
        with op.batch_alter_table('sync_configs', schema=None) as batch_op:
            columns = [c['name'] for c in inspector.get_columns('sync_configs')]
            if 'project_id' not in columns:
                batch_op.add_column(sa.Column('project_id', sa.String(), nullable=True))
                batch_op.create_foreign_key('fk_sync_configs_project_id_project', 'project', ['project_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('sync_configs', schema=None) as batch_op:
        batch_op.drop_constraint('fk_sync_configs_project_id_project', type_='foreignkey')
        batch_op.drop_column('project_id')

    with op.batch_alter_table('storage_providers', schema=None) as batch_op:
        batch_op.drop_constraint('fk_storage_providers_project_id_project', type_='foreignkey')
        batch_op.drop_column('project_id')

    with op.batch_alter_table('edge_engines', schema=None) as batch_op:
        batch_op.drop_constraint('fk_edge_engines_project_id_project', type_='foreignkey')
        batch_op.drop_column('project_id')

    with op.batch_alter_table('edge_databases', schema=None) as batch_op:
        batch_op.drop_constraint('fk_edge_databases_project_id_project', type_='foreignkey')
        batch_op.drop_column('project_id')

    with op.batch_alter_table('edge_caches', schema=None) as batch_op:
        batch_op.drop_constraint('fk_edge_caches_project_id_project', type_='foreignkey')
        batch_op.drop_column('project_id')

    with op.batch_alter_table('automation_drafts', schema=None) as batch_op:
        batch_op.drop_constraint('fk_automation_drafts_project_id_project', type_='foreignkey')
        batch_op.drop_column('project_id')

    with op.batch_alter_table('app_variables', schema=None) as batch_op:
        batch_op.drop_constraint('fk_app_variables_project_id_project', type_='foreignkey')
        batch_op.drop_column('project_id')

