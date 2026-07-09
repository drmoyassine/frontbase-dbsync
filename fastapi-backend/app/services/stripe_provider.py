"""Stripe Billing Gateway Implementation.

Handles checkout sessions, customer portal sessions, and webhook processing
for the Stripe payment provider.
"""
import os
import json
import logging
from typing import Optional, Dict, Any, List

import stripe
from fastapi import HTTPException
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.models import Tenant, Plan, TenantAddon
from app.services.billing_gateway import BillingGateway
from app.services.plan_limits import apply_plan

logger = logging.getLogger(__name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

class StripeProvider(BillingGateway):
    def create_checkout_session(
        self,
        tenant: Tenant,
        plan: Plan,
        add_ons: Optional[List[Any]] = None,
        success_url: Optional[str] = None,
        cancel_url: Optional[str] = None
    ) -> str:
        if not stripe.api_key:
            raise HTTPException(status_code=503, detail="Stripe is not configured")

        # Extract gateway metadata
        try:
            gateway_data = json.loads(str(plan.gateway_metadata)) if plan.gateway_metadata is not None else {}
        except Exception:
            gateway_data = {}

        stripe_price_id = gateway_data.get("stripe_price_id")
        if not stripe_price_id:
            raise HTTPException(status_code=400, detail="Plan is not configured for Stripe billing")

        line_items = [{"price": stripe_price_id, "quantity": 1}]

        # Append add-ons to line items if any
        if add_ons:
            for addon in add_ons:
                # addon can be a Pydantic model or dict
                addon_type = getattr(addon, "addon_type", None) or (addon.get("addon_type") if isinstance(addon, dict) else None)
                quantity = getattr(addon, "quantity", 1) if not isinstance(addon, dict) else addon.get("quantity", 1)
                
                if not addon_type:
                    continue

                env_key = f"STRIPE_PRICE_{addon_type.upper()}"
                addon_price_id = os.getenv(env_key)
                
                if addon_price_id:
                    line_items.append({"price": addon_price_id, "quantity": quantity})
                else:
                    logger.warning(f"No Stripe price ID found in environment for addon: {addon_type}")

        # Try to find existing Stripe Customer ID in tenant settings
        customer_id = None
        try:
            tenant_settings = json.loads(str(tenant.settings)) if tenant.settings is not None else {}
            customer_id = tenant_settings.get("billing", {}).get("gateway_customer_id")
        except Exception:
            pass

        session_params: dict[str, Any] = {
            "payment_method_types": ["card"],
            "line_items": line_items,
            "mode": "subscription",
            "success_url": success_url or f"{os.getenv('APP_URL', '')}/dashboard?billing=success",
            "cancel_url": cancel_url or f"{os.getenv('APP_URL', '')}/pricing",
            "client_reference_id": str(tenant.id),
            "metadata": {
                "tenant_id": str(tenant.id),
                "plan_slug": str(plan.slug),
                "add_ons": json.dumps([
                    {
                        "addon_type": getattr(a, "addon_type", None) or (a.get("addon_type") if isinstance(a, dict) else ""),
                        "quantity": getattr(a, "quantity", 1) if not isinstance(a, dict) else a.get("quantity", 1)
                    } for a in (add_ons or [])
                ]) if add_ons else "[]"
            }
        }
        
        if customer_id:
            session_params["customer"] = customer_id

        try:
            checkout_session = stripe.checkout.Session.create(**session_params)
            return str(checkout_session.url)
        except Exception as e:
            logger.error(f"Failed to create Stripe checkout session: {e}")
            raise HTTPException(status_code=500, detail="Failed to initiate checkout")


    def create_customer_portal_session(
        self,
        tenant: Tenant,
        return_url: Optional[str] = None
    ) -> str:
        if not stripe.api_key:
            raise HTTPException(status_code=503, detail="Stripe is not configured")

        customer_id = None
        try:
            tenant_settings = json.loads(str(tenant.settings)) if tenant.settings is not None else {}
            customer_id = tenant_settings.get("billing", {}).get("gateway_customer_id")
        except Exception:
            pass

        if not customer_id:
            raise HTTPException(status_code=400, detail="Tenant does not have an active billing account")

        try:
            portal_session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=return_url or f"{os.getenv('APP_URL', '')}/dashboard",
            )
            return str(portal_session.url)
        except Exception as e:
            logger.error(f"Failed to create Stripe portal session: {e}")
            raise HTTPException(status_code=500, detail="Failed to initiate billing portal")

    def handle_webhook(
        self,
        db: Session,
        payload: bytes,
        signature: str
    ) -> None:
        if not stripe.api_key or not STRIPE_WEBHOOK_SECRET:
            raise HTTPException(status_code=503, detail="Stripe is not configured")

        try:
            event = stripe.Webhook.construct_event(
                payload, signature, STRIPE_WEBHOOK_SECRET
            )
        except stripe.SignatureVerificationError as e:
            logger.warning(f"Invalid Stripe signature: {e}")
            raise HTTPException(status_code=400, detail="Invalid signature")
        except ValueError as e:
            logger.warning(f"Invalid Stripe payload: {e}")
            raise HTTPException(status_code=400, detail="Invalid payload")

        event_dict = event # type: ignore
        event_type = event_dict.get('type') if isinstance(event_dict, dict) else getattr(event, 'type', None)
        
        if isinstance(event_dict, dict):
            data_object = event_dict.get('data', {}).get('object', {})
        else:
            data_object = getattr(getattr(event, 'data', None), 'object', {})

        if event_type == 'checkout.session.completed':
            self._handle_checkout_completed(db, data_object) # type: ignore
        elif event_type == 'customer.subscription.deleted':
            self._handle_subscription_deleted(db, data_object) # type: ignore

    def _handle_checkout_completed(self, db: Session, session_obj: dict) -> None:
        tenant_id = session_obj.get("client_reference_id")
        customer_id = session_obj.get("customer")
        metadata = session_obj.get("metadata", {})
        plan_slug = metadata.get("plan_slug")

        if not tenant_id or not plan_slug:
            logger.error("Checkout session completed without tenant_id or plan_slug metadata")
            return

        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            logger.error(f"Tenant {tenant_id} not found for webhook checkout completion")
            return

        # Save customer ID
        try:
            settings = json.loads(str(tenant.settings)) if tenant.settings is not None else {}
        except Exception:
            settings = {}
        
        if "billing" not in settings:
            settings["billing"] = {}
        settings["billing"]["gateway_customer_id"] = customer_id
        tenant.settings = json.dumps(settings) # type: ignore[assignment]
        db.commit()

        # Apply plan
        try:
            apply_plan(db, str(tenant_id), str(plan_slug))
        except Exception as e:
            logger.error(f"Failed to apply plan {plan_slug} to tenant {tenant_id}: {e}")

        # Provision addons
        addons_str = session_obj.get("metadata", {}).get("add_ons", "[]")
        try:
            addons_list = json.loads(addons_str)
            now = datetime.now(timezone.utc).isoformat()
            for a in addons_list:
                addon_type = a.get("addon_type")
                quantity = int(a.get("quantity", 1))
                if not addon_type:
                    continue

                existing = (
                    db.query(TenantAddon)
                    .filter(
                        TenantAddon.tenant_id == str(tenant_id),
                        TenantAddon.addon_type == addon_type,
                        TenantAddon.status == "active",
                    )
                    .first()
                )
                if existing:
                    existing.quantity = (existing.quantity or 0) + quantity # type: ignore[assignment]
                    existing.updated_at = now # type: ignore[assignment]
                else:
                    addon = TenantAddon(
                        id=str(uuid.uuid4()),
                        tenant_id=str(tenant_id),
                        addon_type=addon_type,
                        quantity=quantity,
                        status="active",
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(addon)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to provision addons for tenant {tenant_id}: {e}")

    def _handle_subscription_deleted(self, db: Session, subscription_obj: dict) -> None:
        customer_id = subscription_obj.get("customer")
        if not customer_id:
            return
        
        search_term = f'%"gateway_customer_id": "{customer_id}"%'
        tenants = db.query(Tenant).filter(Tenant.settings.like(search_term)).all()
        
        tenant_to_downgrade = None
        for t in tenants:
            try:
                settings = json.loads(str(t.settings))
                if settings.get("billing", {}).get("gateway_customer_id") == customer_id:
                    tenant_to_downgrade = t
                    break
            except Exception:
                continue

        if not tenant_to_downgrade:
            logger.warning(f"Could not find tenant for Stripe Customer {customer_id} on subscription deleted")
            return

        # Downgrade to free
        try:
            apply_plan(db, str(tenant_to_downgrade.id), "free")
            logger.info(f"Downgraded tenant {tenant_to_downgrade.id} to free after subscription deletion")
        except Exception as e:
            logger.error(f"Failed to downgrade tenant {tenant_to_downgrade.id}: {e}")
