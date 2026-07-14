"""Billing Router — Checkout, Portal, and Webhooks for Platform Billing.

Registered only in cloud mode, mounted at ``/api/billing`` and ``/api/webhooks/{provider}``.
"""
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os

from app.database.utils import get_db
from app.models.models import Tenant, Plan
from app.middleware.tenant_context import TenantContext, require_tenant_context
from app.services.billing_gateway import BillingGateway, get_billing_gateway

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AddonCheckoutItem(BaseModel):
    addon_type: str
    quantity: int = 1

class CheckoutRequestBody(BaseModel):
    plan_slug: str
    add_ons: Optional[List[AddonCheckoutItem]] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None

class PortalRequestBody(BaseModel):
    return_url: Optional[str] = None

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/checkout", response_model=dict[str, Any])
async def create_checkout(
    body: CheckoutRequestBody,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_tenant_context),
    gateway: BillingGateway = Depends(get_billing_gateway)
):
    """Generate a checkout session URL for upgrading/purchasing a plan."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=400, detail="Master admin cannot checkout")
    
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners/admins can manage billing")

    tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    plan = db.query(Plan).filter(Plan.slug == body.plan_slug).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if not bool(plan.is_active):
        raise HTTPException(status_code=400, detail="Plan is not active")

    try:
        url = gateway.create_checkout_session(
            db=db,
            tenant=tenant,
            plan=plan,
            add_ons=body.add_ons,
            success_url=body.success_url,
            cancel_url=body.cancel_url
        )
        return {"url": url}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/portal", response_model=dict[str, Any])
async def create_portal(
    body: PortalRequestBody,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_tenant_context),
    gateway: BillingGateway = Depends(get_billing_gateway)
):
    """Generate a customer portal session URL for managing subscriptions."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=400, detail="Master admin cannot access portal")
    
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners/admins can manage billing")

    tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    try:
        url = gateway.create_customer_portal_session(
            tenant=tenant,
            return_url=body.return_url
        )
        return {"url": url}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhooks/{provider}", response_model=dict[str, Any])
async def handle_webhook(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
    gateway: BillingGateway = Depends(get_billing_gateway)
):
    """Handle incoming webhooks from billing providers."""
    configured_provider = os.getenv("BILLING_PROVIDER", "stripe").lower()
    
    if provider.lower() != configured_provider:
        # Acknowledge but ignore webhooks for non-active providers
        return {"status": "ignored"}

    payload = await request.body()
    signature = request.headers.get("stripe-signature") if provider.lower() == "stripe" else request.headers.get(f"{provider.lower()}-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature")

    gateway.handle_webhook(db, payload, signature)
    return {"status": "success"}
