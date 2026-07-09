"""Billing Gateway interface for Platform Billing (System A).

Provides a provider-agnostic interface for generating checkout sessions,
customer portal sessions, and handling webhooks.
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
import os

from sqlalchemy.orm import Session
from app.models.models import Tenant, Plan


class BillingGateway(ABC):
    @abstractmethod
    def create_checkout_session(
        self,
        tenant: Tenant,
        plan: Plan,
        add_ons: Optional[List[Any]] = None,
        success_url: Optional[str] = None,
        cancel_url: Optional[str] = None
    ) -> str:
        """Create a checkout session and return its URL."""
        pass

    @abstractmethod
    def create_customer_portal_session(
        self,
        tenant: Tenant,
        return_url: Optional[str] = None
    ) -> str:
        """Create a customer portal session and return its URL."""
        pass

    @abstractmethod
    def handle_webhook(
        self,
        db: Session,
        payload: bytes,
        signature: str
    ) -> None:
        """Parse webhook, verify signature, and trigger internal actions."""
        pass

    @abstractmethod
    def sync_plan(self, plan: Plan, price_cents: int) -> dict:
        """Sync a plan to the gateway and return its gateway_metadata mapping."""
        pass

    @abstractmethod
    def sync_addon(self, addon_type: str, display_name: str, price_cents: int) -> str:
        """Ensure an add-on exists in the gateway, returning its price ID."""
        pass


_gateway_instance: Optional[BillingGateway] = None

def get_billing_gateway() -> BillingGateway:
    """Factory function to get the configured billing gateway instance."""
    global _gateway_instance
    if _gateway_instance is not None:
        return _gateway_instance
        
    provider = os.getenv("BILLING_PROVIDER", "stripe").lower()
    if provider == "stripe":
        from .stripe_provider import StripeProvider
        _gateway_instance = StripeProvider()
        return _gateway_instance
        
    raise ValueError(f"Unknown billing provider: {provider}")
