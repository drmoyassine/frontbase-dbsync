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

from app.models.models import Tenant, Plan, TenantAddon, AddonConfig
from app.services.billing_gateway import BillingGateway
from app.services.plan_limits import apply_plan, MANAGED_ADDON_TYPES

logger = logging.getLogger(__name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

class StripeProvider(BillingGateway):
    def __init__(self):
        self._addon_price_cache: dict[str, str] = {}

    def sync_plan(self, plan: Plan, price_cents: int) -> dict:
        if not stripe.api_key:
            return {}
        
        try:
            gateway_data = json.loads(str(plan.gateway_metadata)) if plan.gateway_metadata is not None else {}
        except Exception:
            gateway_data = {}

        stripe_product_id = gateway_data.get("stripe_product_id")
        stripe_price_id = gateway_data.get("stripe_price_id")

        frontend_url = os.environ.get("FRONTEND_URL", "https://admin.frontbase.dev").rstrip("/")
        icon_url = f"{frontend_url}/icon.png"

        try:
            if not stripe_product_id:
                product = stripe.Product.create(name=str(plan.name), metadata={"frontbase_slug": str(plan.slug)}, images=[icon_url])
                stripe_product_id = product.id
            else:
                # Keep product name and logo in sync
                stripe.Product.modify(stripe_product_id, name=str(plan.name), images=[icon_url])

            if not stripe_price_id:
                price = stripe.Price.create(
                    product=stripe_product_id,
                    unit_amount=price_cents,
                    currency="usd",
                    recurring={"interval": "month"}
                )
                stripe_price_id = price.id
            else:
                # Retrieve the existing price to see if the amount changed. If so, we must create a new one.
                existing_price = stripe.Price.retrieve(stripe_price_id)
                if existing_price.unit_amount != price_cents:
                    # Archive old price
                    stripe.Price.modify(stripe_price_id, active=False)
                    # Create new price
                    price = stripe.Price.create(
                        product=stripe_product_id,
                        unit_amount=price_cents,
                        currency="usd",
                        recurring={"interval": "month"}
                    )
                    stripe_price_id = price.id

            return {"stripe_product_id": stripe_product_id, "stripe_price_id": stripe_price_id}
        except Exception as e:
            logger.error(f"Failed to sync plan {plan.slug} to Stripe: {e}")
            raise HTTPException(status_code=502, detail=f"Failed to sync with Stripe: {e}")

    def sync_addon(self, addon_type: str, display_name: str, price_cents: int) -> str:
        if not stripe.api_key:
            return ""
            
        if addon_type in self._addon_price_cache:
            return self._addon_price_cache[addon_type]

        frontend_url = os.environ.get("FRONTEND_URL", "https://admin.frontbase.dev").rstrip("/")
        icon_url = f"{frontend_url}/icon.png"

        try:
            product_id = None
            prices = stripe.Price.list(lookup_keys=[addon_type], limit=1)
            if prices.data:
                existing_price = prices.data[0]
                product_id = str(existing_price.product)
                stripe.Product.modify(product_id, name=display_name, images=[icon_url])
                if existing_price.unit_amount == price_cents:
                    self._addon_price_cache[addon_type] = existing_price.id
                    return existing_price.id
                # Price changed, we will create a new price and transfer the lookup key
                stripe.Price.modify(existing_price.id, active=False)
            else:
                # Create product if it doesn't exist
                product = stripe.Product.create(name=display_name, images=[icon_url])
                product_id = product.id

            price = stripe.Price.create(
                product=product_id,
                unit_amount=price_cents,
                currency="usd",
                recurring={"interval": "month"},
                lookup_key=addon_type,
                transfer_lookup_key=True
            )
            self._addon_price_cache[addon_type] = price.id
            return price.id
        except Exception as e:
            logger.error(f"Failed to sync addon {addon_type} to Stripe: {e}")
            return ""

    def create_checkout_session(
        self,
        db: Session,
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
                
                if not addon_type or addon_type not in MANAGED_ADDON_TYPES:
                    continue

                addon_config = db.query(AddonConfig).filter(AddonConfig.id == addon_type).first()
                if addon_config:
                    display_name = str(addon_config.name)
                    price_cents = int(str(addon_config.price_cents))
                else:
                    display_name = addon_type.replace("_", " ").title()
                    price_cents = 500

                
                addon_price_id = self.sync_addon(addon_type, display_name, price_cents)
                
                if addon_price_id:
                    line_items.append({"price": addon_price_id, "quantity": quantity})
                else:
                    logger.warning(f"Could not resolve Stripe price ID for addon: {addon_type}")

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
        elif event_type == 'customer.subscription.updated':
            self._handle_subscription_updated(db, data_object) # type: ignore

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
            
            # Suspend all addons since the entire subscription is deleted
            tenant_addons = db.query(TenantAddon).filter(TenantAddon.tenant_id == str(tenant_to_downgrade.id)).all()
            now = datetime.now(timezone.utc).isoformat()
            for addon in tenant_addons:
                if str(addon.status) == "active":
                    addon.status = "suspended" # type: ignore[assignment]
                    addon.updated_at = now # type: ignore[assignment]
            db.commit()
            
        except Exception as e:
            logger.error(f"Failed to downgrade tenant {tenant_to_downgrade.id}: {e}")

    def _handle_subscription_updated(self, db: Session, subscription_obj: dict) -> None:
        customer_id = subscription_obj.get("customer")
        if not customer_id:
            return
            
        search_term = f'%"gateway_customer_id": "{customer_id}"%'
        tenant_to_update = db.query(Tenant).filter(Tenant.settings.like(search_term)).first()
        
        if not tenant_to_update:
            logger.warning(f"Could not find tenant for Stripe Customer {customer_id} on subscription updated")
            return
            
        # Extract active add-on types from subscription items
        active_addon_types = set()
        items = subscription_obj.get("items", {}).get("data", [])
        for item in items:
            price = item.get("price", {})
            lookup_key = price.get("lookup_key")
            if lookup_key:
                active_addon_types.add(lookup_key)
                
        # Fetch all existing add-ons for the tenant
        tenant_addons = db.query(TenantAddon).filter(TenantAddon.tenant_id == str(tenant_to_update.id)).all()
        now = datetime.now(timezone.utc).isoformat()
        
        for addon in tenant_addons:
            addon_type = str(addon.addon_type)
            if addon_type in active_addon_types:
                if str(addon.status) != "active":
                    addon.status = "active" # type: ignore[assignment]
                    addon.updated_at = now # type: ignore[assignment]
            else:
                if str(addon.status) == "active":
                    addon.status = "suspended" # type: ignore[assignment]
                    addon.updated_at = now # type: ignore[assignment]
                    
        try:
            db.commit()
            logger.info(f"Synced add-on statuses for tenant {tenant_to_update.id} after subscription update")
        except Exception as e:
            logger.error(f"Failed to sync add-on statuses for tenant {tenant_to_update.id}: {e}")
