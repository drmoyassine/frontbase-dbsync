"""
Supabase Management API helpers.

Wraps https://api.supabase.com/v1 for resource discovery.
All functions take a PAT (Personal Access Token) — the only credential needed.
"""

import httpx
from typing import Optional

SUPABASE_API = "https://api.supabase.com/v1"


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def list_projects(token: str) -> list[dict]:
    """GET /v1/projects → [{id, name, ref, status, region, ...}]"""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{SUPABASE_API}/projects", headers=_headers(token))
    if resp.status_code == 401:
        raise PermissionError("Invalid Supabase access token")
    resp.raise_for_status()
    return resp.json()


async def get_api_keys(token: str, project_ref: str) -> dict:
    """GET /v1/projects/{ref}/api-keys → [{name, api_key}, ...]

    Returns dict with anon_key and service_role_key extracted.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{SUPABASE_API}/projects/{project_ref}/api-keys",
            headers=_headers(token),
        )
    resp.raise_for_status()
    keys = resp.json()
    result = {"api_url": f"https://{project_ref}.supabase.co"}
    for key_obj in keys:
        name = key_obj.get("name", "").lower()
        if "anon" in name:
            result["anon_key"] = key_obj["api_key"]
        elif "service" in name:
            result["service_role_key"] = key_obj["api_key"]
    return result


async def list_functions(token: str, project_ref: str) -> list[dict]:
    """GET /v1/projects/{ref}/functions → [{id, slug, name, status, ...}]"""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{SUPABASE_API}/projects/{project_ref}/functions",
            headers=_headers(token),
        )
    resp.raise_for_status()
    return resp.json()


async def validate_token(token: str) -> dict:
    """Validate a PAT by listing projects. Returns first project summary or raises."""
    projects = await list_projects(token)
    return {
        "valid": True,
        "project_count": len(projects),
        "projects": [
            {
                "ref": p.get("id", ""),
                "name": p.get("name", ""),
                "region": p.get("region", ""),
                "status": p.get("status", ""),
            }
            for p in projects
        ],
    }
