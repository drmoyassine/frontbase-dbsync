"""
Vercel Edge Functions — Deploy API.

Uses the Vercel Deployments API v13 to deploy Edge Functions.
Credentials: { "api_token": "...", "team_id": "..." (optional) }
"""

import json
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine, EdgeProviderAccount
from ..services.secrets_builder import build_engine_secrets


VERCEL_API = "https://api.vercel.com"


def _headers(api_token: str) -> dict:
    return {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}


async def deploy(engine: EdgeEngine, db: Session, script_content: str, adapter_type: str) -> None:
    """Deploy bundle to Vercel Edge Functions."""
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == engine.edge_provider_id
    ).first()

    creds = json.loads(str(provider.provider_credentials or '{}'))  # type: ignore[union-attr]
    api_token = creds.get('api_token')
    team_id = creds.get('team_id')
    cfg = json.loads(str(engine.engine_config or '{}'))
    project_name = cfg.get('project_name', 'frontbase-edge')

    if not api_token:
        raise HTTPException(400, "Missing Vercel api_token")

    script_filename = "vercel-edge.js" if adapter_type == "full" else "vercel-edge-lite.js"

    # Create deployment
    deployment = await create_deployment(api_token, project_name, script_content, script_filename, team_id)

    # Push environment variables
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        engine_id=str(engine.id),
    )
    if secrets:
        await set_env_vars(api_token, project_name, secrets, team_id)


# ── Platform-specific API calls ───────────────────────────────────────

async def create_deployment(
    api_token: str, project_name: str, script_content: str,
    filename: str, team_id: str | None = None
) -> dict:
    """Create a new Vercel deployment with the edge function."""
    url = f"{VERCEL_API}/v13/deployments"
    params = {"teamId": team_id} if team_id else {}

    payload = {
        "name": project_name,
        "files": [{"file": f"api/{filename}", "data": script_content}],
        "projectSettings": {"framework": None},
        "functions": {f"api/{filename}": {"runtime": "@vercel/edge"}},
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url, headers=_headers(api_token), json=payload,
            params=params, timeout=60.0,
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(400, f"Vercel deployment failed: {resp.text[:300]}")
        return resp.json()


async def delete_deployment(api_token: str, deployment_id: str, team_id: str | None = None) -> None:
    """Delete a Vercel deployment."""
    url = f"{VERCEL_API}/v13/deployments/{deployment_id}"
    params = {"teamId": team_id} if team_id else {}
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=_headers(api_token), params=params, timeout=15.0)
    if resp.status_code not in (200, 204):
        raise HTTPException(400, f"Vercel delete failed: {resp.text[:300]}")


async def set_env_vars(
    api_token: str, project_name: str, secrets: dict, team_id: str | None = None
) -> None:
    """Set environment variables on a Vercel project."""
    url = f"{VERCEL_API}/v10/projects/{project_name}/env"
    params = {"teamId": team_id} if team_id else {}

    async with httpx.AsyncClient() as client:
        for name, value in secrets.items():
            if value is not None:
                resp = await client.post(
                    url, headers=_headers(api_token), params=params,
                    json={"key": name, "value": value, "type": "encrypted", "target": ["production"]},
                    timeout=10.0,
                )
                if resp.status_code not in (200, 201):
                    print(f"[Vercel] Warning: Failed to set env var {name}: {resp.status_code}")


def get_deployment_url(deployment: dict) -> str:
    """Extract the deployment URL from a Vercel deployment response."""
    return f"https://{deployment.get('url', '')}"
