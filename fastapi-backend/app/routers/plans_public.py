from typing import Any
"""Public Plans Router — read-only pricing data (no auth, cloud-only).

Consumed by the SSR ``Pricing`` builder element (via the publish serializer)
and any external marketing surface.  Returns plans in the ``PricingPlan`` shape
the SSR component already expects.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.utils import get_db
from app.models.models import Plan
from app.services.plan_limits import plan_to_pricing_card, serialize_plan

router = APIRouter()


@router.get("/public", response_model=dict[str, Any])
async def list_public_plans(db: Session = Depends(get_db)):
    """Public, active plans ordered for a pricing table."""
    plans = (
        db.query(Plan)
        .filter(Plan.is_public == True, Plan.is_active == True)  # noqa: E712
        .order_by(Plan.sort_order, Plan.name)
        .all()
    )
    return {
        # PricingPlan[] — drop-in for the SSR Pricing component's `plans` prop
        "plans": [plan_to_pricing_card(p) for p in plans],
        # Richer payload for custom marketing surfaces
        "detailed": [serialize_plan(p) for p in plans],
    }
