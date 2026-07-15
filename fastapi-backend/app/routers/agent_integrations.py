"""Agent integrations router — MCP servers + Skills management.

Mounted at ``/api``. All endpoints are tenant + project scoped (cloud) via the
TenantContext dependency; self-host / master admin is unrestricted. MCP server
credentials are Fernet-encrypted at rest.

  * /api/mcp-servers            — CRUD + tools-discovery + connection test
  * /api/agent-skills           — built-in + custom skills CRUD
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from ..database.config import get_db, SessionLocal
from ..database.utils import get_project
from ..middleware.tenant_context import TenantContext, get_tenant_context
from ..models.models import McpServer, AgentSkill, AgentProfileSkill
from ..models.edge import EdgeAgentProfile
from ..core.security import encrypt_credentials, decrypt_credentials
from ..services import mcp_client
from ..services.agent_skills import seed_builtin_skills

logger = logging.getLogger(__name__)

from ..schemas.op_responses import GetAgentCatalogueResult, InstallSkillResult, ListMcpServerToolsResult, ListMcpServersResult, ListProfileSkillsResult, ListSkillsResult, TestMcpServerResult
router = APIRouter(prefix="/api", tags=["agent-integrations"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_scope(db: Session, ctx: Optional[TenantContext]) -> tuple[Optional[str], Optional[str]]:
    """Return (tenant_id, project_id) for the caller. None,None = master/self-host."""
    if ctx is None or not getattr(ctx, "tenant_id", None):
        return None, None
    project = get_project(db, ctx)
    return ctx.tenant_id, (str(project.id) if project else None)


def _require_master_admin(ctx: Optional[TenantContext]) -> None:
    """Raise 403 if the caller is not a master admin.

    Used to lock down MCP server and skill CRUD operations.
    Self-host users (ctx is None) are considered master admins.
    """
    if ctx is None:
        return  # Self-host = master admin
    if not getattr(ctx, "is_master", False):
        raise HTTPException(
            status_code=403,
            detail="Only master admin can create, update, or delete MCP servers and skills"
        )


def _scope_query(q, model, tenant_id: Optional[str], project_id: Optional[str]):
    """Apply tenant + project filters (or public catalogue rows) to a query."""
    if tenant_id is None:
        return q  # master admin / self-host: everything
    own = q.filter(model.tenant_id == tenant_id)
    if project_id is not None:
        own = own.filter(or_(model.project_id == project_id, model.is_public == True))  # noqa: E712
    return own


# ---------------------------------------------------------------------------
# MCP servers
# ---------------------------------------------------------------------------

class McpServerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = None
    url: str = Field(..., min_length=1, max_length=500)
    transport: str = "streamable-http"
    auth_type: Optional[str] = None       # bearer | basic | none
    token: Optional[str] = None           # stored encrypted
    tool_filter: Optional[list[str]] = None
    category: Optional[str] = None
    is_active: bool = True
    profile_slug: Optional[str] = None


class McpServerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    url: Optional[str] = None
    transport: Optional[str] = None
    auth_type: Optional[str] = None
    token: Optional[str] = None
    tool_filter: Optional[list[str]] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    profile_slug: Optional[str] = None


def _mcp_view(m: McpServer) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "name": str(m.name),
        "slug": str(m.slug),
        "description": m.description,
        "url": str(m.url),
        "transport": str(m.transport),
        "authType": m.auth_type,
        "hasAuth": bool(m.auth_config is not None),
        "toolFilter": json.loads(str(m.tool_filter)) if m.tool_filter is not None else None,
        "category": m.category,
        "isActive": bool(m.is_active),
        "isPublic": bool(m.is_public),
        "tenantId": m.tenant_id,
        "projectId": m.project_id,
        "profileSlug": m.profile_slug,
        "createdAt": str(m.created_at),
        "updatedAt": str(m.updated_at),
    }


@router.get("/mcp-servers", response_model=ListMcpServersResult)
def list_mcp_servers(
    profile_slug: Optional[str] = None,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """List global MCP servers catalogue, excluding tenant-disabled items.

    Returns only global (tenant_id IS NULL) MCP servers for all tenants, filtered
    by profile_slug if provided. Master admins see all servers including disabled ones.
    """
    tenant_id = ctx.tenant_id if ctx else None
    user_id = ctx.user_id if ctx else None
    is_master = getattr(ctx, "is_master", False) if ctx else True

    # Query ONLY global catalogue (tenant_id IS NULL)
    q = db.query(McpServer).filter(
        McpServer.is_active == True,
        McpServer.tenant_id.is_(None)  # Global only
    )
    if profile_slug is not None:
        q = q.filter(McpServer.profile_slug == profile_slug)
    else:
        q = q.filter(McpServer.profile_slug.is_(None))

    rows = q.order_by(McpServer.created_at.desc()).all()

    # Apply tenant exclusions (unless master admin)
    if not is_master and tenant_id:
        from ..services.agent_settings import get_disabled_lists
        disabled_mcps, _, _ = get_disabled_lists(db, tenant_id, user_id)
        rows = [m for m in rows if str(m.id) not in disabled_mcps]

    return {"mcpServers": [_mcp_view(m) for m in rows], "total": len(rows)}


@router.post("/mcp-servers", status_code=201, response_model=dict[str, Any])
def create_mcp_server(
    body: McpServerCreate,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    tenant_id, project_id = _resolve_scope(db, ctx)
    auth_config = encrypt_credentials({"type": body.auth_type or "bearer", "token": body.token}) if body.token else None
    now = _now()
    m = McpServer(
        id=str(uuid.uuid4()),
        name=body.name,
        slug=body.slug,
        description=body.description,
        url=body.url,
        transport=body.transport,
        auth_type=body.auth_type,
        auth_config=auth_config,
        tool_filter=json.dumps(body.tool_filter) if body.tool_filter else None,
        category=body.category,
        is_active=body.is_active,
        profile_slug=body.profile_slug,
        tenant_id=tenant_id,
        project_id=project_id,
        created_at=now,
        updated_at=now,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _mcp_view(m)


@router.get("/mcp-servers/{server_id}", response_model=dict[str, Any])
def get_mcp_server(
    server_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    m = _get_scoped(db, ctx, server_id)
    return _mcp_view(m)


@router.put("/mcp-servers/{server_id}", response_model=dict[str, Any])
def update_mcp_server(
    server_id: str,
    body: McpServerUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    m = _get_scoped(db, ctx, server_id)
    data = body.model_dump(exclude_unset=True)
    for k in ("name", "description", "url", "transport", "auth_type", "category"):
        if k in data and data[k] is not None:
            setattr(m, k, data[k])
    if "token" in data and data["token"]:
        m.auth_config = encrypt_credentials({"type": str(m.auth_type) if m.auth_type is not None else "bearer", "token": data["token"]})  # type: ignore[assignment]
    if "tool_filter" in data:
        m.tool_filter = json.dumps(data["tool_filter"]) if data["tool_filter"] else None  # type: ignore[assignment]
    if "is_active" in data and data["is_active"] is not None:
        m.is_active = bool(data["is_active"])  # type: ignore[assignment]
    if "profile_slug" in data:
        m.profile_slug = data["profile_slug"]  # type: ignore[assignment]
    m.updated_at = _now()  # type: ignore[assignment]
    db.commit()
    db.refresh(m)
    return _mcp_view(m)


@router.delete("/mcp-servers/{server_id}", status_code=204)
def delete_mcp_server(
    server_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    m = _get_scoped(db, ctx, server_id)
    db.delete(m)
    db.commit()


@router.get("/mcp-servers/{server_id}/tools", response_model=ListMcpServerToolsResult)
def list_mcp_server_tools(
    server_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    m = _get_scoped(db, ctx, server_id)
    auth = _decrypt_auth(m)
    try:
        tools = mcp_client.list_tools(str(m.url), str(m.transport), auth, str(m.auth_type) if m.auth_type is not None else None)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"MCP discovery failed: {e}")
    # Apply the optional tool filter.
    if m.tool_filter is not None:
        allowed = set(json.loads(str(m.tool_filter)))
        tools = [t for t in tools if t.get("name") in allowed]
    return {"tools": tools, "total": len(tools)}


@router.post("/mcp-servers/{server_id}/test", response_model=TestMcpServerResult)
def test_mcp_server(
    server_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    m = _get_scoped(db, ctx, server_id)
    reachable = mcp_client.ping(str(m.url))
    return {"reachable": reachable, "serverId": str(m.id)}


def _get_scoped(db: Session, ctx: Optional[TenantContext], server_id: str) -> McpServer:
    q = db.query(McpServer).filter(McpServer.id == server_id)
    tenant_id, project_id = _resolve_scope(db, ctx)
    if tenant_id is not None:
        q = q.filter(or_(McpServer.tenant_id == tenant_id, McpServer.is_public == True))  # noqa: E712
        if project_id is not None:
            q = q.filter(or_(McpServer.project_id == project_id, McpServer.is_public == True))  # noqa: E712
    m = q.first()
    if m is None:
        raise HTTPException(404, "MCP server not found")
    return m


def _decrypt_auth(m: McpServer) -> Optional[str]:
    if m.auth_config is None:
        return None
    try:
        return json.dumps(decrypt_credentials(str(m.auth_config)))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

class SkillCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    category: Optional[str] = None
    tool_definitions: list[dict[str, Any]]
    version: str = "1.0.0"
    profile_slug: Optional[str] = None


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tool_definitions: Optional[list[dict[str, Any]]] = None
    is_active: Optional[bool] = None
    profile_slug: Optional[str] = None


def _skill_view(s: AgentSkill) -> dict[str, Any]:
    return {
        "id": str(s.id),
        "slug": str(s.slug),
        "name": str(s.name),
        "description": s.description,
        "category": s.category,
        "toolDefinitions": json.loads(str(s.tool_definitions)),
        "version": str(s.version),
        "isBuiltin": bool(s.is_builtin),
        "isActive": bool(s.is_active),
        "tenantId": s.tenant_id,
        "projectId": s.project_id,
        "profileSlug": s.profile_slug,
        "createdAt": str(s.created_at),
        "updatedAt": str(s.updated_at),
    }


@router.get("/agent-skills", response_model=ListSkillsResult)
def list_skills(
    profile_slug: Optional[str] = None,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """List global skills catalogue, excluding tenant-disabled items.

    Returns only built-in and global (tenant_id IS NULL) skills for all tenants,
    filtered by profile_slug. Master admins see all skills including disabled ones.
    """
    seed_builtin_skills(db)  # idempotent — ensures catalogue exists

    tenant_id = ctx.tenant_id if ctx else None
    user_id = ctx.user_id if ctx else None
    is_master = getattr(ctx, "is_master", False) if ctx else True

    # Query ONLY global skills (built-in + tenant_id IS NULL)
    q = db.query(AgentSkill).filter(
        AgentSkill.is_active == True,  # noqa: E712
        or_(
            AgentSkill.is_builtin == True,  # noqa: E712
            AgentSkill.tenant_id.is_(None)
        )
    )
    if profile_slug is not None:
        q = q.filter(AgentSkill.profile_slug == profile_slug)
    else:
        q = q.filter(or_(AgentSkill.profile_slug.is_(None), AgentSkill.is_builtin == True))
        
    rows = q.order_by(AgentSkill.is_builtin.desc(), AgentSkill.name.asc()).all()

    # Apply tenant exclusions (unless master admin)
    if not is_master and tenant_id:
        from ..services.agent_settings import get_disabled_lists
        _, disabled_skills, _ = get_disabled_lists(db, tenant_id, user_id)
        rows = [s for s in rows if str(s.slug) not in disabled_skills]

    return {"skills": [_skill_view(s) for s in rows], "total": len(rows)}


@router.post("/agent-skills", status_code=201, response_model=dict[str, Any])
def create_skill(
    body: SkillCreate,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    tenant_id, project_id = _resolve_scope(db, ctx)
    now = _now()
    s = AgentSkill(
        id=str(uuid.uuid4()),
        slug=body.slug,
        name=body.name,
        description=body.description,
        category=body.category,
        tool_definitions=json.dumps(body.tool_definitions),
        version=body.version,
        is_builtin=False,
        is_active=True,
        profile_slug=body.profile_slug,
        tenant_id=tenant_id,
        project_id=project_id,
        created_at=now,
        updated_at=now,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _skill_view(s)


@router.put("/agent-skills/{skill_id}", response_model=dict[str, Any])
def update_skill(
    skill_id: str,
    body: SkillUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    s = _skill_scoped(db, ctx, skill_id)
    if bool(s.is_builtin):
        raise HTTPException(403, "Built-in skills are immutable")
    data = body.model_dump(exclude_unset=True)
    for k in ("name", "description", "category", "is_active"):
        if k in data and data[k] is not None:
            setattr(s, k, data[k])
    if "tool_definitions" in data and data["tool_definitions"] is not None:
        s.tool_definitions = json.dumps(data["tool_definitions"])  # type: ignore[assignment]
    if "profile_slug" in data:
        s.profile_slug = data["profile_slug"]  # type: ignore[assignment]
    s.updated_at = _now()  # type: ignore[assignment]
    db.commit()
    db.refresh(s)
    return _skill_view(s)


@router.delete("/agent-skills/{skill_id}", status_code=204)
def delete_skill(
    skill_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    s = _skill_scoped(db, ctx, skill_id)
    if bool(s.is_builtin):
        raise HTTPException(403, "Built-in skills cannot be deleted")
    db.delete(s)
    db.commit()


def _skill_scoped(db: Session, ctx: Optional[TenantContext], skill_id: str) -> AgentSkill:
    s = db.query(AgentSkill).filter(AgentSkill.id == skill_id).first()
    if s is None:
        raise HTTPException(404, "Skill not found")
    tenant_id, _ = _resolve_scope(db, ctx)
    if tenant_id is not None and s.is_builtin is not True and str(s.tenant_id) != tenant_id:
        raise HTTPException(404, "Skill not found")
    return s


def _get_profile_scoped(db: Session, ctx: Optional[TenantContext], profile_id: str) -> EdgeAgentProfile:
    """Validate profile ownership before allowing profile-skill operations.

    CRITICAL: Prevents cross-tenant access to profile skills. A tenant can only
    access skills installed on profiles that belong to their project.
    """
    profile = db.query(EdgeAgentProfile).filter(EdgeAgentProfile.id == profile_id).first()
    if profile is None:
        raise HTTPException(404, "Profile not found")
    tenant_id, project_id = _resolve_scope(db, ctx)
    if tenant_id is not None and str(profile.project_id) != str(project_id):
        raise HTTPException(404, "Profile not found")
    return profile


# ---------------------------------------------------------------------------
# Profile → skill installation
# ---------------------------------------------------------------------------

class SkillInstall(BaseModel):
    skill_id: str
    config_overrides: Optional[dict[str, Any]] = None


@router.get("/agent-profiles/{profile_id}/skills", response_model=ListProfileSkillsResult)
def list_profile_skills(
    profile_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    # CRITICAL: Validate profile ownership before listing skills
    _get_profile_scoped(db, ctx, profile_id)
    rows = db.query(AgentProfileSkill).filter(AgentProfileSkill.profile_id == profile_id).all()
    out = []
    for r in rows:
        skill = db.query(AgentSkill).filter(AgentSkill.id == r.skill_id).first()
        if skill:
            view = _skill_view(skill)
            view["configOverrides"] = json.loads(str(r.config_overrides)) if r.config_overrides is not None else None
            view["installedAt"] = str(r.installed_at)
            out.append(view)
    return {"skills": out, "total": len(out)}


@router.post("/agent-profiles/{profile_id}/skills", status_code=201, response_model=InstallSkillResult)
def install_skill(
    profile_id: str,
    body: SkillInstall,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    # CRITICAL: Validate profile ownership before installing skill
    _get_profile_scoped(db, ctx, profile_id)
    existing = db.query(AgentProfileSkill).filter(
        AgentProfileSkill.profile_id == profile_id, AgentProfileSkill.skill_id == body.skill_id
    ).first()
    if existing:
        raise HTTPException(400, "Skill already installed on this profile")
    row = AgentProfileSkill(
        id=str(uuid.uuid4()),
        profile_id=profile_id,
        skill_id=body.skill_id,
        config_overrides=json.dumps(body.config_overrides) if body.config_overrides else None,
        installed_at=_now(),
    )
    db.add(row)
    db.commit()
    return {"installed": True, "skillId": body.skill_id, "profileId": profile_id}


@router.delete("/agent-profiles/{profile_id}/skills/{install_id}", status_code=204)
def uninstall_skill(
    profile_id: str,
    install_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    # CRITICAL: Validate profile ownership before uninstalling skill
    _get_profile_scoped(db, ctx, profile_id)
    row = db.query(AgentProfileSkill).filter(
        AgentProfileSkill.id == install_id, AgentProfileSkill.profile_id == profile_id
    ).first()
    if row is None:
        raise HTTPException(404, "Installed skill not found")
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Agent Catalogue (for Settings Modal)
# ---------------------------------------------------------------------------

@router.get("/agent-catalogue", response_model=GetAgentCatalogueResult)
def get_agent_catalogue(
    profile_slug: str = "workspace",
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Return global catalogue of MCP servers, skills, and core tools.

    Used by the frontend settings modal to populate the exclusion toggles.
    Returns all available items regardless of tenant exclusions (so the
    frontend can show the full list with on/off toggles).
    """
    seed_builtin_skills(db)  # Ensure catalogue exists

    tenant_id = ctx.tenant_id if ctx else None
    user_id = ctx.user_id if ctx else None

    # Get current exclusions for this tenant/user
    from ..services.agent_settings import get_disabled_lists
    disabled_mcps, disabled_skills, disabled_tools = get_disabled_lists(db, tenant_id, user_id)

    # 1. Fetch master admin profile permissions (workspace agent config)
    from ..services.agent_quota import get_profile_config
    from ..services.agent_permissions import TOOL_PERMISSION_MAP, has_permission
    profile_cfg = get_profile_config(db, profile_slug)
    permissions = profile_cfg.get("permissions") or {}

    # Check global category permissions
    can_read_mcps = has_permission(permissions, "mcp_servers.all", "read")
    can_read_skills = has_permission(permissions, "skills.all", "read")

    # Get global MCP servers
    mcp_rows = []
    if can_read_mcps:
        mcp_rows = db.query(McpServer).filter(
            McpServer.is_active == True,
            McpServer.tenant_id.is_(None),
            McpServer.profile_slug == profile_slug
        ).order_by(McpServer.name.asc()).all()

    # Get global skills
    skill_rows = []
    if can_read_skills:
        skill_rows = db.query(AgentSkill).filter(
            AgentSkill.is_active == True,
            or_(
                AgentSkill.is_builtin == True,
                and_(AgentSkill.tenant_id.is_(None), AgentSkill.profile_slug == profile_slug)
            )
        ).order_by(AgentSkill.is_builtin.desc(), AgentSkill.name.asc()).all()

    # Core tools (curated list)
    core_tools_all = [
        {"name": "pages_list", "label": "List Pages", "category": "Pages"},
        {"name": "pages_get", "label": "Get Page", "category": "Pages"},
        {"name": "pages_update", "label": "Update Page", "category": "Pages"},
        {"name": "styles_list", "label": "List Styles", "category": "Styles"},
        {"name": "styles_get", "label": "Get Style", "category": "Styles"},
        {"name": "styles_update", "label": "Update Style", "category": "Styles"},
        {"name": "engine_info", "label": "Engine Info", "category": "Engine"},
        {"name": "engine_status", "label": "Engine Status", "category": "Engine"},
        {"name": "queryDatasource", "label": "Query Datasource", "category": "Datasources"},
        {"name": "triggerWorkflow", "label": "Trigger Workflow", "category": "Workflows"},
    ]

    # Filter core tools by master admin permissions
    core_tools = []
    for t in core_tools_all:
        req = TOOL_PERMISSION_MAP.get(t["name"])
        # If it requires permission, ensure the master admin profile granted it
        if req is None or has_permission(permissions, req[0], req[1]):
            core_tools.append(t)

    return {
        "mcpServers": [
            {
                "id": str(m.id),
                "name": str(m.name),
                "slug": str(m.slug),
                "category": m.category,
                "disabled": str(m.id) in disabled_mcps,
            }
            for m in mcp_rows
        ],
        "skills": [
            {
                "id": str(s.id),
                "slug": str(s.slug),
                "name": str(s.name),
                "category": s.category,
                "isBuiltin": bool(s.is_builtin),
                "disabled": str(s.slug) in disabled_skills,
            }
            for s in skill_rows
        ],
        "coreTools": [
            {
                "name": t["name"],
                "label": t["label"],
                "category": t["category"],
                "disabled": t["name"] in disabled_tools,
            }
            for t in core_tools
        ],
    }
