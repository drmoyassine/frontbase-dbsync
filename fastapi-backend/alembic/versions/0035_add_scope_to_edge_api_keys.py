"""Add scope column to edge_api_keys

Revision ID: 0035
Revises: 0034_add_provider_config_to_resources
Create Date: 2026-03-23

Adds `scope` column (user | management | all) to edge_api_keys.
Existing keys default to 'user' for backward compatibility.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '0035_add_scope_to_edge_api_keys'
down_revision = '0034_add_provider_config_to_resources'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == 'sqlite':
        with op.batch_alter_table('edge_api_keys') as batch_op:
            batch_op.add_column(
                sa.Column('scope', sa.String(20), nullable=False, server_default='user')
            )
    else:
        op.add_column(
            'edge_api_keys',
            sa.Column('scope', sa.String(20), nullable=False, server_default='user')
        )


def downgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == 'sqlite':
        with op.batch_alter_table('edge_api_keys') as batch_op:
            batch_op.drop_column('scope')
    else:
        op.drop_column('edge_api_keys', 'scope')
