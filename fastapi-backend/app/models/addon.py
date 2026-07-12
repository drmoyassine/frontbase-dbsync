"""Addon configuration model.

Cloud-mode only. This stores the marketing and pricing information for managed add-ons,
allowing them to be edited via the admin dashboard and synced to Stripe.
"""

from sqlalchemy import Column, String, Text, Boolean, Integer

from ..database.config import Base

class AddonConfig(Base):
    """Configuration and pricing for a managed infrastructure add-on."""
    __tablename__ = 'addon_configs'

    # The system identifier, e.g. "managed_edge_db", "edge_engine"
    id = Column(String(50), primary_key=True)
    
    # Display fields
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    quota_display = Column(String(50), nullable=True)     # e.g. "+1 Managed DB"
    
    # Pricing
    price_cents = Column(Integer, default=0)
    
    # System fields
    is_active = Column(Boolean, default=True)
