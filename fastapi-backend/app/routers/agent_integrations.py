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
from sqlalchemy import or_
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

router = APIRouter(prefix="/api", tags=["agent-integrations"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_scope(db: Session, ctx: Optional[TenantContext]) -> tuple[Optional[str], Optional[str]]:
    """Return (tenant_id, project_id) for the caller. None,None = master/self-host."""
    if ctx is None or not getattr(ctx, "tenant_id", None):
        return None, None
    project = get_project(db, ctx)
    return ctx.tenant_id, (str(project.id) if project else None)


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


def _mcp_view(m: McpServer) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "name": str(m.name),
        "slug": str(m.slug),
        "description": m.description,
        "url": str(m.url),
        "transport": str(m.transport),
        "authType": m.auth_type,
        "hasAuth": bool(m.auth_config),
        "toolFilter": json.loads(str(m.tool_filter)) if m.tool_filter else None,
        "category": m.category,
        "isActive": bool(m.is_active),
        "isPublic": bool(m.is_public),
        "tenantId": m.tenant_id,
        "projectId": m.project_id,
        "createdAt": str(m.created_at),
        "updatedAt": str(m.updated_at),
    }


@router.get("/mcp-servers")
def list_mcp_servers(
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    tenant_id, project_id = _resolve_scope(db, ctx)
    q = db.query(McpServer)
    q = _scope_query(q, McpServer, tenant_id, project_id)
    rows = q.order_by(McpServer.created_at.desc()).all()
    return {"mcpServers": [_mcp_view(m) for m in rows], "total": len(rows)}


@router.post("/mcp-servers", status_code=201)
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
        tenant_id=tenant_id,
        project_id=project_id,
        created_at=now,
        updated_at=now,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _mcp_view(m)


@router.get("/mcp-servers/{server_id}")
def get_mcp_server(
    server_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    m = _get_scoped(db, ctx, server_id)
    return _mcp_view(m)


@router.put("/mcp-servers/{server_id}")
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
        m.auth_config = encrypt_credentials({"type": m.auth_type or "bearer", "token": data["token"]})
    if "tool_filter" in data:
        m.tool_filter = json.dumps(data["tool_filter"]) if data["tool_filter"] else None
    if "is_active" in data and data["is_active"] is not None:
        m.is_active = bool(data["is_active"])
    m.updated_at = _now()
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
    if bool(m.is_public) and (ctx is None or not getattr(ctx, "is_master", False)):
        raise HTTPException(403, "Public catalogue entries can only be removed by an administrator")
    db.delete(m)
    db.commit()


@router.get("/mcp-servers/{server_id}/tools")
def list_mcp_server_tools(
    server_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    m = _get_scoped(db, ctx, server_id)
    auth = _decrypt_auth(m)
    try:
        tools = mcp_client.list_tools(str(m.url), str(m.transport), auth, m.auth_type)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"MCP discovery failed: {e}")
    # Apply the optional tool filter.
    if m.tool_filter:
        allowed = set(json.loads(str(m.tool_filter)))
        tools = [t for t in tools if t.get("name") in allowed]
    return {"tools": tools, "total": len(tools)}


@router.post("/mcp-servers/{server_id}/test")
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
    if not m.auth_config:
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


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tool_definitions: Optional[list[dict[str, Any]]] = None
    is_active: Optional[bool] = None


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
        "createdAt": str(s.created_at),
        "updatedAt": str(s.updated_at),
    }


@router.get("/agent-skills")
def list_skills(
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    seed_builtin_skills(db)  # idempotent — ensures catalogue exists
    q = db.query(AgentSkill).filter(AgentSkill.is_active == True)  # noqa: E712
    tenant_id, project_id = _resolve_scope(db, ctx)
    if tenant_id is not None:
        # Built-ins (tenant_id NULL) are visible to everyone; custom scoped to tenant.
        q = q.filter(or_(AgentSkill.is_builtin == True, AgentSkill.tenant_id == tenant_id))  # noqa: E712
    rows = q.order_by(AgentSkill.is_builtin.desc(), AgentSkill.name.asc()).all()
    return {"skills": [_skill_view(s) for s in rows], "total": len(rows)}


@router.post("/agent-skills", status_code=201)
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
        tenant_id=tenant_id,
        project_id=project_id,
        created_at=now,
        updated_at=now,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _skill_view(s)


@router.put("/agent-skills/{skill_id}")
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
        s.tool_definitions = json.dumps(data["tool_definitions"])
    s.updated_at = _now()
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
    if tenant_id is not None and not bool(s.is_builtin) and s.tenant_id != tenant_id:
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
    if tenant_id is not None and profile.project_id != project_id:
        raise HTTPException(404, "Profile not found")
    return profile


# ---------------------------------------------------------------------------
# Profile → skill installation
# ---------------------------------------------------------------------------

class SkillInstall(BaseModel):
    skill_id: str
    config_overrides: Optional[dict[str, Any]] = None


@router.get("/agent-profiles/{profile_id}/skills")
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
            view["configOverrides"] = json.loads(str(r.config_overrides)) if r.config_overrides else None
            view["installedAt"] = str(r.installed_at)
            out.append(view)
    return {"skills": out, "total": len(out)}


@router.post("/agent-profiles/{profile_id}/skills", status_code=201)
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
