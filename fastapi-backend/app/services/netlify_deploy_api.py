"""
Netlify Edge Functions — Deploy API.

Uses the Netlify API to deploy edge functions via site deploys.
Credentials: { "api_token": "nfp_...", "site_id": "..." }
"""

import json
import hashlib
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine, EdgeProviderAccount
from ..services.secrets_builder import build_engine_secrets


NETLIFY_API = "https://api.netlify.com/api/v1"


def _headers(api_token: str) -> dict:
    return {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}


async def deploy(engine: EdgeEngine, db: Session, script_content: str, adapter_type: str) -> None:
    """Deploy bundle to Netlify Edge Functions."""
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == engine.edge_provider_id
    ).first()

    from ..core.security import decrypt_credentials
    creds = decrypt_credentials(str(provider.provider_credentials or '{}'))  # type: ignore[union-attr]
    api_token = creds.get('api_token')
    site_id = creds.get('site_id')

    if not api_token or not site_id:
        raise HTTPException(400, "Missing Netlify credentials (api_token, site_id)")

    script_filename = "netlify-edge.js" if adapter_type == "full" else "netlify-edge-lite.js"

    # Deploy via file digest
    await deploy_edge_function(api_token, site_id, script_content, script_filename)

    # Push environment variables
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        engine_id=str(engine.id),
    )
    if secrets:
        await set_env_vars(api_token, site_id, secrets)


# ── Platform-specific API calls ───────────────────────────────────────

async def deploy_edge_function(
    api_token: str, site_id: str, script_content: str, filename: str
) -> dict:
    """Deploy an edge function to Netlify via site deploy with file digest."""
    # Compute SHA1 for file digest
    file_hash = hashlib.sha1(script_content.encode('utf-8')).hexdigest()
    edge_path = f"edge-functions/{filename}"

    async with httpx.AsyncClient() as client:
        # Create deploy with file digest
        deploy_resp = await client.post(
            f"{NETLIFY_API}/sites/{site_id}/deploys",
            headers=_headers(api_token),
            json={
                "files": {f"/{edge_path}": file_hash},
                "edge_functions": [{"function": filename.replace('.js', ''), "path": "/*"}],
            },
            timeout=30.0,
        )
        if deploy_resp.status_code not in (200, 201):
            raise HTTPException(400, f"Netlify deploy failed: {deploy_resp.text[:300]}")

        deploy_data = deploy_resp.json()
        deploy_id = deploy_data.get("id")

        # Upload the file
        required = deploy_data.get("required", [])
        if file_hash in required:
            upload_resp = await client.put(
                f"{NETLIFY_API}/deploys/{deploy_id}/files/{edge_path}",
                headers={**_headers(api_token), "Content-Type": "application/javascript"},
                content=script_content.encode('utf-8'),
                timeout=30.0,
            )
            if upload_resp.status_code not in (200, 201):
                raise HTTPException(400, f"Netlify file upload failed: {upload_resp.text[:300]}")

        return deploy_data


async def set_env_vars(api_token: str, site_id: str, secrets: dict) -> None:
    """Set environment variables on a Netlify site."""
    url = f"{NETLIFY_API}/accounts/me/env"
    params = {"site_id": site_id}

    async with httpx.AsyncClient() as client:
        for name, value in secrets.items():
            if value is not None:
                resp = await client.post(
                    url, headers=_headers(api_token), params=params,
                    json=[{"key": name, "values": [{"value": value, "context": "all"}]}],
                    timeout=10.0,
                )
                if resp.status_code not in (200, 201):
                    print(f"[Netlify] Warning: Failed to set env var {name}: {resp.status_code}")


async def delete_site(api_token: str, site_id: str) -> None:
    """Delete a Netlify site."""
    url = f"{NETLIFY_API}/sites/{site_id}"
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=_headers(api_token), timeout=15.0)
    if resp.status_code not in (200, 204):
        raise HTTPException(400, f"Netlify site delete failed: {resp.text[:300]}")


def get_site_url(site_data: dict) -> str:
    """Extract the site URL from Netlify site data."""
    return f"https://{site_data.get('subdomain', '')}.netlify.app"
