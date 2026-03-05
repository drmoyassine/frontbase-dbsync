"""
Cloudflare Inspector Router.

Endpoints for inspecting deployed Cloudflare Workers:
    POST /api/cloudflare/inspect/content  — Fetch worker script source
    POST /api/cloudflare/inspect/settings — Fetch worker settings/bindings
    POST /api/cloudflare/inspect/secrets  — List secret names

Split from routers/cloudflare.py for single-concern compliance.
"""

import asyncio
import json

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from ..database.config import get_db
from ..schemas.cloudflare import InspectRequest
from ..services.cloudflare_api import CF_API, headers, get_provider_credentials, detect_account_id

router = APIRouter(prefix="/api/cloudflare", tags=["Cloudflare Inspector"])


# =============================================================================
# Sync Helpers (run in executor to avoid Windows ProactorEventLoop issues)
# =============================================================================

def _inspect_content_sync(api_token: str, account_id: str, worker_name: str) -> dict:
    """Sync helper: fetch worker script source via CF API v4."""
    import requests as req
    hdrs = headers(api_token)

    # Use /content/v2 which supports API Token auth
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/content/v2"
    resp = req.get(url, headers=hdrs, timeout=30.0)

    if resp.status_code == 404:
        return {"error": f"Worker '{worker_name}' not found", "status": 404}
    if resp.status_code != 200:
        # Fallback: try the download endpoint
        url2 = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}"
        resp = req.get(url2, headers=hdrs, timeout=30.0)
        if resp.status_code != 200:
            return {"error": f"CF API error ({resp.status_code}): {resp.text[:300]}", "status": resp.status_code}

    content = resp.text
    # Determine filename from content-disposition or fallback
    cd = resp.headers.get("content-disposition", "")
    filename = "worker.js"
    if "filename=" in cd:
        filename = cd.split("filename=")[-1].strip('"').strip("'")

    return {
        "success": True,
        "content": content,
        "filename": filename,
        "size_bytes": len(content.encode("utf-8")),
    }


def _inspect_settings_sync(api_token: str, account_id: str, worker_name: str) -> dict:
    """Sync helper: fetch worker settings, bindings, routes, crons."""
    import requests as req
    hdrs = headers(api_token)

    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/settings"
    resp = req.get(url, headers=hdrs, timeout=15.0)

    if resp.status_code == 404:
        return {"error": f"Worker '{worker_name}' not found", "status": 404}
    if resp.status_code != 200:
        return {"error": f"CF API error ({resp.status_code}): {resp.text[:300]}", "status": resp.status_code}

    data = resp.json()
    result = data.get("result", {})

    # Extract bindings (KV, D1, R2, DO — exclude secrets)
    bindings = result.get("bindings", [])
    non_secret_bindings = [b for b in bindings if b.get("type") != "secret_text"]
    secret_names = [b["name"] for b in bindings if b.get("type") == "secret_text"]

    # Fetch cron triggers
    crons = []
    try:
        cron_resp = req.get(
            f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/schedules",
            headers=hdrs, timeout=10.0,
        )
        if cron_resp.status_code == 200:
            crons = cron_resp.json().get("result", {}).get("schedules", [])
    except Exception:
        pass

    # Fetch subdomain info for routes
    routes = []
    try:
        sub_resp = req.get(
            f"{CF_API}/accounts/{account_id}/workers/subdomain",
            headers=hdrs, timeout=10.0,
        )
        if sub_resp.status_code == 200:
            subdomain_name = sub_resp.json().get("result", {}).get("subdomain", "")
            if subdomain_name:
                routes.append({
                    "type": "workers.dev",
                    "pattern": f"{worker_name}.{subdomain_name}.workers.dev",
                })
    except Exception:
        pass

    return {
        "success": True,
        "settings": {
            "compatibility_date": result.get("compatibility_date", "unknown"),
            "compatibility_flags": result.get("compatibility_flags", []),
            "usage_model": result.get("usage_model", "standard"),
            "bindings": non_secret_bindings,
            "routes": routes,
            "cron_triggers": crons,
            "placement": result.get("placement", {}),
            "tail_consumers": result.get("tail_consumers", []),
        },
        "secrets": secret_names,
    }


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/inspect/content")
async def inspect_worker_content(payload: InspectRequest, db: Session = Depends(get_db)):
    """Fetch the deployed worker's script source code."""
    try:
        api_token, account_id = get_provider_credentials(payload.provider_id, db)
        if not account_id:
            account_id = await detect_account_id(api_token)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, _inspect_content_sync, api_token, account_id, payload.worker_name
        )

        if "error" in result:
            raise HTTPException(result.get("status", 500), result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/inspect/settings")
async def inspect_worker_settings(payload: InspectRequest, db: Session = Depends(get_db)):
    """Fetch a worker's settings: bindings, compatibility, routes, crons."""
    try:
        api_token, account_id = get_provider_credentials(payload.provider_id, db)
        if not account_id:
            account_id = await detect_account_id(api_token)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, _inspect_settings_sync, api_token, account_id, payload.worker_name
        )

        if "error" in result:
            raise HTTPException(result.get("status", 500), result["error"])

        # Return settings only (secrets are served by /inspect/secrets)
        return {"success": True, "settings": result["settings"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/inspect/secrets")
async def inspect_worker_secrets(payload: InspectRequest, db: Session = Depends(get_db)):
    """List secret names deployed to a worker (values are never returned by CF)."""
    try:
        api_token, account_id = get_provider_credentials(payload.provider_id, db)
        if not account_id:
            account_id = await detect_account_id(api_token)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, _inspect_settings_sync, api_token, account_id, payload.worker_name
        )

        if "error" in result:
            raise HTTPException(result.get("status", 500), result["error"])
        return {"success": True, "secrets": result.get("secrets", [])}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
