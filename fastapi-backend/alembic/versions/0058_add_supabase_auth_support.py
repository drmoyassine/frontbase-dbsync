"""add supabase auth support

Revision ID: 0058
Revises: 0057
Create Date: 2024-06-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0058'
down_revision = '0057'
branch_labels = None
depends_on = None


def upgrade():
    """Create supabase_user_metadata table for storing tenant claims."""
    op.create_table(
        'supabase_user_metadata',
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('tenant_id', sa.String(), nullable=True),
        sa.Column('tenant_slug', sa.String(), nullable=True),
        sa.Column('role', sa.String(20), nullable=True, server_default='owner'),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('user_id')
    )
    # Create index for faster lookups by tenant
    op.create_index('ix_supabase_user_metadata_tenant_id', 'supabase_user_metadata', ['tenant_id'])


def downgrade():
    """Remove supabase_user_metadata table."""
    op.drop_index('ix_supabase_user_metadata_tenant_id', table_name='supabase_user_metadata')
    op.drop_table('supabase_user_metadata')
