"""
Supabase Edge Functions — Deploy API.

Platform-specific deploy orchestrator + Supabase Management API helpers.
Credentials: { "access_token": "sbp_...", "project_ref": "..." }
"""

import json
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine
from ..services.secrets_builder import build_engine_secrets


SUPABASE_API = "https://api.supabase.com/v1"


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}


async def deploy(engine: EdgeEngine, db: Session, script_content: str, adapter_type: str) -> None:
    """Deploy bundle to Supabase Edge Functions."""
    from ..core.credential_resolver import get_provider_context_by_id

    ctx = get_provider_context_by_id(db, str(engine.edge_provider_id))
    access_token = ctx.get('access_token')
    project_ref = ctx.get('project_ref')
    cfg = json.loads(str(engine.engine_config or '{}'))
    function_name = cfg.get('function_name')

    if not access_token or not project_ref or not function_name:
        raise HTTPException(400, "Missing Supabase credentials (access_token, project_ref) or function_name in engine config")

    script_filename = "supabase-edge.js" if adapter_type == "full" else "supabase-edge-lite.js"

    # Deploy function (create or update)
    await deploy_function(access_token, project_ref, function_name, script_content)

    # Push secrets
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        engine_id=str(engine.id),
    )
    if secrets:
        await set_function_secrets(access_token, project_ref, function_name, secrets)


# ── Platform-specific API calls ───────────────────────────────────────

async def deploy_function(
    access_token: str, project_ref: str, function_name: str, script_content: str
) -> dict:
    """Create or update a Supabase Edge Function."""
    url = f"{SUPABASE_API}/projects/{project_ref}/functions/{function_name}"

    async with httpx.AsyncClient() as client:
        # Try update first (PATCH), fall back to create (POST)
        resp = await client.patch(
            url,
            headers=_headers(access_token),
            json={"body": script_content, "verify_jwt": False},
            timeout=30.0,
        )
        if resp.status_code == 404:
            # Function doesn't exist — create it
            create_url = f"{SUPABASE_API}/projects/{project_ref}/functions"
            resp = await client.post(
                create_url,
                headers=_headers(access_token),
                json={"slug": function_name, "name": function_name, "body": script_content, "verify_jwt": False},
                timeout=30.0,
            )

        if resp.status_code not in (200, 201):
            raise HTTPException(400, f"Supabase deploy failed: {resp.text[:300]}")
        return resp.json()


async def set_function_secrets(
    access_token: str, project_ref: str, function_name: str, secrets: dict
) -> None:
    """Set environment variables for a Supabase Edge Function."""
    url = f"{SUPABASE_API}/projects/{project_ref}/functions/{function_name}"
    async with httpx.AsyncClient() as client:
        # Supabase uses env vars on the function config
        resp = await client.patch(
            url,
            headers=_headers(access_token),
            json={"env_vars": secrets},
            timeout=30.0,
        )
        if resp.status_code not in (200, 201):
            print(f"[Supabase] Warning: Failed to set env vars: {resp.status_code}")


async def delete_function(access_token: str, project_ref: str, function_name: str) -> None:
    """Delete a Supabase Edge Function."""
    url = f"{SUPABASE_API}/projects/{project_ref}/functions/{function_name}"
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=_headers(access_token), timeout=15.0)
    if resp.status_code not in (200, 204):
        raise HTTPException(400, f"Supabase function delete failed: {resp.text[:300]}")


def get_function_url(project_ref: str, function_name: str) -> str:
    """Build the public URL for a Supabase Edge Function."""
    return f"https://{project_ref}.supabase.co/functions/v1/{function_name}"
