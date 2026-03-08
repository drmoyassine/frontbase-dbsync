"""
Deno Deploy — Deploy API (v2).

Uses the Deno Deploy v2 API to deploy functions.
Credentials: { "access_token": "ddo_..." (org token) }
The project_name (app slug) is stored separately in provider credentials.
"""

import json
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine, EdgeProviderAccount
from ..services.secrets_builder import build_engine_secrets


DENO_DEPLOY_API = "https://api.deno.com/v2"


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}


async def deploy(engine: EdgeEngine, db: Session, script_content: str, adapter_type: str) -> None:
    """Deploy bundle to Deno Deploy."""
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == engine.edge_provider_id
    ).first()

    creds = json.loads(str(provider.provider_credentials or '{}'))  # type: ignore[union-attr]
    access_token = creds.get('access_token')

    # project_name (app slug) is stored in engine_config, not provider credentials
    engine_cfg = json.loads(str(engine.engine_config or '{}'))
    project_name = engine_cfg.get('project_name')

    if not access_token or not project_name:
        raise HTTPException(400, "Missing Deno Deploy credentials (access_token) or project_name in engine config")

    script_filename = "deno-deploy.js" if adapter_type == "full" else "deno-deploy-lite.js"

    # Build environment variables
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        engine_id=str(engine.id),
    )

    # Deploy function (v2 includes env_vars in the deploy call)
    await deploy_function(access_token, project_name, script_content, script_filename, secrets)


# ── Platform-specific API calls ───────────────────────────────────────

async def deploy_function(
    access_token: str, project_name: str, script_content: str, filename: str,
    env_vars: dict | None = None,
) -> dict:
    """Deploy a function to Deno Deploy via the v2 API."""
    url = f"{DENO_DEPLOY_API}/apps/{project_name}/deploy"

    payload: dict = {
        "assets": {
            filename: {
                "kind": "file",
                "content": script_content,
                "encoding": "utf-8",
            }
        },
        "config": {
            "runtime": {
                "type": "dynamic",
                "entrypoint": filename,
            }
        },
    }

    # Include env vars in the deploy if provided
    if env_vars:
        payload["env_vars"] = [
            {"key": k, "value": v} for k, v in env_vars.items()
        ]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url, headers=_headers(access_token), json=payload, timeout=60.0,
        )
        if resp.status_code not in (200, 201, 202):
            raise HTTPException(400, f"Deno Deploy failed: {resp.text[:300]}")
        return resp.json()


async def set_env_vars(access_token: str, project_name: str, secrets: dict) -> None:
    """Set environment variables on a Deno Deploy app via v2 API."""
    url = f"{DENO_DEPLOY_API}/apps/{project_name}"

    payload = {
        "env_vars": [
            {"key": k, "value": v} for k, v in secrets.items()
        ]
    }

    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            url, headers=_headers(access_token), json=payload, timeout=15.0,
        )
        if resp.status_code not in (200, 204):
            print(f"[Deno Deploy] Warning: Failed to set env vars: {resp.status_code}")


async def delete_project(access_token: str, project_name: str) -> None:
    """Delete a Deno Deploy app."""
    url = f"{DENO_DEPLOY_API}/apps/{project_name}"
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=_headers(access_token), timeout=15.0)
    if resp.status_code not in (200, 204):
        raise HTTPException(400, f"Deno Deploy app delete failed: {resp.text[:300]}")


def get_project_url(project_name: str) -> str:
    """Build the public URL for a Deno Deploy app."""
    return f"https://{project_name}.deno.dev"

