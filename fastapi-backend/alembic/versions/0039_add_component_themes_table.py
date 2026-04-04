"""Add component_themes table

Revision ID: 4826829a48f5
Revises: 0038_fix_auth_forms_batch_alter
Create Date: 2026-04-04 04:27:00.545179

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = '0039_add_component_themes_table'
down_revision: Union[str, Sequence[str], None] = '0038_fix_auth_forms_batch_alter'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    
    if 'component_themes' not in tables:
        op.create_table('component_themes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('component_type', sa.String(length=50), nullable=False),
        sa.Column('styles_data', sa.Text(), nullable=False),
        sa.Column('is_system', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id')
        )

def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    
    if 'component_themes' in tables:
        op.drop_table('component_themes')
