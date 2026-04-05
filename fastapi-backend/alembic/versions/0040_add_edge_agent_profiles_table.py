"""Add edge_agent_profiles table

Revision ID: 0040_add_edge_agent_profiles_table
Revises: 0039_add_component_themes_table
Create Date: 2026-04-05 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0040_add_edge_agent_profiles_table'
down_revision: Union[str, Sequence[str], None] = '0039_add_component_themes_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'edge_agent_profiles' not in tables:
        op.create_table('edge_agent_profiles',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('engine_id', sa.String(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('slug', sa.String(length=50), nullable=False),
            sa.Column('system_prompt', sa.Text(), nullable=True),
            sa.Column('permissions', sa.Text(), nullable=True),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
            sa.ForeignKeyConstraint(['engine_id'], ['edge_engines.id'], ),
            sa.PrimaryKeyConstraint('id')
        )


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'edge_agent_profiles' in tables:
        op.drop_table('edge_agent_profiles')
