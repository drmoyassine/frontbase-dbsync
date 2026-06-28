"""Add profile_slug to Agent tools.

Revision ID: 0060
Revises: 0059
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0060'
down_revision = '0059'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name

    from sqlalchemy import inspect
    inspector = inspect(conn)
    
    # Add profile_slug to mcp_servers
    tables = inspector.get_table_names()
    if 'mcp_servers' in tables:
        columns = [c['name'] for c in inspector.get_columns('mcp_servers')]
        if 'profile_slug' not in columns:
            if dialect == 'sqlite':
                op.add_column('mcp_servers', sa.Column('profile_slug', sa.String(length=80), nullable=True))
            else:
                op.add_column('mcp_servers', sa.Column('profile_slug', sa.String(length=80), nullable=True))

    # Add profile_slug to agent_skills
    if 'agent_skills' in tables:
        columns = [c['name'] for c in inspector.get_columns('agent_skills')]
        if 'profile_slug' not in columns:
            if dialect == 'sqlite':
                op.add_column('agent_skills', sa.Column('profile_slug', sa.String(length=80), nullable=True))
            else:
                op.add_column('agent_skills', sa.Column('profile_slug', sa.String(length=80), nullable=True))


def downgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name
    from sqlalchemy import inspect
    inspector = inspect(conn)

    tables = inspector.get_table_names()
    if 'mcp_servers' in tables:
        columns = [c['name'] for c in inspector.get_columns('mcp_servers')]
        if 'profile_slug' in columns:
            if dialect == 'sqlite':
                with op.batch_alter_table('mcp_servers') as batch_op:
                    batch_op.drop_column('profile_slug')
            else:
                op.drop_column('mcp_servers', 'profile_slug')

    if 'agent_skills' in tables:
        columns = [c['name'] for c in inspector.get_columns('agent_skills')]
        if 'profile_slug' in columns:
            if dialect == 'sqlite':
                with op.batch_alter_table('agent_skills') as batch_op:
                    batch_op.drop_column('profile_slug')
            else:
                op.drop_column('agent_skills', 'profile_slug')
