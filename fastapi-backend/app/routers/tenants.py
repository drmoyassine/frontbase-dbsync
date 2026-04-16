"""
Tenants Router — CRUD endpoints for tenant management (cloud-only).

Registered only when DEPLOYMENT_MODE=cloud.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.database.config import SessionLocal
from app.models.models import Tenant
from app.middleware.tenant_context import TenantContext, require_tenant_context

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TenantUpdateRequest(BaseModel):
    name: Optional[str] = None
    settings: Optional[dict] = None


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

        tenant.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
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


@router.get("/check-slug/{slug}")
async def check_slug(slug: str):
    """Check if a tenant slug is available (public, no auth required)."""
    slug = slug.lower().strip()

    # Validate format
    import re
    from app.routers.auth_cloud import RESERVED_SLUGS, SLUG_PATTERN, _validate_slug
    err = _validate_slug(slug)
    if err:
        return {"available": False, "error": err}

    db = SessionLocal()
    try:
        existing = db.query(Tenant).filter(Tenant.slug == slug).first()
        return {"available": existing is None}
    finally:
        db.close()
