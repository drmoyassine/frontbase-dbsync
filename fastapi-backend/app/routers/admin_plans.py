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
from app.models.models import Plan, PlanChangeRequest, Tenant
from app.routers.tenant_admin import require_master_admin
from app.services.plan_limits import (
    LIMIT_REGISTRY,
    apply_plan,
    serialize_plan,
    validate_limits,
)

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
    limits: Optional[dict] = None
    features: Optional[List[str]] = None
    is_public: Optional[bool] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    highlighted: Optional[bool] = None
    badge: Optional[str] = None
    sort_order: Optional[int] = None


class ReviewRequest(BaseModel):
    admin_note: Optional[str] = None


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
        created_at=now,
        updated_at=now,
    )
    db.add(plan)
    db.commit()
    return {"plan": serialize_plan(plan)}


@router.put("/plans/{plan_id}")
async def update_plan(
    plan_id: str,
    body: PlanWriteRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
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


# ---------------------------------------------------------------------------
# Change-request queue
# ---------------------------------------------------------------------------

def _serialize_request(db: Session, r: PlanChangeRequest) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == r.tenant_id).first()
    return {
        "id": str(r.id),
        "tenant_id": str(r.tenant_id),
        "tenant_name": str(tenant.name) if tenant else None,
        "tenant_slug": str(tenant.slug) if tenant else None,
        "from_plan": str(r.from_plan),
        "to_plan": str(r.to_plan),
        "direction": str(r.direction),
        "status": str(r.status),
        "note": r.note,
        "admin_note": r.admin_note,
        "created_at": str(r.created_at),
        "reviewed_at": str(r.reviewed_at) if r.reviewed_at is not None else None,
    }


@router.get("/plan-requests")
async def list_plan_requests(
    status: str = "pending",
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    q = db.query(PlanChangeRequest)
    if status and status != "all":
        q = q.filter(PlanChangeRequest.status == status)
    rows = q.order_by(PlanChangeRequest.created_at.desc()).all()
    return {"requests": [_serialize_request(db, r) for r in rows]}


@router.post("/plan-requests/{request_id}/approve")
async def approve_plan_request(
    request_id: str,
    body: ReviewRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_master_admin),
):
    r = db.query(PlanChangeRequest).filter(PlanChangeRequest.id == request_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if str(r.status) != "pending":
        raise HTTPException(status_code=409, detail=f"Request already {r.status}")

    apply_plan(db, str(r.tenant_id), str(r.to_plan))  # the single apply seam
    r.status = "approved"  # type: ignore[assignment]
    r.admin_note = body.admin_note  # type: ignore[assignment]
    r.reviewed_by = admin.get("email")  # type: ignore[assignment]
    r.reviewed_at = _now()  # type: ignore[assignment]
    db.commit()
    return {"success": True, "request": _serialize_request(db, r)}


@router.post("/plan-requests/{request_id}/reject")
async def reject_plan_request(
    request_id: str,
    body: ReviewRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_master_admin),
):
    r = db.query(PlanChangeRequest).filter(PlanChangeRequest.id == request_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if str(r.status) != "pending":
        raise HTTPException(status_code=409, detail=f"Request already {r.status}")
    r.status = "rejected"  # type: ignore[assignment]
    r.admin_note = body.admin_note  # type: ignore[assignment]
    r.reviewed_by = admin.get("email")  # type: ignore[assignment]
    r.reviewed_at = _now()  # type: ignore[assignment]
    db.commit()
    return {"success": True, "request": _serialize_request(db, r)}
