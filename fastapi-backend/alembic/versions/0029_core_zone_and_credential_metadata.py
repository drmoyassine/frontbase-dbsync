"""Add is_forked, modified_core_files to edge_engines and provider_metadata to edge_providers_accounts.

Revision ID: 0029
Revises: 0028_sync_missing_columns
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '0029_core_zone_and_credential_metadata'
down_revision = '0028_sync_missing_columns'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    # --- edge_engines: is_forked, modified_core_files ---
    if dialect == 'sqlite':
        with op.batch_alter_table('edge_engines') as batch_op:
            batch_op.add_column(sa.Column('is_forked', sa.Boolean(), server_default='0', nullable=True))
            batch_op.add_column(sa.Column('modified_core_files', sa.Text(), nullable=True))
    else:
        op.add_column('edge_engines', sa.Column('is_forked', sa.Boolean(), server_default='false', nullable=True))
        op.add_column('edge_engines', sa.Column('modified_core_files', sa.Text(), nullable=True))

    # --- edge_providers_accounts: provider_metadata ---
    if dialect == 'sqlite':
        with op.batch_alter_table('edge_providers_accounts') as batch_op:
            batch_op.add_column(sa.Column('provider_metadata', sa.Text(), nullable=True))
    else:
        op.add_column('edge_providers_accounts', sa.Column('provider_metadata', sa.Text(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == 'sqlite':
        with op.batch_alter_table('edge_providers_accounts') as batch_op:
            batch_op.drop_column('provider_metadata')
        with op.batch_alter_table('edge_engines') as batch_op:
            batch_op.drop_column('modified_core_files')
            batch_op.drop_column('is_forked')
    else:
        op.drop_column('edge_providers_accounts', 'provider_metadata')
        op.drop_column('edge_engines', 'modified_core_files')
        op.drop_column('edge_engines', 'is_forked')
