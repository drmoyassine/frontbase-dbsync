"""Projects Router — multi-project CRUD (cloud-only).

Plan-gated: the ``projects`` limit caps how many projects a tenant may have. Free
tenants have a single default project (no create). Paid tenants can create more up
to the cap. The active project is selected client-side via the ``X-Project-Id``
header (resolved in get_project); this router manages the catalog.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Literal

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.config import SessionLocal
from app.models.models import Project, TenantMember, ProjectMember, User
from app.middleware.tenant_context import TenantContext, require_tenant_context
from app.services.plan_limits import check_quota

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ProjectCreateBody(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdateBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectMemberBody(BaseModel):
    user_id: str
    role: Literal["admin", "editor", "viewer"] = "viewer"


def _user_email(db: Session, user_id: str) -> Optional[str]:
    u = db.query(User).filter(User.id == user_id).first()
    return str(u.email) if u else None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _can_manage(ctx: TenantContext) -> bool:
    return ctx.role in ("owner", "admin")


def _serialize_project(p: Project, db: Session, ctx: TenantContext) -> dict:
    return {
        "id": str(p.id),
        "name": str(p.name),
        "description": p.description,
        "is_default": bool(p.is_default),
        "status": str(p.status) if p.status is not None else "active",
        "created_at": str(p.created_at),
        "is_active_project": ctx.active_project_id == str(p.id),
    }


def _accessible_project_ids(db: Session, ctx: TenantContext) -> Optional[set]:
    """Project ids the user can access, or None for "all" (owner/admin implicit)."""
    if _can_manage(ctx):
        return None
    rows = (
        db.query(ProjectMember.project_id)
        .filter(ProjectMember.tenant_id == ctx.tenant_id, ProjectMember.user_id == ctx.user_id)
        .all()
    )
    return {str(r[0]) for r in rows}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
async def list_projects(ctx: TenantContext = Depends(require_tenant_context)):
    """List projects the current user can access."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    db = SessionLocal()
    try:
        q = db.query(Project).filter(Project.tenant_id == ctx.tenant_id).order_by(Project.created_at)
        projects = q.all()
        allowed = _accessible_project_ids(db, ctx)
        if allowed is not None:
            projects = [p for p in projects if str(p.id) in allowed]
        return {"projects": [_serialize_project(p, db, ctx) for p in projects]}
    finally:
        db.close()


@router.post("", status_code=201)
async def create_project(
    body: ProjectCreateBody,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Create a new project (owner/admin only, gated by the plan's `projects` cap)."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    if not _can_manage(ctx):
        raise HTTPException(status_code=403, detail="Only owners/admins can create projects")

    db = SessionLocal()
    try:
        # projects cap (scope=tenant): count existing, block when at the limit
        current = db.query(Project).filter(Project.tenant_id == ctx.tenant_id).count()
        check_quota(db, ctx, "projects", current)

        project = Project(
            id=str(uuid.uuid4()),
            name=body.name.strip(),
            description=body.description,
            tenant_id=ctx.tenant_id,
            is_default=False,           # only the auto-provisioned project is default
            status="active",
            created_by=ctx.user_id,
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        return {"project": _serialize_project(project, db, ctx)}
    except HTTPException:
        raise
    finally:
        db.close()


@router.patch("/{project_id}")
async def update_project_meta(
    project_id: str,
    body: ProjectUpdateBody,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Rename / update description (owner/admin only)."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    if not _can_manage(ctx):
        raise HTTPException(status_code=403, detail="Only owners/admins can edit projects")
    db = SessionLocal()
    try:
        project = (
            db.query(Project)
            .filter(Project.id == project_id, Project.tenant_id == ctx.tenant_id)
            .first()
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if body.name is not None:
            project.name = body.name.strip()  # type: ignore[assignment]
        if body.description is not None:
            project.description = body.description  # type: ignore[assignment]
        project.updated_at = _now()  # type: ignore[assignment]
        db.commit()
        return {"project": _serialize_project(project, db, ctx)}
    except HTTPException:
        raise
    finally:
        db.close()


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Delete a non-default project (owner only)."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    if ctx.role != "owner":
        raise HTTPException(status_code=403, detail="Only owners can delete projects")
    db = SessionLocal()
    try:
        project = (
            db.query(Project)
            .filter(Project.id == project_id, Project.tenant_id == ctx.tenant_id)
            .first()
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if bool(project.is_default):
            raise HTTPException(status_code=400, detail="The default project cannot be deleted")
        # Note: callers should ensure the project is empty (no pages/engines) first;
        # cascade behaviour for a non-empty project is a separate decision (see plan).
        db.delete(project)
        db.commit()
        return {"success": True}
    except HTTPException:
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Per-project member access (editors/viewers; owners/admins are implicit)
# ---------------------------------------------------------------------------

def _require_project(db: Session, project_id: str, ctx: TenantContext) -> Project:
    p = (
        db.query(Project)
        .filter(Project.id == project_id, Project.tenant_id == ctx.tenant_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.get("/{project_id}/members")
async def list_project_members(
    project_id: str,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """List who has access to this project (implicit owners/admins + explicit rows)."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    db = SessionLocal()
    try:
        _require_project(db, project_id, ctx)
        out: dict[str, dict] = {}
        # Implicit: tenant owners/admins
        admins = (
            db.query(TenantMember)
            .filter(TenantMember.tenant_id == ctx.tenant_id, TenantMember.role.in_(["owner", "admin"]))
            .all()
        )
        for m in admins:
            out[str(m.user_id)] = {
                "user_id": str(m.user_id), "email": _user_email(db, str(m.user_id)),
                "role": str(m.role), "implicit": True,
            }
        # Explicit project access rows
        rows = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id)
            .all()
        )
        for r in rows:
            out[str(r.user_id)] = {
                "user_id": str(r.user_id), "email": _user_email(db, str(r.user_id)),
                "role": str(r.role), "implicit": False,
            }
        return {"members": list(out.values())}
    finally:
        db.close()


@router.post("/{project_id}/members", status_code=201)
async def add_project_member(
    project_id: str,
    body: ProjectMemberBody,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Grant a member access to this project (owner/admin only)."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    if not _can_manage(ctx):
        raise HTTPException(status_code=403, detail="Only owners/admins can manage project access")
    db = SessionLocal()
    try:
        _require_project(db, project_id, ctx)
        # Must be a tenant member.
        tm = (
            db.query(TenantMember)
            .filter(TenantMember.tenant_id == ctx.tenant_id, TenantMember.user_id == body.user_id)
            .first()
        )
        if not tm:
            raise HTTPException(status_code=404, detail="User is not a member of this workspace")
        if str(tm.role) in ("owner", "admin"):
            raise HTTPException(status_code=400, detail="Owners/admins already have access to all projects")
        existing = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == body.user_id)
            .first()
        )
        if existing:
            existing.role = body.role  # type: ignore[assignment]
        else:
            db.add(ProjectMember(
                id=str(uuid.uuid4()),
                tenant_id=ctx.tenant_id,
                project_id=project_id,
                user_id=body.user_id,
                role=body.role,
                created_at=_now(),
            ))
        db.commit()
        return {"success": True}
    except HTTPException:
        raise
    finally:
        db.close()


@router.delete("/{project_id}/members/{user_id}")
async def remove_project_member(
    project_id: str,
    user_id: str,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Revoke a member's explicit access to this project (owner/admin only)."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    if not _can_manage(ctx):
        raise HTTPException(status_code=403, detail="Only owners/admins can manage project access")
    db = SessionLocal()
    try:
        _require_project(db, project_id, ctx)
        row = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
            .first()
        )
        if row:
            db.delete(row)
            db.commit()
        return {"success": True}
    except HTTPException:
        raise
    finally:
        db.close()
