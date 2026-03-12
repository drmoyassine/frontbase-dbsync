"""Add storage_providers table

Revision ID: 0032_add_storage_providers
Revises: 0031_add_workflow_content_hash
Create Date: 2026-03-12
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '0032_add_storage_providers'
down_revision = '0031_add_workflow_content_hash'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name

    # Check if table already exists
    if dialect == 'sqlite':
        result = conn.execute(sa.text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='storage_providers'"
        ))
    else:
        result = conn.execute(sa.text(
            "SELECT tablename FROM pg_tables WHERE tablename='storage_providers'"
        ))

    if result.fetchone():
        return  # Already exists

    # Simple table creation without server defaults for cross-dialect safety
    op.create_table(
        'storage_providers',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('provider_account_id', sa.String(), nullable=False),
        sa.Column('config', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['provider_account_id'], ['edge_providers_accounts.id'], ondelete='CASCADE'),
    )


def downgrade():
    op.drop_table('storage_providers')
