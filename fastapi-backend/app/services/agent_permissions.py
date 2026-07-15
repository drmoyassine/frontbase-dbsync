"""Workspace Agent permission system + two-level (tenant + project) isolation.

This is the security primitive that lets the Workspace Agent "manage anything in
the project" safely. It mirrors the Edge Agent's ``{ resource: [actions] }``
deny-by-default matrix (see ``services/edge/src/engine/agent/tools.ts``) and adds
the cloud multi-tenant requirement: every tool call is scoped to BOTH the caller's
tenant AND their active project.

Permission model
----------------
Permissions are a JSON dict ``{ "<resource>": ["<action>", ...] }``.

  * **Resources** use a dotted namespace:
      ``pages.all``, ``datasources.{id}``, ``datasources.all``, ``workflows.all``,
      ``engine.all``, ``edges.all``, ``providers.all``, ``styles.all``, ``seo.all``,
      ``mcp_servers.all``, ``skills.all``, ``api.{tag}``, ``api.all``
  * **Actions**: ``read`` | ``write`` | ``trigger`` | ``execute`` | ``delete`` | ``all``
    (``all`` is a wildcard that satisfies any requested action)
  * **Deny-by-default**: a resource/action pair is permitted ONLY if an entry
    grants it. A specific resource (``datasources.{id}``) is consulted before the
    category wildcard (``datasources.all``).

Two-level isolation
-------------------
A tenant may own several projects; each Workspace Agent turn is bound to ONE
project (``ctx.project_id``). Tools therefore:
  1. Re-validate the project belongs to the tenant (``assert_project_owned``).
  2. Inject the project_id into every DB query (``project_filter``).
This is enforced at tool registration, at the executor, and re-checked inside
each tool implementation (defense in depth).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Query, Session


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALL = "all"  # wildcard action / resource suffix

# Resources the master admin can toggle for the Workspace Agent profiles.
# Grouped for UI rendering; order is stable for display.
PERMISSION_RESOURCES: dict[str, list[str]] = {
    "Content": ["pages.all", "styles.all", "seo.all"],
    "Data": ["datasources.all"],
    "Automation": ["workflows.all"],
    "Infrastructure": ["edges.all", "engine.all", "providers.all"],
    "Help": ["docs.all"],
    "Integrations": ["mcp_servers.all", "skills.all"],
    "Internal API": ["api.all"],
}

# Destructive actions that must be audit-logged + surfaced in the tool result.
DESTRUCTIVE_ACTIONS = {"write", "delete", "trigger", "execute"}

# Tools mapped to the (resource, action) they require. Used by the registration
# layer to gate which tools a profile is allowed to see. Read tools need "read";
# mutating tools need "write"/"delete"/"trigger" — so a read-only support profile
# gets the read tools but not the mutating ones.
TOOL_PERMISSION_MAP: dict[str, tuple[str, str]] = {
    # Content — pages
    "pages_list": ("pages.all", "read"),
    "pages_get": ("pages.all", "read"),
    "pages_create": ("pages.all", "write"),
    "pages_update_component": ("pages.all", "write"),
    "pages_update_text": ("pages.all", "write"),
    "pages_delete": ("pages.all", "delete"),
    # Content — SEO
    "seo_get": ("seo.all", "read"),
    "seo_update": ("seo.all", "write"),
    # Content — styles
    "styles_list": ("styles.all", "read"),
    "styles_get": ("styles.all", "read"),
    "styles_update": ("styles.all", "write"),
    # Data
    "datasources_list": ("datasources.all", "read"),
    "datasources_get": ("datasources.all", "read"),
    "datasources_create": ("datasources.all", "write"),
    "datasources_update": ("datasources.all", "write"),
    "datasources_delete": ("datasources.all", "delete"),
    "datasources_test": ("datasources.all", "read"),
    # Automation
    "workflows_list": ("workflows.all", "read"),
    "workflows_get": ("workflows.all", "read"),
    "workflows_trigger": ("workflows.all", "trigger"),
    "workflows_create": ("workflows.all", "write"),
    # Infrastructure
    "edge_engines_list": ("edges.all", "read"),
    "edge_engines_get": ("edges.all", "read"),
    "edge_engines_create": ("edges.all", "write"),
    "edge_engines_deploy": ("edges.all", "write"),
    "engine_info": ("engine.all", "read"),
    "providers_list": ("providers.all", "read"),
    "providers_create": ("providers.all", "write"),
    "providers_test": ("providers.all", "read"),
    "providers_update": ("providers.all", "write"),
    # Integrations
    "mcp_servers_list": ("mcp_servers.all", "read"),
    "mcp_servers_add": ("mcp_servers.all", "write"),
    "mcp_servers_test": ("mcp_servers.all", "read"),
    "tools_list": ("skills.all", "read"),
    "tools_configure": ("skills.all", "write"),
    # Help (Support Profile)
    "search_docs": ("docs.all", "read"),
}


@dataclass
class ToolContext:
    """Identity + authorization context bound to a single Workspace Agent turn.

    Flows: router (TenantContext) → executor → ``register_workspace_tools``.
    Every tool implementation receives this and MUST scope its queries with it.

    ``tenant_id`` / ``project_id`` are ``None`` for self-host + master admin
    (no multi-tenant scoping — the agent sees the single project, like before).
    """
    user_id: Optional[str] = None
    tenant_id: Optional[str] = None
    project_id: Optional[str] = None
    is_master: bool = False
    profile_slug: str = "workspace-agent"
    permissions: dict[str, list[str]] = field(default_factory=dict)
    excluded_tools: set[str] = field(default_factory=set)
    max_auto_tools: int = 50

    # ---- convenience ------------------------------------------------------

    @property
    def isolated(self) -> bool:
        """True when tenant-level scoping is active (cloud tenant, not master)."""
        return bool(self.tenant_id) and not self.is_master

    def is_tool_excluded(self, name: str) -> bool:
        return name in self.excluded_tools


# ---------------------------------------------------------------------------
# Permission checking (deny-by-default)
# ---------------------------------------------------------------------------

def _normalize(perms: Optional[dict[str, Any]]) -> dict[str, list[str]]:
    if not perms or not isinstance(perms, dict):
        return {}
    out: dict[str, list[str]] = {}
    for k, v in perms.items():
        if v is None:
            continue
        if isinstance(v, str):
            out[str(k)] = [v]
        elif isinstance(v, (list, tuple)):
            out[str(k)] = [str(a) for a in v]
    return out


def has_permission(
    permissions: Optional[dict[str, Any]],
    resource: str,
    action: str = "read",
) -> bool:
    """Return True iff ``permissions`` grants ``action`` on ``resource``.

    Deny-by-default. ``all`` (as either an action on a granted resource or a
    resource suffix) acts as a wildcard. A specific resource like
    ``datasources.{id}`` is honored before the ``datasources.all`` category.
    """
    perms = _normalize(permissions)
    if not perms:
        return False

    actions_for = lambda key: perms.get(key) or []  # noqa: E731

    # 1. Specific resource, exact action or "all".
    granted = actions_for(resource)
    if action in granted or ALL in granted:
        return True

    # 2. Category wildcard (``datasources.all`` for ``datasources.abc``).
    if "." in resource:
        category = resource.split(".", 1)[0] + "." + ALL
        granted = actions_for(category)
        if action in granted or ALL in granted:
            return True

    # 3. Global ``api.all`` covers every ``api.{tag}`` resource.
    if resource.startswith("api."):
        granted = actions_for("api." + ALL)
        if action in granted or ALL in granted:
            return True

    return False


def require_permission(ctx: ToolContext, resource: str, action: str = "read") -> None:
    """Raise PermissionError if ``ctx`` lacks the permission (master admin bypasses)."""
    # Master admin / self-host is unrestricted — the Workspace Agent is their tool.
    if not ctx.isolated:
        return
    if not has_permission(ctx.permissions, resource, action):
        raise PermissionError(
            f"Security Violation: profile '{ctx.profile_slug}' lacks "
            f"'{action}' permission on '{resource}'."
        )


def tool_allowed(ctx: ToolContext, tool_name: str) -> bool:
    """Should this tool be registered for the given context?

    Master admin / self-host: every tool (minus explicitly excluded).
    Cloud tenant: only tools whose required ``(resource, action)`` is granted and
    the tool is not in the exclusion list.
    """
    if ctx.is_tool_excluded(tool_name):
        return False
    if not ctx.isolated:
        return True
    req = TOOL_PERMISSION_MAP.get(tool_name)
    if req is None:
        # Ungated utility tools — allow.
        return True
    resource, action = req
    return has_permission(ctx.permissions, resource, action)


# ---------------------------------------------------------------------------
# Two-level isolation: tenant + project
# ---------------------------------------------------------------------------

def assert_project_owned(db: Session, ctx: ToolContext) -> Optional[str]:
    """Validate that ``ctx.project_id`` belongs to ``ctx.tenant_id``.

    Returns the verified project_id, or None for self-host / master admin.
    Raises PermissionError on a cross-tenant project access attempt. This is the
    central guard against the untrusted ``X-Project-Id`` header.
    """
    if not ctx.isolated or ctx.project_id is None or ctx.tenant_id is None:
        return ctx.project_id
    from ..models.models import Project
    owned = (
        db.query(Project)
        .filter(Project.id == ctx.project_id, Project.tenant_id == ctx.tenant_id)
        .first()
    )
    if owned is None:
        raise PermissionError(
            f"Project '{ctx.project_id}' does not belong to tenant '{ctx.tenant_id}'."
        )
    return ctx.project_id


def project_filter(query: Query, model: Any, ctx: ToolContext, column: str = "project_id") -> Query:
    """Apply the project-scoping WHERE clause to a query, when isolation is active.

    For self-host / master admin (``ctx.project_id`` is None) this is a no-op so
    the agent still sees the single shared project — behaviour-preserving.
    """
    if not ctx.isolated or ctx.project_id is None:
        return query
    col = getattr(model, column, None)
    if col is None:
        return query
    return query.filter(col == ctx.project_id)


# ---------------------------------------------------------------------------
# Default permission sets for the two Workspace Agent profiles
# ---------------------------------------------------------------------------

def default_workspace_permissions() -> dict[str, list[str]]:
    """Broad, full-project-management permission set for the credit-consuming profile."""
    return {
        "pages.all": ["read", "write"],
        "styles.all": ["read", "write"],
        "seo.all": ["read", "write"],
        "datasources.all": ["read", "write"],
        "workflows.all": ["read", "trigger"],
        "edges.all": ["read", "write"],
        "engine.all": ["read"],
        "providers.all": ["read", "write"],
        "mcp_servers.all": ["read", "write"],
        "skills.all": ["read"],
        "docs.all": ["read"],
    }


def default_support_permissions() -> dict[str, list[str]]:
    """Read-only, no-mutation permission set for the free support profile."""
    return {
        "pages.all": ["read"],
        "datasources.all": ["read"],
        "engine.all": ["read"],
        "providers.all": ["read"],
        "docs.all": ["read"],
    }


def summarize_permissions(perms: Optional[dict[str, Any]]) -> dict[str, list[str]]:
    """Public-safe view of a permission dict (normalizes + drops empties)."""
    return {k: v for k, v in _normalize(perms).items() if v}
