"""Billing Router — Checkout, Portal, and Webhooks for Platform Billing.

Registered only in cloud mode, mounted at ``/api/billing`` and ``/api/webhooks/stripe``.
"""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.utils import get_db
from app.models.models import Tenant, Plan
from app.middleware.tenant_context import TenantContext, require_tenant_context
from app.services.stripe_provider import StripeProvider

router = APIRouter()
stripe_provider = StripeProvider()

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

@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequestBody,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_tenant_context)
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

    url = stripe_provider.create_checkout_session(
        tenant=tenant,
        plan=plan,
        add_ons=body.add_ons,
        success_url=body.success_url,
        cancel_url=body.cancel_url
    )
    return {"checkout_url": url}

@router.post("/portal")
async def create_portal(
    body: PortalRequestBody,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(require_tenant_context)
):
    """Generate a customer portal session URL for managing subscriptions."""
    if ctx.is_master or not ctx.tenant_id:
        raise HTTPException(status_code=400, detail="Master admin cannot access portal")
    
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners/admins can manage billing")

    tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    url = stripe_provider.create_customer_portal_session(
        tenant=tenant,
        return_url=body.return_url
    )
    return {"portal_url": url}

@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """Receive and process Stripe webhooks."""
    payload = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    stripe_provider.handle_webhook(db, payload, signature)
    return {"success": True}
