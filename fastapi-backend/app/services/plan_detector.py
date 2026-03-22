"""
Plan Detector — Detect provider plan tier at connect time.

Extracted from edge_providers.py router for SRP compliance.
Detects the user's plan tier by querying provider management APIs
and persists the result in provider_metadata.plan_tier.
Used by log persistence to determine retention limits.
"""

import json
import logging

import httpx
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


async def detect_and_store_plan_tier(
    provider: object,
    provider_type: str,
    creds: dict,
    db: Session,
) -> None:
    """Detect provider plan tier and store in provider_metadata.plan_tier.

    Args:
        provider: EdgeProviderAccount ORM object
        provider_type: e.g. 'supabase', 'cloudflare', 'deno'
        creds: Raw credential dict from the connect payload
        db: Active SQLAlchemy session (caller commits)
    """
    plan_tier: str | None = None

    try:
        if provider_type == "supabase":
            plan_tier = await _detect_supabase_plan(creds)
        elif provider_type == "cloudflare":
            plan_tier = await _detect_cf_plan(creds)
        elif provider_type == "deno":
            plan_tier = "free"  # No plan API — default to free
    except Exception as e:
        logger.warning("[Plan Detection] %s plan detection failed: %s", provider_type, e)

    if plan_tier:
        existing_meta: dict = {}
        raw_meta = str(getattr(provider, 'provider_metadata', '') or '')
        if raw_meta:
            try:
                existing_meta = json.loads(raw_meta)
            except (json.JSONDecodeError, TypeError):
                pass
        existing_meta["plan_tier"] = plan_tier
        provider.provider_metadata = json.dumps(existing_meta)  # type: ignore[attr-defined]
        db.commit()
        logger.info("[Plan Detection] %s: detected plan_tier=%s", provider_type, plan_tier)


async def _detect_supabase_plan(creds: dict) -> str | None:
    """Detect Supabase plan via GET /v1/organizations/{org_id}.

    Returns: 'free', 'pro', 'team', or 'enterprise'.
    """
    access_token = creds.get("access_token", "")
    if not access_token:
        return None

    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        # List orgs to find org_id
        resp = await client.get(
            "https://api.supabase.com/v1/organizations",
            headers=headers,
        )
        if resp.status_code != 200:
            return None
        orgs = resp.json()
        if not orgs:
            return None

        # Get the first org's details (includes plan field)
        org_id = orgs[0].get("id", "")
        if not org_id:
            return None

        resp2 = await client.get(
            f"https://api.supabase.com/v1/organizations/{org_id}",
            headers=headers,
        )
        if resp2.status_code != 200:
            return None
        return resp2.json().get("plan", "free")


async def _detect_cf_plan(creds: dict) -> str | None:
    """Detect Cloudflare Workers plan via account-settings.

    Returns: 'free' or 'paid' (based on default_usage_model).
    """
    api_token = creds.get("api_token", "")
    if not api_token:
        return None

    headers = {"Authorization": f"Bearer {api_token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Get account ID first
        resp = await client.get(
            "https://api.cloudflare.com/client/v4/accounts",
            headers=headers,
        )
        if resp.status_code != 200:
            return None
        accounts = resp.json().get("result", [])
        if not accounts:
            return None
        account_id = accounts[0].get("id", "")

        # Get Workers account settings (usage model = plan indicator)
        resp2 = await client.get(
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/account-settings",
            headers=headers,
        )
        if resp2.status_code != 200:
            return None
        usage_model = resp2.json().get("result", {}).get("default_usage_model", "")
        # "standard" or "bundled" = paid, otherwise free
        if usage_model in ("standard", "bundled"):
            return "paid"
        return "free"
