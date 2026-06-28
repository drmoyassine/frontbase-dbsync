"""Workspace Agent domain models.

Tables backing the Workspace Agent's feature-parity layer with the Edge Agent:

  * ``mcp_servers``         — registry of external MCP servers the agent can call as tools
  * ``agent_skills``        — registry of installable skill bundles (built-in + custom)
  * ``agent_profile_skills``— which skills are installed on which EdgeAgentProfile
  * ``agent_tools``         — per-profile configured tools (workflow-as-tool, MCP client, skill)
  * ``agent_tool_audit``    — append-only audit trail of destructive/tool calls
  * ``tenant_agent_settings``— tenant/user-side overrides exposed via the gear-icon modal

These mirror the Edge Engine's ``agent_tools`` SQLite table
(``services/edge/src/storage/schema.ts``) and extend the model with tenant +
project isolation columns required for cloud multi-tenancy.

See docs/plans/workspace-agent-feature-parity.md.
"""

from sqlalchemy import Column, String, Text, Boolean, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database.config import Base


class McpServer(Base):
    """An external MCP server the Workspace Agent can connect to as a tool source.

    Scoped by tenant + project. ``is_public`` rows (master-admin only) are visible
    to every tenant as read-only catalogue entries. Credentials are stored
    Fernet-encrypted in ``auth_config``.
    """
    __tablename__ = "mcp_servers"
    __table_args__ = (
        UniqueConstraint('slug', 'tenant_id', 'project_id', name='uq_mcp_server_slug'),
    )

    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(80), nullable=False)
    description = Column(Text, nullable=True)
    url = Column(String(500), nullable=False)
    transport = Column(String(30), nullable=False, default="streamable-http")  # streamable-http | sse | stdio
    auth_type = Column(String(20), nullable=True)        # bearer | basic | none
    auth_config = Column(Text, nullable=True)            # JSON — Fernet-encrypted {token|username,password|headers}
    tool_filter = Column(Text, nullable=True)            # JSON array of tool names to import (null = all)
    category = Column(String(40), nullable=True)         # database | web | utility | integration
    is_public = Column(Boolean, default=False)           # Global catalogue entry (master admin only)
    is_active = Column(Boolean, default=True)
    profile_slug = Column(String(80), nullable=True)     # 'workspace' or 'support' (tenant_id IS NULL only)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(String, ForeignKey("project.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class AgentSkill(Base):
    """An installable skill bundle — a packaged set of tool definitions + config.

    Built-in skills (``is_builtin=True``) ship with Frontbase and are tenant-wide
    (``project_id`` NULL). Custom skills are scoped to a tenant and optionally a
    specific project.
    """
    __tablename__ = "agent_skills"
    __table_args__ = (
        UniqueConstraint('slug', 'tenant_id', 'project_id', name='uq_agent_skill_slug'),
    )

    id = Column(String, primary_key=True)
    slug = Column(String(80), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(40), nullable=True)         # utility | data | integration
    tool_definitions = Column(Text, nullable=False)       # JSON array of tool schemas
    version = Column(String(20), nullable=False, default="1.0.0")
    is_builtin = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    profile_slug = Column(String(80), nullable=True)     # 'workspace' or 'support' (tenant_id IS NULL only)
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(String, ForeignKey("project.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class AgentProfileSkill(Base):
    """Installation of an AgentSkill onto an EdgeAgentProfile (with optional config overrides)."""
    __tablename__ = "agent_profile_skills"
    __table_args__ = (
        UniqueConstraint('profile_id', 'skill_id', name='uq_agent_profile_skill'),
    )

    id = Column(String, primary_key=True)
    profile_id = Column(String, ForeignKey("edge_agent_profiles.id", ondelete="CASCADE"), nullable=False)
    skill_id = Column(String, ForeignKey("agent_skills.id", ondelete="CASCADE"), nullable=False)
    config_overrides = Column(Text, nullable=True)        # JSON
    installed_at = Column(String, nullable=False)

    profile = relationship("EdgeAgentProfile")
    skill = relationship("AgentSkill")


class AgentTool(Base):
    """A per-profile configured tool — the backend equivalent of the Edge ``agent_tools`` table.

    ``type`` discriminates the shape of ``config``:
      * ``workflow``    — {workflow_id, parameters[]}
      * ``mcp_server``  — {mcp_server_id, tool_filter[]}
      * ``skill``       — {skill_id}
    """
    __tablename__ = "agent_tools"

    id = Column(String, primary_key=True)
    profile_id = Column(String, ForeignKey("edge_agent_profiles.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(20), nullable=False)             # workflow | mcp_server | skill
    name = Column(String(80), nullable=False)
    description = Column(Text, nullable=True)
    config = Column(Text, nullable=False)                 # JSON (type-discriminated)
    is_active = Column(Boolean, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    profile = relationship("EdgeAgentProfile")


class AgentToolAudit(Base):
    """Append-only audit trail of Workspace Agent tool calls.

    Written for every tool invocation (and especially destructive ones) so there
    is a redeploy-surviving, centralized record of what the agent did, scoped by
    tenant + project + user.
    """
    __tablename__ = "agent_tool_audit"

    id = Column(String, primary_key=True)
    tenant_id = Column(String, nullable=True, index=True)
    project_id = Column(String, nullable=True, index=True)
    user_id = Column(String, nullable=True)
    profile_slug = Column(String(80), nullable=True)
    tool_name = Column(String(80), nullable=False)
    is_destructive = Column(Boolean, default=False)
    args = Column(Text, nullable=True)                    # JSON (secrets masked)
    result_summary = Column(Text, nullable=True)          # JSON (truncated + secrets masked)
    status = Column(String(20), nullable=False)           # success | error | denied
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(String, nullable=False, index=True)


class TenantAgentSettings(Base):
    """Tenant / user-side Workspace Agent overrides (gear-icon modal).

    One row per (tenant, user) pair. ``user_id IS NULL`` is the tenant-wide
    default; a populated ``user_id`` is that user's personal override (which
    wins over the tenant default at apply time).

    ``tenant_id`` and ``user_id`` are plain nullable strings (no FK) — matching
    ``AgentToolAudit`` — so the table works across cloud (SuperTokens user ids)
    and self-host (master admin) without cross-edition FK drift. ``settings``
    stores the JSON-serialized ``AgentSettings`` envelope.

    Cloud: ``tenant_id`` is the tenant; a user row is keyed on the SuperTokens
    user id. Self-host: ``tenant_id`` is NULL and ``user_id`` is the admin id,
    so self-host users get the same per-user override behaviour.
    """
    __tablename__ = "tenant_agent_settings"
    __table_args__ = (
        # Composite uniqueness for the user-specific case. SQLite treats NULL
        # user_id as distinct, so the single tenant-default row is additionally
        # enforced by the upsert in app.routers.agent_settings.
        UniqueConstraint('tenant_id', 'user_id', name='uq_tenant_user_agent_settings'),
    )

    id = Column(String, primary_key=True)
    tenant_id = Column(String, nullable=True, index=True)
    user_id = Column(String, nullable=True, index=True)
    settings = Column(Text, nullable=False)        # JSON — AgentSettings envelope
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
