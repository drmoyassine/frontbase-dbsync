"""
Vercel Edge Functions — Deploy API.

Uses the Vercel Deployments API v13 to deploy Edge Functions.
Credentials: { "api_token": "...", "team_id": "..." (optional) }
"""

import json
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine
from ..services.secrets_builder import build_engine_secrets


VERCEL_API = "https://api.vercel.com"


def _headers(api_token: str) -> dict:
    return {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}


async def deploy(engine: EdgeEngine, db: Session, script_content: str, adapter_type: str) -> None:
    """Deploy bundle to Vercel Edge Functions.

    Flow: push secrets first → deploy → function sees env vars from first request.
    """
    from ..core.credential_resolver import get_provider_context_by_id

    ctx = get_provider_context_by_id(db, str(engine.edge_provider_id))
    api_token = ctx.get('api_token')
    team_id = ctx.get('team_id')
    cfg = json.loads(str(engine.engine_config or '{}'))
    project_name = cfg.get('project_name', 'frontbase-edge')

    if not api_token:
        raise HTTPException(400, "Missing Vercel api_token")

    script_filename = "vercel-edge.js" if adapter_type == "full" else "vercel-edge-lite.js"

    # Build secrets from DB/cache/queue bindings
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        engine_id=str(engine.id),
    )

    # Try pushing secrets BEFORE deployment so edge function sees them immediately.
    # On first deploy the project may not exist yet (Vercel auto-creates on deploy),
    # in which case we push secrets AFTER deployment.
    secrets_pushed = False
    if secrets:
        secrets_pushed = await set_env_vars(api_token, project_name, secrets, team_id)

    # Deploy the bundle
    deployment = await create_deployment(api_token, project_name, script_content, script_filename, team_id)

    # If secrets weren't pushed (first deploy), push now and note that a redeploy
    # may be needed for the function to pick them up
    if secrets and not secrets_pushed:
        print("[Vercel] First deploy: pushing secrets after project creation")
        await set_env_vars(api_token, project_name, secrets, team_id)



# ── Platform-specific API calls ───────────────────────────────────────

async def create_deployment(
    api_token: str, project_name: str, script_content: str,
    filename: str, team_id: str | None = None
) -> dict:
    """Create a new Vercel deployment with the edge function."""
    url = f"{VERCEL_API}/v13/deployments"
    params = {"teamId": team_id} if team_id else {}

    # vercel.json tells Vercel to route all traffic to our edge function
    # and skip framework auto-detection
    vercel_config = json.dumps({
        "version": 2,
        "routes": [{"src": "/(.*)", "dest": f"/api/{filename}"}],
    })

    # package.json tells Vercel to treat files as ESM (prevents ESM→CJS conversion
    # which breaks export const config = { runtime: 'edge' } detection)
    pkg_json = json.dumps({"type": "module", "private": True})

    payload = {
        "name": project_name,
        "files": [
            {"file": f"api/{filename}", "data": script_content},
            {"file": "vercel.json", "data": vercel_config},
            {"file": "package.json", "data": pkg_json},
        ],
        "projectSettings": {"framework": None},
        "target": "production",
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


async def delete_project(api_token: str, project_name: str, team_id: str | None = None) -> None:
    """Delete a Vercel project by name (removes all deployments).

    Uses DELETE /v9/projects/{idOrName}.
    """
    url = f"{VERCEL_API}/v9/projects/{project_name}"
    params = {"teamId": team_id} if team_id else {}
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=_headers(api_token), params=params, timeout=15.0)
    if resp.status_code not in (200, 204):
        raise HTTPException(400, f"Vercel project delete failed: {resp.text[:300]}")


async def set_env_vars(
    api_token: str, project_name: str, secrets: dict, team_id: str | None = None
) -> bool:
    """Upsert environment variables on a Vercel project.

    Checks for existing env vars first; updates them if found, creates if not.
    Returns True if successful, False if project doesn't exist yet.
    """
    base_url = f"{VERCEL_API}/v10/projects/{project_name}/env"
    params = {"teamId": team_id} if team_id else {}

    async with httpx.AsyncClient() as client:
        # Fetch existing env vars to find IDs for upsert
        existing_resp = await client.get(
            base_url, headers=_headers(api_token), params=params, timeout=10.0,
        )
        if existing_resp.status_code == 404:
            print(f"[Vercel] Project '{project_name}' not found — will push secrets after deploy")
            return False
        existing_map: dict[str, str] = {}  # key → env_var_id
        if existing_resp.status_code == 200:
            for env in existing_resp.json().get('envs', []):
                existing_map[env['key']] = env['id']


        for name, value in secrets.items():
            if value is None:
                continue
            if name in existing_map:
                # Update existing env var via PATCH
                env_id = existing_map[name]
                resp = await client.patch(
                    f"{base_url}/{env_id}",
                    headers=_headers(api_token), params=params,
                    json={"value": value, "type": "encrypted", "target": ["production"]},
                    timeout=10.0,
                )
                if resp.status_code in (200, 201):
                    print(f"[Vercel] Updated env var: {name}")
                else:
                    print(f"[Vercel] Warning: Failed to update {name}: {resp.status_code} {resp.text[:200]}")
            else:
                # Create new env var via POST
                resp = await client.post(
                    base_url, headers=_headers(api_token), params=params,
                    json={"key": name, "value": value, "type": "encrypted", "target": ["production"]},
                    timeout=10.0,
                )
                if resp.status_code in (200, 201):
                    print(f"[Vercel] Created env var: {name}")
                else:
                    print(f"[Vercel] Warning: Failed to create {name}: {resp.status_code} {resp.text[:200]}")

    return True


def get_deployment_url(deployment: dict) -> str:
    """Extract the deployment URL from a Vercel deployment response."""
    return f"https://{deployment.get('url', '')}"


# ── Listing & Inspection Helpers ──────────────────────────────────────

async def list_projects(api_token: str, team_id: str | None = None, limit: int = 50) -> list[dict]:
    """List Vercel projects via GET /v10/projects.

    Response shape: {projects: [{name, id, framework, createdAt, updatedAt, ...}]}
    Timestamps are epoch milliseconds.
    """
    params: dict = {"limit": limit}
    if team_id:
        params["teamId"] = team_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{VERCEL_API}/v10/projects",
            headers=_headers(api_token),
            params=params,
        )
    if resp.status_code != 200:
        return []
    return resp.json().get("projects", [])


async def get_project(api_token: str, project_name: str, team_id: str | None = None) -> dict:
    """Get Vercel project details via GET /v9/projects/{nameOrId}.

    Response includes: framework, nodeVersion, buildCommand, installCommand,
    outputDirectory, rootDirectory, serverlessFunctionRegion, targets, etc.
    """
    params: dict = {}
    if team_id:
        params["teamId"] = team_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{VERCEL_API}/v9/projects/{project_name}",
            headers=_headers(api_token),
            params=params,
        )
    if resp.status_code != 200:
        return {"error": f"Project not found ({resp.status_code}): {resp.text[:300]}"}
    return resp.json()


async def list_env_vars(api_token: str, project_name: str, team_id: str | None = None) -> list[dict]:
    """List environment variables via GET /v10/projects/{name}/env.

    Response shape: {envs: [{key, type, target, id, createdAt, updatedAt, ...}]}
    Type is 'encrypted', 'plain', 'sensitive', or 'system'.
    """
    params: dict = {}
    if team_id:
        params["teamId"] = team_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{VERCEL_API}/v10/projects/{project_name}/env",
            headers=_headers(api_token),
            params=params,
        )
    if resp.status_code != 200:
        return []
    return resp.json().get("envs", [])


async def list_deployments(
    api_token: str, project_id: str, team_id: str | None = None, limit: int = 10,
) -> list[dict]:
    """List deployments via GET /v6/deployments.

    Response shape: {deployments: [{uid, url, state, created, ready, name, source, ...}]}
    Timestamps are epoch milliseconds.
    """
    params: dict = {"projectId": project_id, "limit": limit}
    if team_id:
        params["teamId"] = team_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{VERCEL_API}/v6/deployments",
            headers=_headers(api_token),
            params=params,
        )
    if resp.status_code != 200:
        return []
    return resp.json().get("deployments", [])


async def list_deployment_files(
    api_token: str, deployment_id: str, team_id: str | None = None,
) -> list[dict]:
    """List files in a deployment via GET /v6/deployments/{id}/files.

    Response is a tree: [{name, type: "directory"|"file", uid, children: [...]}]
    """
    params: dict = {}
    if team_id:
        params["teamId"] = team_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{VERCEL_API}/v6/deployments/{deployment_id}/files",
            headers=_headers(api_token),
            params=params,
        )
    if resp.status_code != 200:
        return []
    data = resp.json()
    return data if isinstance(data, list) else []


async def get_deployment_file(
    api_token: str, deployment_id: str, file_id: str, team_id: str | None = None,
) -> str:
    """Get a single file's content via GET /v7/deployments/{id}/files/{fileId}.

    Returns the file content as text.
    """
    params: dict = {}
    if team_id:
        params["teamId"] = team_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{VERCEL_API}/v7/deployments/{deployment_id}/files/{file_id}",
            headers=_headers(api_token),
            params=params,
        )
    if resp.status_code != 200:
        return f"// Error fetching file ({resp.status_code})"
    return resp.text


async def get_deployment_events(
    api_token: str, deployment_id: str, team_id: str | None = None,
) -> list[dict]:
    """Get deployment events (build/runtime logs) via GET /v3/deployments/{id}/events.

    Response: [{type: "stdout"|"stderr", created (epoch ms), text, id, ...}]
    """
    params: dict = {}
    if team_id:
        params["teamId"] = team_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{VERCEL_API}/v3/deployments/{deployment_id}/events",
            headers=_headers(api_token),
            params=params,
        )
    if resp.status_code != 200:
        return []
    data = resp.json()
    return data if isinstance(data, list) else []
