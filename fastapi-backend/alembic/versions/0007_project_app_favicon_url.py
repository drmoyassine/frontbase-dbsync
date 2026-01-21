"""Add app_url and favicon_url to project table

Revision ID: 0007
Revises: 0006_fix_insert_uuid
Create Date: 2026-01-22

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0007_project_app_favicon_url'
down_revision = '0006_fix_insert_uuid'
branch_labels = None
depends_on = None


def upgrade():
    """Add app_url and favicon_url columns to project table."""
    # Use batch mode for SQLite compatibility
    with op.batch_alter_table('project', schema=None) as batch_op:
        batch_op.add_column(sa.Column('app_url', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('favicon_url', sa.String(), nullable=True))


def downgrade():
    """Remove app_url and favicon_url columns from project table."""
    with op.batch_alter_table('project', schema=None) as batch_op:
        batch_op.drop_column('favicon_url')
        batch_op.drop_column('app_url')
