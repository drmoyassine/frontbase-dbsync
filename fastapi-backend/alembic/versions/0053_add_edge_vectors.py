"""add edge_vectors table

Revision ID: 0053
Revises: 0052
Create Date: 2026-06-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import reflection

revision: str = '0053'
down_revision: Union[str, Sequence[str], None] = '0052'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    tables = insp.get_table_names()
    
    if 'edge_vectors' not in tables:
        op.create_table(
            'edge_vectors',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('provider', sa.String(length=50), nullable=False),
            sa.Column('vector_url', sa.String(length=500), nullable=False),
            sa.Column('vector_token', sa.String(length=1000), nullable=True),
            sa.Column('provider_account_id', sa.String(length=36), nullable=True),
            sa.Column('provider_config', sa.Text(), nullable=True),
            sa.Column('project_id', sa.String(length=36), nullable=True),
            sa.Column('is_default', sa.Boolean(), nullable=True, default=False),
            sa.Column('is_system', sa.Boolean(), nullable=True, default=False),
            sa.Column('created_at', sa.String(length=50), nullable=False),
            sa.Column('updated_at', sa.String(length=50), nullable=False),
            sa.ForeignKeyConstraint(['provider_account_id'], ['edge_providers_accounts.id']),
            sa.ForeignKeyConstraint(['project_id'], ['project.id']),
            sa.PrimaryKeyConstraint('id')
        )
    
    columns = [c['name'] for c in insp.get_columns('edge_engines')]
    if 'edge_vector_id' not in columns:
        with op.batch_alter_table('edge_engines') as batch_op:
            batch_op.add_column(sa.Column('edge_vector_id', sa.String(length=36), nullable=True))
            batch_op.create_foreign_key('fk_edge_engines_edge_vectors', 'edge_vectors', ['edge_vector_id'], ['id'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    
    columns = [c['name'] for c in insp.get_columns('edge_engines')]
    if 'edge_vector_id' in columns:
        with op.batch_alter_table('edge_engines') as batch_op:
            # Drop constraint might fail on SQLite if not handled via batch
            try:
                batch_op.drop_constraint('fk_edge_engines_edge_vectors', type_='foreignkey')
            except Exception:
                pass
            batch_op.drop_column('edge_vector_id')
            
    tables = insp.get_table_names()
    if 'edge_vectors' in tables:
        op.drop_table('edge_vectors')
