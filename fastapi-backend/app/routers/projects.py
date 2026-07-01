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
from sqlalchemy.exc import IntegrityError

from app.database.config import SessionLocal
from app.models.models import (
    Project, TenantMember, ProjectMember, User,
    ProjectDatasource, ProjectStorage, ProjectConnectedAccount,
)
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
        # Decision: a project must be EMPTY before it can be deleted (never destroy work).
        # The caller deletes/moves its pages first. Engines/datasources are unscoped, not deleted.
        from app.models.models import Page
        page_count = (
            db.query(Page)
            .filter(Page.project_id == project_id, Page.deleted_at == None)  # noqa: E711
            .count()
        )
        if page_count > 0:
            raise HTTPException(
                status_code=409,
                detail=f"Delete this project's {page_count} page(s) first — projects must be empty to be deleted (no data loss).",
            )
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


# ---------------------------------------------------------------------------
# Shareable-resource grants (datasource / storage / connected-account → project)
# ---------------------------------------------------------------------------

class GrantBody(BaseModel):
    resource_id: str


def _require_manage(ctx: TenantContext) -> None:
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners/admins can manage shared resources")


def _owned_or_granted_count(db: Session, project_id: str, model, grant_model, fk_attr: str) -> int:
    """Resources a project can use: owned (project_id) + granted (grant table)."""
    owned = db.query(model).filter(model.project_id == project_id).count()
    granted = (
        db.query(grant_model)
        .filter(getattr(grant_model, fk_attr).isnot(None), grant_model.project_id == project_id)
        .count()
    )
    return owned + granted


def _resource_belongs_to_tenant(db: Session, model, resource_id: str, tenant_id: Optional[str]) -> bool:
    if not tenant_id:
        return False
    r = db.query(model).filter(model.id == resource_id).first()
    if not r:
        return False
    pid = getattr(r, "project_id", None)
    if not pid:
        return False
    proj = db.query(Project).filter(Project.id == pid, Project.tenant_id == tenant_id).first()
    return proj is not None


# ---- Datasources (shareable, per-project capped on grant) ----

@router.get("/{project_id}/datasources")
async def list_project_datasources(
    project_id: str,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Datasources for the active project: ``granted`` (shared in, revocable) and
    ``available`` (tenant datasources not yet in this project, grantable)."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    from app.services.sync.models.datasource import Datasource
    db = SessionLocal()
    try:
        _require_project(db, project_id, ctx)
        tenant_project_ids = [
            str(p.id) for p in db.query(Project).filter(Project.tenant_id == ctx.tenant_id).all()
        ]
        all_ds = (
            db.query(Datasource).filter(Datasource.project_id.in_(tenant_project_ids)).all()
            if tenant_project_ids else []
        )
        in_project = {str(d.id) for d in all_ds if str(d.project_id) == project_id}
        granted_rows = (
            db.query(ProjectDatasource).filter(ProjectDatasource.project_id == project_id).all()
        )
        granted_ids = {str(g.datasource_id) for g in granted_rows}
        in_project |= granted_ids
        granted = [{"id": str(d.id), "name": str(d.name)} for d in all_ds if str(d.id) in granted_ids]
        available = [{"id": str(d.id), "name": str(d.name)} for d in all_ds if str(d.id) not in in_project]
        return {"granted": granted, "available": available}
    finally:
        db.close()


@router.post("/{project_id}/datasources", status_code=201)
async def grant_datasource(project_id: str, body: GrantBody, ctx: TenantContext = Depends(require_tenant_context)):
    from app.services.sync.models.datasource import Datasource
    _require_manage(ctx)
    db = SessionLocal()
    try:
        _require_project(db, project_id, ctx)
        if not _resource_belongs_to_tenant(db, Datasource, body.resource_id, ctx.tenant_id):
            raise HTTPException(status_code=404, detail="Datasource not found in this workspace")
        exists = db.query(ProjectDatasource).filter(
            ProjectDatasource.project_id == project_id, ProjectDatasource.datasource_id == body.resource_id
        ).first()
        if not exists:
            check_quota(db, ctx, "datasources", _owned_or_granted_count(db, project_id, Datasource, ProjectDatasource, "datasource_id"))
            db.add(ProjectDatasource(id=str(uuid.uuid4()), tenant_id=ctx.tenant_id, project_id=project_id, datasource_id=body.resource_id, created_at=_now()))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
        return {"success": True}
    except HTTPException:
        raise
    finally:
        db.close()


@router.delete("/{project_id}/datasources/{datasource_id}")
async def revoke_datasource(project_id: str, datasource_id: str, ctx: TenantContext = Depends(require_tenant_context)):
    _require_manage(ctx)
    db = SessionLocal()
    try:
        row = db.query(ProjectDatasource).filter(ProjectDatasource.project_id == project_id, ProjectDatasource.datasource_id == datasource_id).first()
        if row:
            db.delete(row); db.commit()
        return {"success": True}
    finally:
        db.close()


# ---- Connected accounts (shareable, per-tenant — grant is free) ----

@router.post("/{project_id}/connected-accounts", status_code=201)
async def grant_connected_account(project_id: str, body: GrantBody, ctx: TenantContext = Depends(require_tenant_context)):
    from app.models.models import EdgeProviderAccount
    _require_manage(ctx)
    db = SessionLocal()
    try:
        _require_project(db, project_id, ctx)
        if not _resource_belongs_to_tenant(db, EdgeProviderAccount, body.resource_id, ctx.tenant_id):
            raise HTTPException(status_code=404, detail="Connected account not found in this workspace")
        exists = db.query(ProjectConnectedAccount).filter(
            ProjectConnectedAccount.project_id == project_id, ProjectConnectedAccount.account_id == body.resource_id
        ).first()
        if not exists:
            db.add(ProjectConnectedAccount(id=str(uuid.uuid4()), tenant_id=ctx.tenant_id, project_id=project_id, account_id=body.resource_id, created_at=_now()))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
        return {"success": True}
    except HTTPException:
        raise
    finally:
        db.close()


@router.delete("/{project_id}/connected-accounts/{account_id}")
async def revoke_connected_account(project_id: str, account_id: str, ctx: TenantContext = Depends(require_tenant_context)):
    _require_manage(ctx)
    db = SessionLocal()
    try:
        row = db.query(ProjectConnectedAccount).filter(ProjectConnectedAccount.project_id == project_id, ProjectConnectedAccount.account_id == account_id).first()
        if row:
            db.delete(row); db.commit()
        return {"success": True}
    finally:
        db.close()

