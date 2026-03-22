"""
Engine Lister — Multi-provider engine/function/app listing.

Extracted from edge_providers.py router for SRP compliance.
Uses a registry pattern to dispatch to provider-specific listing APIs.
Returns a unified shape: [{name, url, provider, deployed_at, created_at}]
"""

import re
import datetime
from typing import Any

import httpx


# =============================================================================
# Public Entry Point
# =============================================================================

async def list_engines(provider_type: str, creds: dict) -> list[dict]:
    """List engines/functions/apps from a connected edge provider.

    Dispatches to provider-specific listing API and returns unified shape.
    Returns [] if provider is unsupported.
    """
    lister = _ENGINE_LISTERS.get(provider_type)
    if not lister:
        return []
    return await lister(creds)


# =============================================================================
# Per-Provider Listers
# =============================================================================

async def _list_cf_engines(creds: dict) -> list[dict]:
    """List Cloudflare Workers using existing cloudflare_api helper."""
    from ..services import cloudflare_api
    token = creds.get("api_token", "")
    account_id = creds.get("account_id", "")
    if not token or not account_id:
        return []
    workers = cloudflare_api.list_workers(token, account_id)
    return [
        {
            "name": w["name"],
            "url": w.get("url", ""),
            "provider": "cloudflare",
            "deployed_at": w.get("modified_on", ""),
            "created_at": w.get("created_on", ""),
        }
        for w in workers
    ]


async def _list_supabase_engines(creds: dict) -> list[dict]:
    """List Supabase Edge Functions via Management API."""
    token = creds.get("access_token", "")
    project_ref = creds.get("project_ref", "")
    if not token or not project_ref:
        return []
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"https://api.supabase.com/v1/projects/{project_ref}/functions",
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code != 200:
        return []
    functions = resp.json()
    if not isinstance(functions, list):
        return []
    return [
        {
            "name": f.get("name", f.get("slug", "")),
            "url": f"https://{project_ref}.supabase.co/functions/v1/{f.get('slug', '')}",
            "provider": "supabase",
            "deployed_at": _epoch_to_iso(f.get("updated_at")),
            "created_at": _epoch_to_iso(f.get("created_at")),
        }
        for f in functions
    ]


async def _list_deno_engines(creds: dict) -> list[dict]:
    """List Deno Deploy apps via v2 API."""
    token = creds.get("access_token", "")
    if not token:
        return []
    apps: list[dict] = []
    cursor: str | None = None
    
    # Build URL suffix from org_slug in credentials
    org_slug = creds.get("org_slug", "")
    if org_slug:
        url_suffix = f".{org_slug}.deno.net"
    else:
        url_suffix = ".deno.dev"
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Paginate up to 5 pages (150 apps max)
        for _ in range(5):
            params: dict[str, Any] = {"limit": 30}
            if cursor:
                params["cursor"] = cursor
            resp = await client.get(
                "https://api.deno.com/v2/apps",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            if resp.status_code != 200:
                break
            page = resp.json()
            if not isinstance(page, list) or len(page) == 0:
                break
            for a in page:
                slug = a.get("slug", "")
                apps.append({
                    "name": slug,
                    "url": f"https://{slug}{url_suffix}",
                    "provider": "deno",
                    "deployed_at": a.get("updated_at", ""),
                    "created_at": a.get("created_at", ""),
                })
            # Check Link header for next cursor
            link = resp.headers.get("link", "")
            if 'rel="next"' not in link:
                break
            m = re.search(r'cursor=([^&>]+)', link)
            cursor = m.group(1) if m else None
            if not cursor:
                break
    return apps


async def _list_vercel_engines(creds: dict) -> list[dict]:
    """List Vercel projects via REST API."""
    from ..services import vercel_deploy_api
    token = creds.get("api_token", "")
    team_id = creds.get("team_id")
    if not token:
        return []
    projects = await vercel_deploy_api.list_projects(token, team_id)
    return [
        {
            "name": p.get("name", ""),
            "url": f"https://{p.get('name', '')}.vercel.app",
            "provider": "vercel",
            "deployed_at": _epoch_to_iso(p.get("updatedAt")),
            "created_at": _epoch_to_iso(p.get("createdAt")),
        }
        for p in projects
    ]


async def _list_netlify_engines(creds: dict) -> list[dict]:
    """List Netlify sites via REST API."""
    token = creds.get("api_token", "")
    if not token:
        return []
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://api.netlify.com/api/v1/sites",
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code != 200:
        return []
    return [
        {
            "name": s.get("name", ""),
            "url": s.get("ssl_url", s.get("url", "")),
            "provider": "netlify",
            "deployed_at": s.get("published_deploy", {}).get("published_at", "") if isinstance(s.get("published_deploy"), dict) else "",
            "created_at": s.get("created_at", ""),
        }
        for s in resp.json()
        if isinstance(s, dict)
    ]


# =============================================================================
# Helpers
# =============================================================================

def _epoch_to_iso(val: Any) -> str:
    """Convert Supabase epoch (seconds, millis, or micros) to ISO string, or pass through strings."""
    if val is None:
        return ""
    if isinstance(val, (int, float)):
        ts = float(val)
        # Supabase may return seconds, milliseconds, or microseconds
        if ts > 1e15:       # microseconds
            ts = ts / 1e6
        elif ts > 1e12:     # milliseconds
            ts = ts / 1e3
        try:
            return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()
        except (OSError, OverflowError, ValueError):
            return str(val)
    return str(val)


# =============================================================================
# Registry — add new providers here
# =============================================================================

_ENGINE_LISTERS: dict[str, Any] = {
    "cloudflare": _list_cf_engines,
    "supabase": _list_supabase_engines,
    "deno": _list_deno_engines,
    "vercel": _list_vercel_engines,
    "netlify": _list_netlify_engines,
}
