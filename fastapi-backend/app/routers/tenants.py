"""
Tenants Router — CRUD endpoints for tenant management (cloud-only).

Registered only when DEPLOYMENT_MODE=cloud.
"""

import os
import uuid
import secrets
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional, Literal, List
from datetime import datetime, timezone, timedelta, UTC

from app.database.config import SessionLocal
from app.models.models import (
    Tenant, Plan, PlanChangeRequest, Project, Page, AutomationDraft, TenantMember, TenantInvite,
)
from app.middleware.tenant_context import TenantContext, require_tenant_context
from app.services.plan_limits import get_plan, plan_limits, serialize_plan, check_quota, UNLIMITED

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TenantUpdateRequest(BaseModel):
    name: Optional[str] = None
    settings: Optional[dict] = None


class PlanChangeRequestBody(BaseModel):
    to_plan: str
    note: Optional[str] = None


class InviteCreateBody(BaseModel):
    email: EmailStr
    role: Literal["admin", "editor", "viewer"] = "editor"
    project_ids: Optional[List[str]] = None   # projects granted on accept; None = all current projects


INVITE_TTL_DAYS = 7


def _app_base_url() -> str:
    return (os.getenv("APP_PUBLIC_URL") or os.getenv("APP_URL") or "").rstrip("/")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/me")
async def get_my_tenant(ctx: TenantContext = Depends(require_tenant_context)):
    """Get the current user's tenant details."""
    if ctx.is_master:
        return {"tenant": None, "message": "Master admin has no tenant"}

    if not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")

    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        return {
            "tenant": {
                "id": str(tenant.id),
                "slug": str(tenant.slug),
                "name": str(tenant.name),
                "plan": str(tenant.plan),
                "status": str(tenant.status),
                "settings": tenant.settings,
                "created_at": str(tenant.created_at),
                "updated_at": str(tenant.updated_at),
            }
        }
    finally:
        db.close()


@router.put("/me")
async def update_my_tenant(
    body: TenantUpdateRequest,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Update the current user's tenant (name, settings)."""
    if ctx.is_master:
        raise HTTPException(status_code=400, detail="Master admin has no tenant to update")

    if not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")

    # Only owner/admin can update tenant settings
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        if body.name is not None:
            tenant.name = body.name  # type: ignore[assignment]
        if body.settings is not None:
            import json
            tenant.settings = json.dumps(body.settings)  # type: ignore[assignment]

        tenant.updated_at = datetime.now(UTC).isoformat()  # type: ignore[assignment]
        db.commit()

        return {
            "success": True,
            "tenant": {
                "id": str(tenant.id),
                "slug": str(tenant.slug),
                "name": str(tenant.name),
                "plan": str(tenant.plan),
                "status": str(tenant.status),
                "updated_at": str(tenant.updated_at),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


def _tenant_usage(db, tenant_id: str) -> dict:
    """Live resource usage for the tenant (capacity keys we can count cheaply)."""
    from app.models.models import EdgeEngine, EdgeProviderAccount
    from app.services.sync.models.datasource import Datasource

    projects = db.query(Project).filter(Project.tenant_id == tenant_id).count()
    pages = db.query(Page).join(Project).filter(Project.tenant_id == tenant_id).count()
    workflows = db.query(AutomationDraft).join(Project).filter(Project.tenant_id == tenant_id).count()
    team_members = db.query(TenantMember).filter(TenantMember.tenant_id == tenant_id).count()

    edge_engines = db.query(EdgeEngine).join(Project).filter(Project.tenant_id == tenant_id).count()
    connected_accounts = db.query(EdgeProviderAccount).join(Project).filter(Project.tenant_id == tenant_id).count()
    datasources = db.query(Datasource).join(Project).filter(Project.tenant_id == tenant_id).count()

    # NOTE: custom_domains is not a usage counter here — it's a managed add-on (managed tiers) /
    # free BYO, not a capacity cap. See [TIERS] §4.4.
    return {
        "projects": projects,
        "pages": pages,
        "workflows": workflows,
        "team_members": team_members,
        "edge_engines": edge_engines,
        "datasources": datasources,
        "connected_accounts": connected_accounts,
    }


def _serialize_my_request(r: PlanChangeRequest) -> dict:
    return {
        "id": str(r.id),
        "from_plan": str(r.from_plan),
        "to_plan": str(r.to_plan),
        "direction": str(r.direction),
        "status": str(r.status),
        "note": r.note,
        "admin_note": r.admin_note,
        "created_at": str(r.created_at),
        "reviewed_at": str(r.reviewed_at) if r.reviewed_at is not None else None,
    }


@router.get("/me/plan")
async def get_my_plan(ctx: TenantContext = Depends(require_tenant_context)):
    """Current plan, resolved limits, live usage, and any open change request."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")

    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        plan = get_plan(db, str(tenant.plan) if tenant.plan is not None else None)
        pending = (
            db.query(PlanChangeRequest)
            .filter(
                PlanChangeRequest.tenant_id == ctx.tenant_id,
                PlanChangeRequest.status == "pending",
            )
            .first()
        )
        return {
            "plan": serialize_plan(plan) if plan else None,
            "limits": plan_limits(plan),
            "usage": _tenant_usage(db, str(ctx.tenant_id)),
            "pending_request": _serialize_my_request(pending) if pending else None,
        }
    finally:
        db.close()


@router.get("/me/addons")
async def get_my_addons(ctx: TenantContext = Depends(require_tenant_context)):
    """Active managed add-ons for the current tenant (managed-infra entitlements)."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    from app.services.plan_limits import get_active_addons
    db = SessionLocal()
    try:
        return {"addons": get_active_addons(db, str(ctx.tenant_id))}
    finally:
        db.close()


@router.post("/me/plan-request", status_code=201)
async def request_plan_change(
    body: PlanChangeRequestBody,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Submit an upgrade/downgrade request (master admin reviews it)."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners/admins can request a plan change")

    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        current_slug = str(tenant.plan) if tenant.plan is not None else None
        if body.to_plan == current_slug:
            raise HTTPException(status_code=400, detail="Already on this plan")

        target = db.query(Plan).filter(
            Plan.slug == body.to_plan,
            Plan.is_public == True,  # noqa: E712
            Plan.is_active == True,  # noqa: E712
        ).first()
        if not target:
            raise HTTPException(status_code=404, detail="Plan not available")

        existing = (
            db.query(PlanChangeRequest)
            .filter(
                PlanChangeRequest.tenant_id == ctx.tenant_id,
                PlanChangeRequest.status == "pending",
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="You already have a pending plan request")

        current = get_plan(db, current_slug)
        cur_order = (int(current.sort_order) if current is not None and current.sort_order is not None else 0)  # type: ignore[arg-type]
        tgt_order = int(target.sort_order) if target.sort_order is not None else 0  # type: ignore[arg-type]
        direction = "upgrade" if tgt_order >= cur_order else "downgrade"

        req = PlanChangeRequest(
            id=str(uuid.uuid4()),
            tenant_id=str(ctx.tenant_id),
            from_plan=current_slug or "",
            to_plan=body.to_plan,
            direction=direction,
            status="pending",
            note=body.note,
            requested_by=ctx.user_id,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        db.add(req)
        db.commit()
        return {"success": True, "request": _serialize_my_request(req)}
    finally:
        db.close()


@router.delete("/me/plan-request/{request_id}")
async def cancel_plan_request(
    request_id: str,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Cancel the tenant's own pending request."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")

    db = SessionLocal()
    try:
        req = (
            db.query(PlanChangeRequest)
            .filter(
                PlanChangeRequest.id == request_id,
                PlanChangeRequest.tenant_id == ctx.tenant_id,
            )
            .first()
        )
        if not req:
            raise HTTPException(status_code=404, detail="Request not found")
        if str(req.status) != "pending":
            raise HTTPException(status_code=409, detail=f"Request already {req.status}")
        req.status = "cancelled"  # type: ignore[assignment]
        db.commit()
        return {"success": True}
    finally:
        db.close()


def _serialize_invite(inv: TenantInvite) -> dict:
    return {
        "id": str(inv.id),
        "email": str(inv.email),
        "role": str(inv.role),
        "status": str(inv.status),
        "created_at": str(inv.created_at),
        "expires_at": str(inv.expires_at),
    }


def _pending_invite_count(db, tenant_id: str) -> int:
    """Count non-expired pending invites (they each reserve a seat)."""
    now_iso = datetime.now(timezone.utc).isoformat()
    return (
        db.query(TenantInvite)
        .filter(
            TenantInvite.tenant_id == tenant_id,
            TenantInvite.status == "pending",
            TenantInvite.expires_at > now_iso,
        )
        .count()
    )


@router.get("/me/invites")
async def list_invites(ctx: TenantContext = Depends(require_tenant_context)):
    """List pending invites for the current tenant."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    db = SessionLocal()
    try:
        rows = (
            db.query(TenantInvite)
            .filter(TenantInvite.tenant_id == ctx.tenant_id, TenantInvite.status == "pending")
            .order_by(TenantInvite.created_at.desc())
            .all()
        )
        return {"invites": [_serialize_invite(r) for r in rows]}
    finally:
        db.close()


@router.post("/me/invites", status_code=201)
async def create_invite(
    body: InviteCreateBody,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Invite a teammate to the current tenant (owner/admin only).

    Gated by the plan's ``team_members`` cap: existing members + outstanding
    pending invites must be below the limit (soft check). The authoritative
    hard check runs again when the invitee actually joins.
    """
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners/admins can invite teammates")

    email = body.email.lower().strip()
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        # Already a member?
        existing_member = (
            db.query(TenantMember)
            .join(Tenant, TenantMember.tenant_id == Tenant.id)
            .filter(TenantMember.tenant_id == ctx.tenant_id)
            .all()
        )
        # (member emails live on User; cheap guard against re-inviting an open invite)
        dup = (
            db.query(TenantInvite)
            .filter(
                TenantInvite.tenant_id == ctx.tenant_id,
                TenantInvite.email == email,
                TenantInvite.status == "pending",
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="An invite for this email is already pending")

        # Soft team_members check: members + pending invites must be below the cap.
        used = len(existing_member) + _pending_invite_count(db, str(ctx.tenant_id))
        check_quota(db, ctx, "team_members", used)

        now = datetime.now(timezone.utc)
        # Resolve granted projects: explicit list, else all current projects (back-compat:
        # inviting without specifying grants access to everything, as before multi-project).
        granted = body.project_ids
        if granted is None:
            granted = [str(p.id) for p in db.query(Project).filter(Project.tenant_id == ctx.tenant_id).all()]
        invite = TenantInvite(
            id=str(uuid.uuid4()),
            tenant_id=str(ctx.tenant_id),
            email=email,
            role=body.role,
            token=secrets.token_urlsafe(32),
            status="pending",
            invited_by=ctx.user_id,
            created_at=now.isoformat(),
            expires_at=(now + timedelta(days=INVITE_TTL_DAYS)).isoformat(),
            project_ids=json.dumps(granted),
        )
        db.add(invite)
        db.commit()

        # Send the invite email (non-fatal on failure)
        base = _app_base_url()
        link = f"{base}/accept-invite?token={invite.token}" if base else f"/accept-invite?token={invite.token}"
        try:
            from app.services.email_service import send_email
            await send_email(
                to=email,
                subject=f"You've been invited to join {tenant.name} on Frontbase",
                html=(
                    f"<p>You've been invited to join <strong>{tenant.name}</strong> "
                    f"as a <strong>{body.role}</strong>.</p>"
                    f"<p><a href=\"{link}\">Accept your invitation</a> (expires in {INVITE_TTL_DAYS} days).</p>"
                ),
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[Invite] email send failed: {e}")

        return {"success": True, "invite": _serialize_invite(invite), "link": link}
    finally:
        db.close()


@router.delete("/me/invites/{invite_id}")
async def revoke_invite(
    invite_id: str,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Revoke a pending invite (owner/admin only)."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this user")
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners/admins can revoke invites")
    db = SessionLocal()
    try:
        inv = (
            db.query(TenantInvite)
            .filter(TenantInvite.id == invite_id, TenantInvite.tenant_id == ctx.tenant_id)
            .first()
        )
        if not inv:
            raise HTTPException(status_code=404, detail="Invite not found")
        if str(inv.status) != "pending":
            raise HTTPException(status_code=409, detail=f"Invite already {inv.status}")
        inv.status = "revoked"  # type: ignore[assignment]
        db.commit()
        return {"success": True}
    finally:
        db.close()


@router.get("/check-slug/{slug}")
async def check_slug(slug: str):
    """Check if a tenant slug is available (public, no auth required)."""
    slug = slug.lower().strip()

    # Validate format
    import re
    if len(slug) < 3 or len(slug) > 50:
        return {"available": False, "error": "Slug must be between 3 and 50 characters"}
        
    if not re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$', slug):
        return {"available": False, "error": "Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen"}
        
    RESERVED_SLUGS = {"admin", "app", "api", "auth", "login", "signup", "dashboard", "www", "test", "demo"}
    if slug in RESERVED_SLUGS:
        return {"available": False, "error": f"Slug '{slug}' is reserved"}

    db = SessionLocal()
    try:
        existing = db.query(Tenant).filter(Tenant.slug == slug).first()
        return {"available": existing is None}
    finally:
        db.close()
