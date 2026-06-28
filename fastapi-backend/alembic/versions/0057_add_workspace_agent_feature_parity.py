"""add workspace-agent feature-parity tables + edge_agent_profiles columns

Brings the backend Workspace Agent toward feature parity with the Edge Agent:

  * mcp_servers          — registry of external MCP servers usable as tool sources
  * agent_skills         — installable skill bundles (built-in + custom)
  * agent_profile_skills — skill installation mapping per EdgeAgentProfile
  * agent_tools          — per-profile configured tools (workflow / mcp_server / skill)
  * agent_tool_audit     — append-only audit trail of Workspace Agent tool calls

Plus generation-parameter + tool-control columns on edge_agent_profiles
(temperature, max_tokens, top_p, excluded_tools, max_auto_tools, mcp_enabled,
skills_enabled) so master admin / self-host can tune the agent exactly like the
Edge Agent settings UI.

All five tables are also created by the startup Base.metadata.create_all(); this
migration exists for record-keeping and environments that run alembic upgrade
explicitly.

Revision ID: 0057
Revises: 0056
Create Date: 2026-06-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import reflection

revision: str = '0057'
down_revision: Union[str, Sequence[str], None] = '0056'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    tables = insp.get_table_names()

    # -------------------------------------------------------------------------
    # New tables
    # -------------------------------------------------------------------------
    if 'mcp_servers' not in tables:
        op.create_table(
            'mcp_servers',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('slug', sa.String(length=80), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('url', sa.String(length=500), nullable=False),
            sa.Column('transport', sa.String(length=30), nullable=False, server_default='streamable-http'),
            sa.Column('auth_type', sa.String(length=20), nullable=True),
            sa.Column('auth_config', sa.Text(), nullable=True),
            sa.Column('tool_filter', sa.Text(), nullable=True),
            sa.Column('category', sa.String(length=40), nullable=True),
            sa.Column('is_public', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('tenant_id', sa.String(length=36), nullable=True),
            sa.Column('project_id', sa.String(length=36), nullable=True),
            sa.Column('created_at', sa.String(length=50), nullable=False),
            sa.Column('updated_at', sa.String(length=50), nullable=False),
            sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('slug', 'tenant_id', 'project_id', name='uq_mcp_server_slug'),
        )
        op.create_index('ix_mcp_servers_tenant_id', 'mcp_servers', ['tenant_id'])
        op.create_index('ix_mcp_servers_project_id', 'mcp_servers', ['project_id'])

    if 'agent_skills' not in tables:
        op.create_table(
            'agent_skills',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('slug', sa.String(length=80), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('category', sa.String(length=40), nullable=True),
            sa.Column('tool_definitions', sa.Text(), nullable=False),
            sa.Column('version', sa.String(length=20), nullable=False, server_default='1.0.0'),
            sa.Column('is_builtin', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('tenant_id', sa.String(length=36), nullable=True),
            sa.Column('project_id', sa.String(length=36), nullable=True),
            sa.Column('created_at', sa.String(length=50), nullable=False),
            sa.Column('updated_at', sa.String(length=50), nullable=False),
            sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['project_id'], ['project.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('slug', 'tenant_id', 'project_id', name='uq_agent_skill_slug'),
        )
        op.create_index('ix_agent_skills_tenant_id', 'agent_skills', ['tenant_id'])
        op.create_index('ix_agent_skills_project_id', 'agent_skills', ['project_id'])

    if 'agent_profile_skills' not in tables:
        op.create_table(
            'agent_profile_skills',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('profile_id', sa.String(length=36), nullable=False),
            sa.Column('skill_id', sa.String(length=36), nullable=False),
            sa.Column('config_overrides', sa.Text(), nullable=True),
            sa.Column('installed_at', sa.String(length=50), nullable=False),
            sa.ForeignKeyConstraint(['profile_id'], ['edge_agent_profiles.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['skill_id'], ['agent_skills.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('profile_id', 'skill_id', name='uq_agent_profile_skill'),
        )
        op.create_index('ix_agent_profile_skills_profile_id', 'agent_profile_skills', ['profile_id'])
        op.create_index('ix_agent_profile_skills_skill_id', 'agent_profile_skills', ['skill_id'])

    if 'agent_tools' not in tables:
        op.create_table(
            'agent_tools',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('profile_id', sa.String(length=36), nullable=False),
            sa.Column('type', sa.String(length=20), nullable=False),
            sa.Column('name', sa.String(length=80), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('config', sa.Text(), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('created_at', sa.String(length=50), nullable=False),
            sa.Column('updated_at', sa.String(length=50), nullable=False),
            sa.ForeignKeyConstraint(['profile_id'], ['edge_agent_profiles.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_agent_tools_profile_id', 'agent_tools', ['profile_id'])

    if 'agent_tool_audit' not in tables:
        op.create_table(
            'agent_tool_audit',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('tenant_id', sa.String(length=36), nullable=True),
            sa.Column('project_id', sa.String(length=36), nullable=True),
            sa.Column('user_id', sa.String(length=36), nullable=True),
            sa.Column('profile_slug', sa.String(length=80), nullable=True),
            sa.Column('tool_name', sa.String(length=80), nullable=False),
            sa.Column('is_destructive', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('args', sa.Text(), nullable=True),
            sa.Column('result_summary', sa.Text(), nullable=True),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('duration_ms', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.String(length=50), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_agent_tool_audit_tenant_id', 'agent_tool_audit', ['tenant_id'])
        op.create_index('ix_agent_tool_audit_project_id', 'agent_tool_audit', ['project_id'])
        op.create_index('ix_agent_tool_audit_created_at', 'agent_tool_audit', ['created_at'])

    # -------------------------------------------------------------------------
    # edge_agent_profiles — feature-parity columns
    # -------------------------------------------------------------------------
    if 'edge_agent_profiles' in tables:
        columns = [c['name'] for c in insp.get_columns('edge_agent_profiles')]
        # batch_alter_table keeps this SQLite-safe (rebuild-on-alter).
        with op.batch_alter_table('edge_agent_profiles', schema=None) as batch_op:
            if 'temperature' not in columns:
                batch_op.add_column(sa.Column('temperature', sa.String(length=20), nullable=True))
            if 'max_tokens' not in columns:
                batch_op.add_column(sa.Column('max_tokens', sa.Integer(), nullable=True))
            if 'top_p' not in columns:
                batch_op.add_column(sa.Column('top_p', sa.String(length=20), nullable=True))
            if 'excluded_tools' not in columns:
                batch_op.add_column(sa.Column('excluded_tools', sa.Text(), nullable=True))
            if 'max_auto_tools' not in columns:
                batch_op.add_column(sa.Column('max_auto_tools', sa.Integer(), nullable=True))
            if 'mcp_enabled' not in columns:
                batch_op.add_column(sa.Column('mcp_enabled', sa.Boolean(), nullable=True, server_default='1'))
            if 'skills_enabled' not in columns:
                batch_op.add_column(sa.Column('skills_enabled', sa.Boolean(), nullable=True, server_default='1'))


def downgrade() -> None:
    bind = op.get_bind()
    insp = reflection.Inspector.from_engine(bind)
    tables = insp.get_table_names()

    if 'edge_agent_profiles' in tables:
        columns = [c['name'] for c in insp.get_columns('edge_agent_profiles')]
        with op.batch_alter_table('edge_agent_profiles', schema=None) as batch_op:
            for col in ('skills_enabled', 'mcp_enabled', 'max_auto_tools',
                        'excluded_tools', 'top_p', 'max_tokens', 'temperature'):
                if col in columns:
                    batch_op.drop_column(col)

    for table, indexes in (
        ('agent_tool_audit', ('ix_agent_tool_audit_created_at', 'ix_agent_tool_audit_project_id', 'ix_agent_tool_audit_tenant_id')),
        ('agent_tools', ('ix_agent_tools_profile_id',)),
        ('agent_profile_skills', ('ix_agent_profile_skills_skill_id', 'ix_agent_profile_skills_profile_id')),
        ('agent_skills', ('ix_agent_skills_project_id', 'ix_agent_skills_tenant_id')),
        ('mcp_servers', ('ix_mcp_servers_project_id', 'ix_mcp_servers_tenant_id')),
    ):
        if table in tables:
            # Drop unique constraints first (SQLite requires this before dropping the table)
            try:
                if table == 'mcp_servers':
                    op.drop_constraint('uq_mcp_server_slug', 'mcp_servers', type_='unique')
                elif table == 'agent_skills':
                    op.drop_constraint('uq_agent_skill_slug', 'agent_skills', type_='unique')
                elif table == 'agent_profile_skills':
                    op.drop_constraint('uq_agent_profile_skill', 'agent_profile_skills', type_='unique')
            except Exception:
                pass
            # Drop indexes
            for idx in indexes:
                try:
                    if idx in [i['name'] for i in insp.get_indexes(table)]:
                        op.drop_index(idx, table_name=table)
                except Exception:
                    pass
            op.drop_table(table)
