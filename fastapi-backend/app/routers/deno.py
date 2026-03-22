"""
Deno Deploy Router — Thin Router.

Post-connect hook for Deno Deploy accounts.
Uses the personal (ddp_) token to auto-detect org_slug, user_id,
and org_uuid from Deno APIs, then enriches the stored credentials.

Endpoints:
    POST /api/deno/connect — Auto-detect org info, enrich saved credentials
"""

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database.config import get_db
from ..models.models import EdgeProviderAccount
from ..core.security import decrypt_credentials, encrypt_credentials

router = APIRouter(prefix="/api/deno", tags=["Deno Deploy"])


class DenoConnectRequest(BaseModel):
    provider_id: str


@router.post("/connect")
async def connect_deno(payload: DenoConnectRequest, db: Session = Depends(get_db)):
    """Auto-detect Deno org info using the personal (ddp_) token.
    
    Flow:
        1. Read saved credentials from the provider account
        2. Use ddp_ (personal_token) to call dash.deno.com/api/user
        3. Extract org_slug (login) and user_id (id) from response
        4. Call dash.deno.com/api/organizations to get org UUID
        5. Enrich and re-save credentials with org_slug + user_id + org_uuid
    
    Returns:
        org_slug, user_id, org_uuid, account_name for the frontend to display
    """
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == payload.provider_id
    ).first()
    if not provider:
        raise HTTPException(404, "Provider account not found")
    
    creds = decrypt_credentials(str(provider.provider_credentials))
    personal_token = creds.get("personal_token", "")
    
    if not personal_token:
        # No personal token — check if org_slug was manually provided
        org_slug = creds.get("org_slug", "")
        if org_slug:
            return {
                "success": True,
                "org_slug": org_slug,
                "user_id": creds.get("user_id", ""),
                "org_uuid": creds.get("org_uuid", ""),
                "account_name": f"Deno Deploy ({org_slug})",
                "auto_detected": False,
            }
        return {
            "success": False,
            "detail": "No personal token (ddp_) provided. Org slug must be set manually.",
        }
    
    headers = {"Authorization": f"Bearer {personal_token}"}
    
    # Step 1: Get user profile from dash API
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://dash.deno.com/api/user",
                headers=headers,
            )
    except Exception as e:
        return {"success": False, "detail": f"Failed to reach Deno API: {str(e)}"}
    
    if resp.status_code != 200:
        return {
            "success": False,
            "detail": f"Deno API returned {resp.status_code}. Check your personal token (ddp_).",
        }
    
    user_data = resp.json()
    org_slug = user_data.get("login", "")
    user_id = user_data.get("id", "")
    display_name = user_data.get("name", org_slug)
    
    if not org_slug:
        return {"success": False, "detail": "Could not detect org slug from Deno API response."}
    
    # Step 2: Discover org UUID from organizations list
    # The Subhosting API needs the org UUID (not user_id) for domain management
    org_uuid = ""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            orgs_resp = await client.get(
                "https://dash.deno.com/api/organizations",
                headers=headers,
            )
        if orgs_resp.status_code == 200:
            orgs = orgs_resp.json()
            if isinstance(orgs, list) and len(orgs) > 0:
                # Find the org matching the user's slug, or take the first one
                for org in orgs:
                    members = org.get("members", [])
                    # Personal org has the same name/slug as the user
                    if org.get("name") == org_slug or org.get("name") == display_name:
                        org_uuid = org.get("id", "")
                        break
                if not org_uuid:
                    # Fallback: take the first org
                    org_uuid = orgs[0].get("id", "")
    except Exception:
        pass  # org_uuid discovery is best-effort

    # Enrich credentials with auto-detected values
    creds["org_slug"] = org_slug
    creds["user_id"] = user_id
    if org_uuid:
        creds["org_uuid"] = org_uuid
    provider.provider_credentials = encrypt_credentials(creds)  # type: ignore[assignment]
    db.commit()
    
    return {
        "success": True,
        "org_slug": org_slug,
        "user_id": user_id,
        "org_uuid": org_uuid,
        "account_name": f"Deno Deploy ({display_name})",
        "auto_detected": True,
    }
