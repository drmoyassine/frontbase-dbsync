"""
Cloudflare API v4 Helpers.

Pure HTTP functions for interacting with the Cloudflare Workers API.
No FastAPI dependencies (no Depends), no DB sessions.
Extracted from routers/cloudflare.py for single-concern compliance.
"""

import json
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeProviderAccount


CF_API = "https://api.cloudflare.com/client/v4"


def headers(api_token: str) -> dict:
    """Build Authorization header for CF API."""
    return {"Authorization": f"Bearer {api_token}"}


def get_provider_credentials(provider_id: str, db: Session) -> tuple[str, str | None]:
    """Retrieve Cloudflare credentials from the EdgeProviderAccount.
    
    Returns (api_token, account_id). account_id may be None if not yet detected.
    """
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == provider_id,
        EdgeProviderAccount.provider == "cloudflare"
    ).first()
    if not provider:
        raise HTTPException(404, "Cloudflare provider account not found")
        
    from ..core.security import decrypt_credentials
    creds = decrypt_credentials(str(provider.provider_credentials or "{}"))
    if "api_token" not in creds:
        raise HTTPException(400, "Provider account missing api_token")
        
    return creds["api_token"], creds.get("account_id")


def list_workers(api_token: str, account_id: str) -> list:
    """List all Workers scripts for an account (uses requests for Windows compat)."""
    import requests as req
    hdrs = headers(api_token)
    
    resp = req.get(
        f"{CF_API}/accounts/{account_id}/workers/scripts",
        headers=hdrs,
        timeout=15.0,
    )
    if resp.status_code != 200:
        return []  # Non-fatal — just return empty list
    data = resp.json()
    scripts = data.get("result", [])

    # Get the subdomain for URL construction
    subdomain_resp = req.get(
        f"{CF_API}/accounts/{account_id}/workers/subdomain",
        headers=hdrs,
        timeout=10.0,
    )
    subdomain = "workers.dev"
    if subdomain_resp.status_code == 200:
        sub_data = subdomain_resp.json()
        subdomain_name = sub_data.get("result", {}).get("subdomain", "")
        if subdomain_name:
            subdomain = f"{subdomain_name}.workers.dev"

    workers = []
    for s in scripts:
        name = s.get("id", "")
        workers.append({
            "name": name,
            "url": f"https://{name}.{subdomain}",
            "modified_on": s.get("modified_on", ""),
            "created_on": s.get("created_on", ""),
        })
    return workers


async def detect_account_id(api_token: str) -> str:
    """Auto-detect the first Cloudflare account ID from the API token."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{CF_API}/accounts",
            headers=headers(api_token),
            params={"per_page": 1},
            timeout=10.0,
        )
        if resp.status_code != 200:
            raise HTTPException(400, f"Failed to list accounts: {resp.text[:300]}")
        data = resp.json()
        accounts = data.get("result", [])
        if not accounts:
            raise HTTPException(400, "No Cloudflare accounts found for this API token")
        return accounts[0]["id"]


async def upload_worker(
    api_token: str, account_id: str, worker_name: str,
    script_content: str, script_filename: str = "cloudflare-lite.js",
    bindings: list[dict] | None = None,
) -> dict:
    """Upload a Worker script via Cloudflare API v4 (ES module format)."""
    import re
    # CF requires lowercase, alphanumeric, dashes only
    worker_name = re.sub(r'[^a-z0-9-]', '-', worker_name.lower()).strip('-')
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}"

    metadata: dict = {
        "main_module": script_filename,
        "compatibility_date": "2024-12-01",
        "compatibility_flags": ["nodejs_compat"],
    }
    # Inject bindings (e.g., AI binding for GPU models)
    if bindings:
        metadata["bindings"] = bindings

    files = {
        "metadata": (None, json.dumps(metadata), "application/json"),
        script_filename: (script_filename, script_content, "application/javascript+module"),
    }

    async with httpx.AsyncClient() as client:
        resp = await client.put(
            url,
            headers=headers(api_token),
            files=files,
            timeout=30.0,
        )
        if resp.status_code not in (200, 201):
            # Parse CF error into a friendly message
            try:
                err_data = resp.json()
                errors = err_data.get("errors", [])
                if errors:
                    msg = errors[0].get("message", resp.text[:300])
                else:
                    msg = resp.text[:300]
            except Exception:
                msg = resp.text[:300]
            raise HTTPException(
                400,
                f"Cloudflare rejected the worker '{worker_name}': {msg}"
            )
        return resp.json()


async def enable_workers_dev(api_token: str, account_id: str, worker_name: str) -> str:
    """Enable the workers.dev subdomain for the worker. Returns the worker URL."""
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/subdomain"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers={**headers(api_token), "Content-Type": "application/json"},
            json={"enabled": True},
            timeout=10.0,
        )
        subdomain_resp = await client.get(
            f"{CF_API}/accounts/{account_id}/workers/subdomain",
            headers=headers(api_token),
            timeout=10.0,
        )
        subdomain = "workers.dev"
        if subdomain_resp.status_code == 200:
            sub_data = subdomain_resp.json()
            subdomain_name = sub_data.get("result", {}).get("subdomain", "")
            if subdomain_name:
                subdomain = f"{subdomain_name}.workers.dev"

        return f"https://{worker_name}.{subdomain}"


async def set_secrets(api_token: str, account_id: str, worker_name: str, secrets: dict) -> None:
    """Set Worker secrets (environment variables that are encrypted)."""
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/secrets"

    async with httpx.AsyncClient() as client:
        for name, value in secrets.items():
            if value is not None:
                try:
                    resp = await client.put(
                        url,
                        headers={**headers(api_token), "Content-Type": "application/json"},
                        json={"name": name, "text": value, "type": "secret_text"},
                        timeout=30.0,
                    )
                    if resp.status_code not in (200, 201):
                        print(f"[Cloudflare] Warning: Failed to set secret {name}: {resp.status_code}")
                except httpx.TimeoutException:
                    raise HTTPException(
                        status_code=504,
                        detail=f"Cloudflare API timed out while setting secret '{name}'. "
                               f"The Worker was uploaded but secrets may be incomplete. Try again."
                    )
                except httpx.HTTPError as e:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Cloudflare API error while setting secret '{name}': {e}"
                    )


async def delete_worker(api_token: str, account_id: str, worker_name: str) -> None:
    """Delete a Cloudflare Worker script."""
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}"
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            url,
            headers=headers(api_token),
            timeout=15.0,
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(400, f"Worker delete failed: {resp.text[:300]}")
