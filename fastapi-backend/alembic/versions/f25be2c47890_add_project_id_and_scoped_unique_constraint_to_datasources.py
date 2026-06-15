"""add_project_id_and_scoped_unique_constraint_to_datasources

Revision ID: f25be2c47890
Revises: e29306cde82c
Create Date: 2026-06-16 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f25be2c47890'
down_revision: Union[str, Sequence[str], None] = 'e29306cde82c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()

    if 'datasources' in tables:
        columns = [c['name'] for c in inspector.get_columns('datasources')]
        
        # 1. Add project_id column if it doesn't exist
        if 'project_id' not in columns:
            with op.batch_alter_table('datasources', schema=None) as batch_op:
                batch_op.add_column(sa.Column('project_id', sa.String(length=36), nullable=True))
        
        # 2. Drop the old global unique constraint on name
        if bind.dialect.name == 'sqlite':
            # In SQLite, drop the unique constraint by reconstructing the table (uses python model config)
            # This is safer to do via recreate='always' batch alter.
            with op.batch_alter_table('datasources', schema=None, recreate='always') as batch_op:
                pass
        else:
            # Find and drop unique constraint on 'name' in PostgreSQL (or others)
            unique_constraints = inspector.get_unique_constraints('datasources')
            for uc in unique_constraints:
                if len(uc['column_names']) == 1 and 'name' in uc['column_names']:
                    with op.batch_alter_table('datasources', schema=None) as batch_op:
                        batch_op.drop_constraint(uc['name'], type_='unique')
                    break
        
        # 3. Create the new composite unique constraint on (project_id, name)
        unique_constraints = inspector.get_unique_constraints('datasources')
        has_composite = False
        for uc in unique_constraints:
            if set(uc['column_names']) == {'project_id', 'name'}:
                has_composite = True
                break
        
        if not has_composite:
            with op.batch_alter_table('datasources', schema=None) as batch_op:
                batch_op.create_unique_constraint('uq_datasources_project_id_name', ['project_id', 'name'])


def downgrade() -> None:
    """Downgrade schema."""
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()

    if 'datasources' in tables:
        # 1. Drop composite unique constraint
        unique_constraints = inspector.get_unique_constraints('datasources')
        for uc in unique_constraints:
            if set(uc['column_names']) == {'project_id', 'name'}:
                with op.batch_alter_table('datasources', schema=None) as batch_op:
                    batch_op.drop_constraint(uc['name'], type_='unique')
                break

        # 2. Restore global unique constraint on name
        with op.batch_alter_table('datasources', schema=None) as batch_op:
            batch_op.create_unique_constraint('datasources_name_key', ['name'])

        # 3. Drop project_id column
        columns = [c['name'] for c in inspector.get_columns('datasources')]
        if 'project_id' in columns:
            with op.batch_alter_table('datasources', schema=None) as batch_op:
                batch_op.drop_column('project_id')
