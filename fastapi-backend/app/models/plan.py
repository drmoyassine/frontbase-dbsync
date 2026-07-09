"""Plan & subscription models.

Cloud-mode only.  A ``Plan`` is the master-admin-configurable subscription tier
(its limits live as a JSON map — see ``app/services/plan_limits.py``).  A
``Tenant.plan`` stores the plan ``slug`` (soft FK), so existing ``plan == 'free'``
checks keep working while limits become data-driven.
"""

from sqlalchemy import Column, String, Text, Boolean, Integer

from ..database.config import Base


class Plan(Base):
    """A subscription tier defined by the master admin."""
    __tablename__ = 'plans'

    id = Column(String, primary_key=True)
    slug = Column(String(50), unique=True, nullable=False)   # 'free' | 'pro' | 'appsumo_tier1'…
    name = Column(String(100), nullable=False)               # Display name
    description = Column(Text, nullable=True)                 # Marketing blurb

    # Who provides the runtime infra. Drives whether operational/runtime caps
    # apply: 'managed' (Frontbase-hosted: free shared / Basic dedicated) bears our
    # COGS so runtime caps make sense; 'byo' (Pro/Enterprise, tenant's own edge)
    # costs the tenant, so runtime is not metered.
    infra_mode = Column(String(20), default='byo')            # managed | byo

    # Display-only pricing
    price_display = Column(String(50), nullable=True)         # "$29", "Custom", "Free"
    price_period = Column(String(50), nullable=True)          # "/month"
    
    # Machine-readable price (in cents) for billing gateway sync
    price_cents = Column(Integer, default=0)

    # Limits map (JSON): { "executions_monthly": 1000, "private_pages": false, ... }
    limits = Column(Text, nullable=True)

    # Free-text marketing features shown on the pricing card (JSON array of strings)
    features = Column(Text, nullable=True)
    
    # Billing Gateway Provider Data (e.g. Stripe Price IDs)
    gateway_metadata = Column(Text, nullable=True)

    # Catalog flags
    is_public = Column(Boolean, default=False)                # shown on public pricing endpoint
    is_active = Column(Boolean, default=True)                 # assignable; inactive = grandfathered
    is_default = Column(Boolean, default=False)               # plan new tenants receive
    highlighted = Column(Boolean, default=False)              # "most popular" card
    badge = Column(String(50), nullable=True)                 # "Most popular"
    sort_order = Column(Integer, default=0)                   # pricing-table ordering

    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
