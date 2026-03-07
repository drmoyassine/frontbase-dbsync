"""
Deno Deploy — Deploy API.

Uses the Deno Deploy API to deploy functions.
Credentials: { "access_token": "ddp_...", "project_name": "..." }
"""

import json
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine, EdgeProviderAccount
from ..services.secrets_builder import build_engine_secrets


DENO_DEPLOY_API = "https://api.deno.com/v1"


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}


async def deploy(engine: EdgeEngine, db: Session, script_content: str, adapter_type: str) -> None:
    """Deploy bundle to Deno Deploy."""
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == engine.edge_provider_id
    ).first()

    creds = json.loads(str(provider.provider_credentials or '{}'))  # type: ignore[union-attr]
    access_token = creds.get('access_token')
    project_name = creds.get('project_name')

    if not access_token or not project_name:
        raise HTTPException(400, "Missing Deno Deploy credentials (access_token, project_name)")

    script_filename = "deno-deploy.js" if adapter_type == "full" else "deno-deploy-lite.js"

    # Deploy function
    await deploy_function(access_token, project_name, script_content, script_filename)

    # Push environment variables
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        engine_id=str(engine.id),
    )
    if secrets:
        await set_env_vars(access_token, project_name, secrets)


# ── Platform-specific API calls ───────────────────────────────────────

async def deploy_function(
    access_token: str, project_name: str, script_content: str, filename: str
) -> dict:
    """Deploy a function to Deno Deploy via the API."""
    url = f"{DENO_DEPLOY_API}/projects/{project_name}/deployments"

    payload = {
        "entryPointUrl": f"file:///{filename}",
        "assets": {
            filename: {
                "kind": "file",
                "content": script_content,
                "encoding": "utf-8",
            }
        },
        "envVars": {},
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url, headers=_headers(access_token), json=payload, timeout=60.0,
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(400, f"Deno Deploy failed: {resp.text[:300]}")
        return resp.json()


async def set_env_vars(access_token: str, project_name: str, secrets: dict) -> None:
    """Set environment variables on a Deno Deploy project."""
    url = f"{DENO_DEPLOY_API}/projects/{project_name}/env"

    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            url, headers=_headers(access_token), json=secrets, timeout=15.0,
        )
        if resp.status_code not in (200, 204):
            print(f"[Deno Deploy] Warning: Failed to set env vars: {resp.status_code}")


async def delete_project(access_token: str, project_name: str) -> None:
    """Delete a Deno Deploy project."""
    url = f"{DENO_DEPLOY_API}/projects/{project_name}"
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=_headers(access_token), timeout=15.0)
    if resp.status_code not in (200, 204):
        raise HTTPException(400, f"Deno Deploy project delete failed: {resp.text[:300]}")


def get_project_url(project_name: str) -> str:
    """Build the public URL for a Deno Deploy project."""
    return f"https://{project_name}.deno.dev"
