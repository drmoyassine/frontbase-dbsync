"""add project grants unique constraints

Revision ID: 73069b6c2c3e
Revises: 0063
Create Date: 2026-07-01 21:12:51.549989

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '73069b6c2c3e'
down_revision: Union[str, Sequence[str], None] = '0063'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'project_datasources' in tables:
        constraints = [c['name'] for c in inspector.get_unique_constraints('project_datasources')]
        if 'uq_project_datasources_project_id_datasource_id' not in constraints:
            with op.batch_alter_table('project_datasources', schema=None) as batch_op:
                batch_op.create_unique_constraint('uq_project_datasources_project_id_datasource_id', ['project_id', 'datasource_id'])

    if 'project_connected_accounts' in tables:
        constraints = [c['name'] for c in inspector.get_unique_constraints('project_connected_accounts')]
        if 'uq_project_connected_accounts_project_id_account_id' not in constraints:
            with op.batch_alter_table('project_connected_accounts', schema=None) as batch_op:
                batch_op.create_unique_constraint('uq_project_connected_accounts_project_id_account_id', ['project_id', 'account_id'])


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'project_datasources' in tables:
        constraints = [c['name'] for c in inspector.get_unique_constraints('project_datasources')]
        if 'uq_project_datasources_project_id_datasource_id' in constraints:
            with op.batch_alter_table('project_datasources', schema=None) as batch_op:
                batch_op.drop_constraint('uq_project_datasources_project_id_datasource_id', type_='unique')

    if 'project_connected_accounts' in tables:
        constraints = [c['name'] for c in inspector.get_unique_constraints('project_connected_accounts')]
        if 'uq_project_connected_accounts_project_id_account_id' in constraints:
            with op.batch_alter_table('project_connected_accounts', schema=None) as batch_op:
                batch_op.drop_constraint('uq_project_connected_accounts_project_id_account_id', type_='unique')
