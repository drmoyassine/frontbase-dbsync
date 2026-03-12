"""
Supabase Edge Functions — Deploy API.

Platform-specific deploy orchestrator + Supabase Management API helpers.
Credentials: { "access_token": "sbp_...", "project_ref": "..." }

Uses the new Deploy endpoint (Feb 2025):
  POST /v1/projects/{ref}/functions/deploy?slug={name}
  Content-Type: multipart/form-data
  Body: file (JS bundle) + metadata (JSON)

Secrets are project-level (shared across all functions):
  POST /v1/projects/{ref}/secrets
  Body: [{"name": "KEY", "value": "val"}, ...]
"""

import json
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine
from ..services.secrets_builder import build_engine_secrets


SUPABASE_API = "https://api.supabase.com/v1"


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


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

    # Deploy function (create or update via new deploy endpoint)
    await deploy_function(str(access_token), str(project_ref), str(function_name), script_content)

    # Push project-level secrets
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        engine_id=str(engine.id),
    )
    if secrets:
        await set_project_secrets(str(access_token), str(project_ref), secrets)


# ── Platform-specific API calls ───────────────────────────────────────

async def deploy_function(
    access_token: str, project_ref: str, function_name: str, script_content: str
) -> dict:
    """Deploy a Supabase Edge Function using the new /functions/deploy endpoint.

    This endpoint auto-creates the function if it doesn't exist, or updates
    it if it does. Uses multipart/form-data with the JS bundle as a file.
    """
    url = f"{SUPABASE_API}/projects/{project_ref}/functions/deploy"

    # Metadata instructs Supabase on entrypoint and JWT verification
    metadata = json.dumps({
        "entrypoint_path": "index.ts",
        "verify_jwt": False,
    })

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            params={"slug": function_name},
            headers=_headers(access_token),
            files=[
                ("file", ("index.ts", script_content.encode("utf-8"), "application/typescript")),
            ],
            data={"metadata": metadata},
            timeout=60.0,
        )

        if resp.status_code not in (200, 201):
            raise HTTPException(400, f"Supabase deploy failed ({resp.status_code}): {resp.text[:300]}")
        return resp.json()


async def set_project_secrets(
    access_token: str, project_ref: str, secrets: dict
) -> None:
    """Set project-level secrets (shared across all Edge Functions).

    Supabase Edge Functions don't have per-function env vars.
    All secrets are set at the project level via POST /v1/projects/{ref}/secrets.
    """
    url = f"{SUPABASE_API}/projects/{project_ref}/secrets"
    payload = [{"name": k, "value": str(v)} for k, v in secrets.items()]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers={**_headers(access_token), "Content-Type": "application/json"},
            json=payload,
            timeout=30.0,
        )
        if resp.status_code not in (200, 201):
            print(f"[Supabase] Warning: Failed to set project secrets: {resp.status_code} {resp.text[:200]}")


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
