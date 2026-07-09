"""Billing Gateway interface for Platform Billing (System A).

Provides a provider-agnostic interface for generating checkout sessions,
customer portal sessions, and handling webhooks.
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from app.models.models import Tenant, Plan


class BillingGateway(ABC):
    @abstractmethod
    def create_checkout_session(
        self,
        tenant: Tenant,
        plan: Plan,
        add_ons: Optional[List[Dict[str, Any]]] = None,
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
