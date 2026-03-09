"""
Engine Test & Remote Delete Helpers.

Connection testing, credential extraction, and remote delete operations.
Extracted from routers/edge_engines.py for single-concern compliance.
"""

import json
import time

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine, EdgeProviderAccount
from ..schemas.edge_engines import TestConnectionResult
from ..services import cloudflare_api


async def test_connection(url: str, provider: str) -> TestConnectionResult:
    """Test connectivity to an edge engine by hitting its /api/health endpoint."""
    health_url = f"{url.rstrip('/')}/api/health"

    try:
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(health_url)
        latency_ms = round((time.monotonic() - start) * 1000, 1)

        if response.is_success:
            return TestConnectionResult(
                success=True,
                message=f"{provider.title()} engine is reachable",
                latency_ms=latency_ms,
            )
        else:
            return TestConnectionResult(
                success=False,
                message=f"Engine returned HTTP {response.status_code}",
                latency_ms=latency_ms,
            )
    except httpx.ConnectError:
        return TestConnectionResult(
            success=False,
            message="Connection refused — is the engine running?",
        )
    except httpx.TimeoutException:
        return TestConnectionResult(
            success=False,
            message="Connection timed out after 5s",
        )
    except Exception as e:
        return TestConnectionResult(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


def extract_cf_creds(engine: EdgeEngine, db: Session = None) -> dict:
    """Extract Cloudflare credentials and worker name from an EdgeEngine (DB-only, no I/O)."""
    if not engine.edge_provider_id:
        raise HTTPException(400, "No Cloudflare API token stored on the associated provider account")

    from ..core.credential_resolver import get_provider_context_by_id
    ctx = get_provider_context_by_id(db, str(engine.edge_provider_id)) if db else {}
    if not db:
        # Fallback for callers without db session (legacy)
        from ..core.security import decrypt_credentials
        if not engine.edge_provider or not engine.edge_provider.provider_credentials:
            raise HTTPException(400, "No Cloudflare API token stored on the associated provider account")
        ctx = decrypt_credentials(str(engine.edge_provider.provider_credentials))

    api_token = ctx.get("api_token")
    account_id = ctx.get("account_id")

    if not api_token or not account_id:
        raise HTTPException(400, "Invalid Cloudflare provider credentials missing api_token or account_id")

    # Extract worker name from engine_config or URL
    worker_name = str(engine.name)  # Fallback
    if engine.engine_config:
        conf = json.loads(str(engine.engine_config))
        worker_name = conf.get("worker_name", worker_name)

    target_url = str(engine.url or "")
    if target_url and "workers.dev" in target_url:
        from urllib.parse import urlparse
        parsed = urlparse(target_url)
        parts = (parsed.hostname or "").split(".")
        if len(parts) >= 3:
            worker_name = parts[0]

    return {
        "api_token": api_token,
        "account_id": account_id,
        "worker_name": worker_name,
    }


async def delete_cloudflare_worker(engine: EdgeEngine) -> None:
    """Delete a Cloudflare Worker — convenience wrapper."""
    creds = extract_cf_creds(engine)
    await delete_cloudflare_worker_from_creds(creds)


async def delete_cloudflare_worker_from_creds(creds: dict) -> None:
    """Delete a Cloudflare Worker using pre-extracted credentials (pure HTTP, no DB)."""
    await cloudflare_api.delete_worker(
        creds["api_token"],
        creds["account_id"],
        creds["worker_name"],
    )


# =============================================================================
# Generic Remote Delete — dispatches by provider type
# =============================================================================

# Provider config key → the engine_config field containing the resource name
_PROVIDER_CONFIG_KEY = {
    "cloudflare": "worker_name",
    "supabase": "function_name",
    "vercel": "project_name",
    "netlify": "site_name",
    "deno": "project_name",
    "upstash": "resource_name",
}


async def delete_remote_resource(engine: EdgeEngine, db: Session) -> None:
    """Delete the remote resource for any supported provider.

    Reads the provider type from the linked EdgeProviderAccount and dispatches
    to the correct provider-specific delete API.
    """
    if not engine.edge_provider_id:
        raise HTTPException(400, "No provider account linked to this engine")

    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == engine.edge_provider_id
    ).first()
    if not provider:
        raise HTTPException(400, "Provider account not found")

    provider_type = str(provider.provider)
    from ..core.credential_resolver import get_provider_context_by_id
    ctx = get_provider_context_by_id(db, str(provider.id))
    cfg = json.loads(str(engine.engine_config or "{}"))

    if provider_type == "cloudflare":
        api_token = ctx.get("api_token")
        account_id = ctx.get("account_id")
        worker_name = cfg.get("worker_name", str(engine.name))
        if not api_token or not account_id:
            raise HTTPException(400, "Missing Cloudflare credentials (api_token, account_id)")
        await cloudflare_api.delete_worker(api_token, account_id, worker_name)

    elif provider_type == "supabase":
        from ..services import supabase_deploy_api
        access_token = ctx.get("access_token")
        project_ref = ctx.get("project_ref")
        function_name = cfg.get("function_name")
        if not all([access_token, project_ref, function_name]):
            raise HTTPException(400, "Missing Supabase credentials or function_name")
        await supabase_deploy_api.delete_function(access_token, project_ref, function_name)

    elif provider_type == "vercel":
        from ..services import vercel_deploy_api
        api_token = ctx.get("api_token")
        deployment_id = cfg.get("deployment_id")
        team_id = ctx.get("team_id")
        if not api_token:
            raise HTTPException(400, "Missing Vercel api_token")
        if deployment_id:
            await vercel_deploy_api.delete_deployment(api_token, deployment_id, team_id)
        else:
            print(f"[Delete] Vercel engine has no deployment_id in config — skipping remote delete")

    elif provider_type == "netlify":
        from ..services import netlify_deploy_api
        api_token = ctx.get("api_token")
        site_id = ctx.get("site_id")
        if not api_token or not site_id:
            raise HTTPException(400, "Missing Netlify credentials or site_id")
        await netlify_deploy_api.delete_site(api_token, site_id)

    elif provider_type == "deno":
        from ..services import deno_deploy_api
        access_token = ctx.get("access_token")
        project_name = cfg.get("project_name")
        if not access_token or not project_name:
            raise HTTPException(400, "Missing Deno Deploy credentials or project_name")
        await deno_deploy_api.delete_project(access_token, project_name)

    else:
        raise HTTPException(400, f"Remote delete not supported for provider: {provider_type}")

