"""Admin Plans Router — master-admin plan catalog + change-request queue.

Registered only in cloud mode, mounted at ``/api/admin``.  All endpoints require
master admin (reuses ``require_master_admin`` from ``tenant_admin``).
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.utils import get_db
from app.models.models import Plan, Tenant, TenantAddon
from app.routers.tenant_admin import require_master_admin
from app.services.plan_limits import (
    LIMIT_REGISTRY,
    MANAGED_ADDON_TYPES,
    apply_plan,
    serialize_plan,
    validate_limits,
)
from app.services.billing_gateway import BillingGateway, get_billing_gateway

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PlanWriteRequest(BaseModel):
    slug: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    infra_mode: Optional[str] = None  # managed | byo
    price_display: Optional[str] = None
    price_period: Optional[str] = None
    price_cents: Optional[int] = None
    limits: Optional[dict] = None
    features: Optional[List[str]] = None
    is_public: Optional[bool] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    highlighted: Optional[bool] = None
    badge: Optional[str] = None
    sort_order: Optional[int] = None





# ---------------------------------------------------------------------------
# Limit registry (drives the admin limits editor)
# ---------------------------------------------------------------------------

@router.get("/plans/limit-registry")
async def get_limit_registry(_admin: dict = Depends(require_master_admin)):
    return {"limits": LIMIT_REGISTRY}


# ---------------------------------------------------------------------------
# Plan CRUD
# ---------------------------------------------------------------------------

@router.get("/plans")
async def list_plans(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    plans = db.query(Plan).order_by(Plan.sort_order, Plan.name).all()
    out = []
    for p in plans:
        data = serialize_plan(p)
        data["tenant_count"] = db.query(Tenant).filter(Tenant.plan == p.slug).count()
        out.append(data)
    return {"plans": out}


@router.post("/plans", status_code=201)
async def create_plan(
    body: PlanWriteRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
    gateway: BillingGateway = Depends(get_billing_gateway),
):
    import json
    slug = (body.slug or "").lower().strip()
    if not slug or not body.name:
        raise HTTPException(status_code=400, detail="slug and name are required")
    if db.query(Plan).filter(Plan.slug == slug).first():
        raise HTTPException(status_code=409, detail=f"Plan slug '{slug}' already exists")

    limits = validate_limits(body.limits or {})
    if body.is_default:
        db.query(Plan).update({Plan.is_default: False})

    now = _now()
    plan = Plan(
        id=str(uuid.uuid4()),
        slug=slug,
        name=body.name,
        description=body.description,
        infra_mode=body.infra_mode if body.infra_mode in ("managed", "byo") else "byo",
        price_display=body.price_display,
        price_period=body.price_period,
        limits=json.dumps(limits),
        features=json.dumps(body.features or []),
        is_public=bool(body.is_public),
        is_active=True if body.is_active is None else bool(body.is_active),
        is_default=bool(body.is_default),
        highlighted=bool(body.highlighted),
        badge=body.badge,
        sort_order=body.sort_order or 0,
        price_cents=body.price_cents or 0,
        created_at=now,
        updated_at=now,
    )
    db.add(plan)
    if body.price_cents is not None and body.price_cents > 0:
        gateway_data = gateway.sync_plan(plan, body.price_cents)
        if gateway_data:
            plan.gateway_metadata = json.dumps(gateway_data) # type: ignore[assignment]
            
    db.commit()
    return {"plan": serialize_plan(plan)}


@router.put("/plans/{plan_id}")
async def update_plan(
    plan_id: str,
    body: PlanWriteRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
    gateway: BillingGateway = Depends(get_billing_gateway),
):
    import json
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if body.name is not None:
        plan.name = body.name  # type: ignore[assignment]
    if body.description is not None:
        plan.description = body.description  # type: ignore[assignment]
    if body.infra_mode in ("managed", "byo"):
        plan.infra_mode = body.infra_mode  # type: ignore[assignment]
    if body.price_display is not None:
        plan.price_display = body.price_display  # type: ignore[assignment]
    if body.price_period is not None:
        plan.price_period = body.price_period  # type: ignore[assignment]
    if body.limits is not None:
        plan.limits = json.dumps(validate_limits(body.limits))  # type: ignore[assignment]
    if body.features is not None:
        plan.features = json.dumps(body.features)  # type: ignore[assignment]
    if body.is_public is not None:
        plan.is_public = body.is_public  # type: ignore[assignment]
    if body.is_active is not None:
        plan.is_active = body.is_active  # type: ignore[assignment]
    if body.highlighted is not None:
        plan.highlighted = body.highlighted  # type: ignore[assignment]
    if body.badge is not None:
        plan.badge = body.badge  # type: ignore[assignment]
    if body.sort_order is not None:
        plan.sort_order = body.sort_order  # type: ignore[assignment]
    if body.is_default:
        db.query(Plan).filter(Plan.id != plan_id).update({Plan.is_default: False})
        plan.is_default = True  # type: ignore[assignment]
        
    if body.price_cents is not None:
        plan.price_cents = body.price_cents  # type: ignore[assignment]
        if body.price_cents > 0:
            gateway_data = gateway.sync_plan(plan, body.price_cents)
            if gateway_data:
                plan.gateway_metadata = json.dumps(gateway_data)  # type: ignore[assignment]

    plan.updated_at = _now()  # type: ignore[assignment]
    db.commit()
    return {"plan": serialize_plan(plan)}


@router.delete("/plans/{plan_id}")
async def delete_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if bool(plan.is_default):
        raise HTTPException(status_code=400, detail="Cannot delete the default plan")
    in_use = db.query(Tenant).filter(Tenant.plan == plan.slug).count()
    if in_use:
        raise HTTPException(
            status_code=409,
            detail=f"{in_use} tenant(s) are on this plan. Reassign them before deleting.",
        )
    plan.is_active = False  # type: ignore[assignment]
    plan.updated_at = _now()  # type: ignore[assignment]
    db.commit()
    return {"success": True, "message": f"Plan '{plan.slug}' deactivated"}


@router.post("/billing/sync-addons")
async def sync_billing_addons(
    _admin: dict = Depends(require_master_admin),
    gateway: BillingGateway = Depends(get_billing_gateway),
):
    """Force synchronization of all managed add-ons to the billing gateway."""
    ADDON_DEFAULT_PRICES = {
        "managed_edge_db": 500,
        "managed_cache": 200,
        "managed_queue": 200,
        "managed_domain": 100
    }
    
    synced = []
    for addon_type in MANAGED_ADDON_TYPES:
        display_name = addon_type.replace("_", " ").title()
        price_cents = ADDON_DEFAULT_PRICES.get(addon_type, 500)
        price_id = gateway.sync_addon(addon_type, display_name, price_cents)
        if price_id:
            synced.append(addon_type)
            
    return {"success": True, "synced_addons": synced}


# ---------------------------------------------------------------------------
# Managed add-ons (à-la-carte managed-infra entitlements)
# ---------------------------------------------------------------------------

class AddonWriteBody(BaseModel):
    tenant_id: str
    addon_type: str
    quantity: int = 1


def _serialize_addon(a: TenantAddon) -> dict:
    return {
        "id": str(a.id),
        "tenant_id": str(a.tenant_id),
        "addon_type": str(a.addon_type),
        "quantity": int(a.quantity) if a.quantity is not None else 1,  # type: ignore[arg-type]
        "status": str(a.status),
        "created_at": str(a.created_at),
        "updated_at": str(a.updated_at),
    }


@router.get("/tenant-addons")
async def list_tenant_addons(
    tenant_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    rows = (
        db.query(TenantAddon)
        .filter(TenantAddon.tenant_id == tenant_id)
        .order_by(TenantAddon.created_at.desc())
        .all()
    )
    return {"addons": [_serialize_addon(a) for a in rows]}


@router.post("/tenant-addons", status_code=201)
async def grant_tenant_addon(
    body: AddonWriteBody,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """Grant (or top up) a managed add-on for a tenant. No payment gateway yet —
    master-admin-granted; billing will plug in here later."""
    if body.addon_type not in MANAGED_ADDON_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown add-on type '{body.addon_type}'")
    if not db.query(Tenant).filter(Tenant.id == body.tenant_id).first():
        raise HTTPException(status_code=404, detail="Tenant not found")
    existing = (
        db.query(TenantAddon)
        .filter(
            TenantAddon.tenant_id == body.tenant_id,
            TenantAddon.addon_type == body.addon_type,
            TenantAddon.status == "active",
        )
        .first()
    )
    now = _now()
    if existing:
        existing.quantity = body.quantity  # type: ignore[assignment]
        existing.updated_at = now  # type: ignore[assignment]
        addon = existing
    else:
        addon = TenantAddon(
            id=str(uuid.uuid4()),
            tenant_id=body.tenant_id,
            addon_type=body.addon_type,
            quantity=body.quantity,
            status="active",
            created_at=now,
            updated_at=now,
        )
        db.add(addon)
    db.commit()
    db.refresh(addon)
    return {"addon": _serialize_addon(addon)}


@router.delete("/tenant-addons/{addon_id}")
async def revoke_tenant_addon(
    addon_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    addon = db.query(TenantAddon).filter(TenantAddon.id == addon_id).first()
    if not addon:
        raise HTTPException(status_code=404, detail="Add-on not found")
    addon.status = "revoked"  # type: ignore[assignment]
    addon.updated_at = _now()  # type: ignore[assignment]
    db.commit()
    # Deprovision the managed resources this add-on granted (best-effort).
    await _deprovision_for_addon(db, str(addon.tenant_id), str(addon.addon_type))
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Managed provisioning (Frontbase-owned CF resources, gated by has_active_addon)
# ---------------------------------------------------------------------------

class ProvisionBody(BaseModel):
    tenant_id: str
    project_id: str
    addon_type: str
    name: Optional[str] = None
    # managed_domain only:
    hostname: Optional[str] = None
    zone_id: Optional[str] = None
    service: Optional[str] = None      # CF Worker (engine) name to attach the domain to
    engine_id: Optional[str] = None


@router.post("/managed/provision")
async def provision_managed_resource(
    body: ProvisionBody,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """Provision a Frontbase-managed resource for a tenant, gated by the matching add-on.

    Code-complete against the Cloudflare contract; requires FB_OPERATOR_CF_* credentials
    and live testing before the managed tier is enabled.
    """
    from app.services.plan_limits import has_active_addon
    from app.services import managed_provisioner as mp

    if not has_active_addon(db, body.tenant_id, body.addon_type):
        raise HTTPException(status_code=403, detail=f"Tenant lacks an active '{body.addon_type}' add-on.")
    if not mp.is_configured():
        raise HTTPException(status_code=503, detail="Managed provisioning is not configured (operator credentials missing).")

    label = body.name or f"{body.addon_type}-{body.tenant_id[:8]}"
    try:
        if body.addon_type == "managed_cache":
            rid = await mp.provision_kv(db, tenant_id=body.tenant_id, project_id=body.project_id, title=label)
            return {"success": True, "resource_id": rid, "type": "cache"}
        if body.addon_type == "managed_edge_db":
            rid = await mp.provision_d1(db, tenant_id=body.tenant_id, project_id=body.project_id, name=label)
            return {"success": True, "resource_id": rid, "type": "state_db"}
        if body.addon_type == "managed_domain":
            if not (body.hostname and body.zone_id and body.service and body.engine_id):
                raise HTTPException(status_code=400, detail="managed_domain requires hostname, zone_id, service, engine_id.")
            res = await mp.provision_domain(
                db, tenant_id=body.tenant_id, project_id=body.project_id, engine_id=body.engine_id,
                hostname=body.hostname, zone_id=body.zone_id, service=body.service,
            )
            return {"success": True, **res, "type": "domain"}
        if body.addon_type == "managed_queue":
            rid = await mp.provision_queue(db, tenant_id=body.tenant_id, project_id=body.project_id, name=label)
            return {"success": True, "resource_id": rid, "type": "queue"}
        raise HTTPException(status_code=501, detail=f"Provisioning for '{body.addon_type}' is not implemented yet.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Provisioning failed: {e}")


async def _deprovision_for_addon(db: Session, tenant_id: str, addon_type: str) -> None:
    """Best-effort deprovision of managed resources a tenant holds for an add-on type."""
    from app.services import managed_provisioner as mp
    from app.models.models import Project, EdgeDatabase, EdgeCache
    if not mp.is_configured():
        return
    project_ids = [str(p.id) for p in db.query(Project).filter(Project.tenant_id == tenant_id).all()]
    if not project_ids:
        return
    try:
        if addon_type == "managed_edge_db":
            for row in db.query(EdgeDatabase).filter(EdgeDatabase.project_id.in_(project_ids), EdgeDatabase.is_managed == True).all():  # noqa: E712
                await mp.deprovision_d1(db, str(row.id))
        elif addon_type == "managed_cache":
            for row in db.query(EdgeCache).filter(EdgeCache.project_id.in_(project_ids), EdgeCache.is_managed == True).all():  # noqa: E712
                await mp.deprovision_kv(db, str(row.id))
    except Exception as e:
        # Deprovision failures must not block add-on revocation; log and continue.
        import logging
        logging.getLogger(__name__).warning("[managed] deprovision for %s failed: %s", addon_type, e)
