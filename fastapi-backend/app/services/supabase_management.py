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


async def get_jwt_secret(token: str, project_ref: str) -> Optional[str]:
    """GET /v1/projects/{ref}/postgrest → {jwt_secret: "..."}

    Returns the JWT secret string, or None if unavailable.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{SUPABASE_API}/projects/{project_ref}/postgrest",
                headers=_headers(token),
            )
        if resp.status_code == 200:
            return resp.json().get("jwt_secret")
    except Exception:
        pass
    return None


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


async def ensure_realtime_enabled(token: str, project_ref: str, table_name: str, schema: str = "public") -> dict:
    """Ensure a table is in the supabase_realtime publication.
    
    Checks if the table is already subscribed, and if not, adds it.
    Uses the Management API SQL endpoint.
    Returns {enabled: bool, already_enabled: bool, error?: str}.
    """
    from .supabase_state_db import _supabase_run_sql

    # 1. Check if table is already in the publication
    check_sql = (
        f"SELECT 1 FROM pg_publication_tables "
        f"WHERE pubname = 'supabase_realtime' "
        f"AND schemaname = '{schema}' "
        f"AND tablename = '{table_name}'"
    )
    check_result = await _supabase_run_sql(token, project_ref, check_sql)
    
    if check_result.get("success"):
        rows = check_result.get("data", [])
        if rows and len(rows) > 0:
            return {"enabled": True, "already_enabled": True}
    
    # 2. Add table to publication
    add_sql = f'ALTER PUBLICATION supabase_realtime ADD TABLE "{schema}"."{table_name}"'
    add_result = await _supabase_run_sql(token, project_ref, add_sql)
    
    if add_result.get("success"):
        return {"enabled": True, "already_enabled": False}
    
    return {
        "enabled": False,
        "already_enabled": False,
        "error": add_result.get("detail", "Unknown error enabling Realtime"),
    }
