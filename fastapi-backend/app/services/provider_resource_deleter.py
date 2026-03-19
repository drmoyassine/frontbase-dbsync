"""
Provider Resource Deleter — Registry-pattern dispatch for remote resource deletion.

Mirrors provider_discovery.py's pattern:
  delete_resource(provider, resource_type, creds, **kwargs) → dict

Adding a new provider deleter:
  1. Write an async _delete_<provider>_<resource>(creds, **kwargs) function
  2. Add it to the _DELETERS dict
  That's it. No if/elif chains.

This is the SINGLE place all remote resource deletion logic lives.
Routers call `delete_resource()` or `delete_resource_for_edge_model()`.
"""

import httpx
import base64
import json
from typing import Optional


# =============================================================================
# Public Entry Points
# =============================================================================

async def delete_resource(provider: str, resource_type: str, creds: dict[str, object], **kwargs: object) -> dict[str, object]:
    """Delete a remote resource via its provider's management API.

    Returns {"success": True} or {"success": False, "detail": "..."}.
    """
    provider_deleters = _DELETERS.get(provider, {})
    deleter = provider_deleters.get(resource_type)
    if not deleter:
        return {"success": False, "detail": f"Deletion not supported for {provider}/{resource_type}"}

    try:
        return await deleter(creds, **kwargs)  # type: ignore[operator]
    except Exception as e:
        return {"success": False, "detail": f"Delete failed: {str(e)}"}


def supports_remote_delete(provider: str, resource_type: str) -> bool:
    """Check if a provider/resource_type combo supports remote deletion."""
    return resource_type in _DELETERS.get(provider, {})


def supports_remote_delete_for_model(model_kind: str, provider: str) -> bool:
    """Check if a model_kind/provider combo supports remote deletion.

    Args:
        model_kind: "database", "cache", or "queue"
        provider: the edge resource provider (e.g. "cloudflare", "upstash", "turso")
    """
    resource_type = _RESOURCE_TYPE_MAP.get(model_kind, {}).get(provider, "")
    return supports_remote_delete(provider, resource_type)


# Resource-type mapping from edge model provider → (account_provider, resource_type)
# Used by `delete_resource_for_edge_model()` to resolve the correct deleter.
_RESOURCE_TYPE_MAP: dict[str, dict[str, str]] = {
    # edge_databases provider → resource_type
    "database": {
        "cloudflare": "d1",
        "turso": "turso_db",
        "neon": "neon_project",
    },
    # edge_caches provider → resource_type
    "cache": {
        "cloudflare": "kv",
        "upstash": "redis",
    },
    # edge_queues provider → resource_type
    "queue": {
        "cloudflare": "queue",
    },
}


async def delete_resource_for_edge_model(
    model_kind: str,
    provider: str,
    resource_url: str,
    provider_config_json: Optional[str],
    provider_account_id: Optional[str],
    db_session: object,
) -> bool:
    """Convenience wrapper: resolve creds from connected account, delete the remote resource.

    Args:
        model_kind: "database", "cache", or "queue"
        provider: the edge resource provider (e.g. "cloudflare", "upstash", "turso")
        resource_url: the stored URL (e.g. "d1://uuid", rest URL, libsql:// URL)
        provider_config_json: JSON string with extra config (e.g. cf_account_id)
        provider_account_id: FK to edge_providers_accounts
        db_session: SQLAlchemy Session

    Returns:
        True if deletion succeeded, False otherwise.
    """
    if not provider_account_id:
        return False

    # Resolve resource_type from provider + model_kind
    resource_type = _RESOURCE_TYPE_MAP.get(model_kind, {}).get(provider)
    if not resource_type:
        return False

    # Resolve credentials from connected account
    try:
        from ..core.security import get_provider_creds
        creds = get_provider_creds(str(provider_account_id), db_session)  # type: ignore[arg-type]
        if not creds:
            return False
    except Exception as e:
        print(f"[ResourceDeleter] Error resolving creds: {e}")
        return False

    # Parse provider_config for extra context
    config: dict[str, object] = {}
    if provider_config_json:
        try:
            config = json.loads(provider_config_json)
        except (json.JSONDecodeError, TypeError):
            pass

    result = await delete_resource(
        provider, resource_type, creds,
        resource_url=resource_url,
        config=config,
    )

    if result.get("success"):
        print(f"[ResourceDeleter] Deleted remote {provider}/{resource_type}")
        return True
    else:
        print(f"[ResourceDeleter] Delete failed: {result.get('detail')}")
        return False


# =============================================================================
# Cloudflare Deleters — D1, KV, Queue
# =============================================================================

# CF API path templates for resource deletion
_CF_DELETE_PATHS: dict[str, str] = {
    "d1":    "/accounts/{acct_id}/d1/database/{resource_id}",
    "kv":    "/accounts/{acct_id}/storage/kv/namespaces/{resource_id}",
    "queue": "/accounts/{acct_id}/queues/{resource_id}",
}


async def _resolve_cf_account_id(creds: dict[str, object], config: dict[str, object]) -> str:
    """Resolve CF account ID from config or via API."""
    acct_id = str(config.get("cf_account_id", ""))
    if acct_id:
        return str(acct_id)

    # Fallback: fetch first account via API
    token = str(creds.get("api_token", ""))
    if not token:
        return ""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            "https://api.cloudflare.com/client/v4/accounts",
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code == 200:
        accounts = resp.json().get("result", [])
        if accounts:
            return str(accounts[0].get("id", ""))
    return ""


async def _delete_cf_resource(creds: dict[str, object], resource_type: str, **kwargs: object) -> dict[str, object]:
    """Generic CF resource deleter for D1/KV/Queue."""
    token = str(creds.get("api_token", ""))
    if not token:
        return {"success": False, "detail": "No API token in credentials"}

    config: dict[str, object] = dict(kwargs.get("config", {}))  # type: ignore[arg-type]
    resource_url = str(kwargs.get("resource_url", ""))

    # Extract resource UUID from URL schemes
    resource_id = resource_url
    for prefix in ("d1://", "kv://", "cfq://"):
        resource_id = resource_id.replace(prefix, "")
    resource_id = resource_id.strip()
    if not resource_id:
        return {"success": False, "detail": "Could not extract resource ID from URL"}

    acct_id = await _resolve_cf_account_id(creds, config)
    if not acct_id:
        return {"success": False, "detail": "Could not resolve CF account ID"}

    path_template = _CF_DELETE_PATHS.get(resource_type)
    if not path_template:
        return {"success": False, "detail": f"Unknown CF resource type: {resource_type}"}

    path = path_template.format(acct_id=acct_id, resource_id=resource_id)
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.delete(
            f"https://api.cloudflare.com/client/v4{path}",
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code in (200, 204):
        data = resp.json() if resp.status_code == 200 else {}
        if resp.status_code == 204 or data.get("success"):
            return {"success": True}
        errors = data.get("errors", [{}])
        return {"success": False, "detail": errors[0].get("message", "Delete failed")}

    try:
        data = resp.json()
        errors = data.get("errors", [{}])
        return {"success": False, "detail": errors[0].get("message", f"HTTP {resp.status_code}")}
    except Exception:
        return {"success": False, "detail": f"HTTP {resp.status_code}"}


async def _delete_cf_d1(creds: dict[str, object], **kwargs: object) -> dict[str, object]:
    return await _delete_cf_resource(creds, "d1", **kwargs)

async def _delete_cf_kv(creds: dict[str, object], **kwargs: object) -> dict[str, object]:
    return await _delete_cf_resource(creds, "kv", **kwargs)

async def _delete_cf_queue(creds: dict[str, object], **kwargs: object) -> dict[str, object]:
    return await _delete_cf_resource(creds, "queue", **kwargs)


# =============================================================================
# Upstash Deleter — Redis
# =============================================================================

async def _delete_upstash_redis(creds: dict[str, object], **kwargs: object) -> dict[str, object]:
    """Delete an Upstash Redis database by matching its endpoint URL."""
    token = str(creds.get("api_token", ""))
    email = str(creds.get("email", ""))
    if not token or not email:
        return {"success": False, "detail": "Missing Upstash credentials (api_token, email)"}

    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    cache_url = str(kwargs.get("resource_url", ""))
    if not cache_url:
        return {"success": False, "detail": "No resource URL to match"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        list_resp = await client.get(
            "https://api.upstash.com/v2/redis/databases",
            headers={"Authorization": f"Basic {auth}"},
        )
        if list_resp.status_code != 200:
            return {"success": False, "detail": f"Upstash list API error: {list_resp.status_code}"}

        dbs = list_resp.json()
        for rdb in (dbs if isinstance(dbs, list) else []):
            rest_url = rdb.get("rest_url", "")
            endpoint = rdb.get("endpoint", "")
            if (rest_url and rest_url in cache_url) or (endpoint and endpoint in cache_url):
                db_id = rdb.get("database_id")
                if db_id:
                    del_resp = await client.delete(
                        f"https://api.upstash.com/v2/redis/database/{db_id}",
                        headers={"Authorization": f"Basic {auth}"},
                    )
                    if del_resp.status_code in (200, 204):
                        return {"success": True}
                    return {"success": False, "detail": f"Upstash delete error: {del_resp.status_code}"}
                break

    return {"success": False, "detail": "Redis database not found on Upstash by URL match"}


# =============================================================================
# Turso Deleter — Database
# =============================================================================

async def _delete_turso_db(creds: dict[str, object], **kwargs: object) -> dict[str, object]:
    """Delete a Turso database by deriving its name from the DB URL."""
    token = str(creds.get("api_token", ""))
    if not token:
        return {"success": False, "detail": "No Turso API token"}

    resource_url = str(kwargs.get("resource_url", ""))
    # URL is like "libsql://dbname-orgslug.turso.io"
    # Extract db name as the first segment of the hostname
    db_name = resource_url.replace("libsql://", "").split(".")[0].split("-")[0] if resource_url else ""
    if not db_name:
        return {"success": False, "detail": "Could not extract DB name from URL"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Get org slug
        org_resp = await client.get(
            "https://api.turso.tech/v1/organizations",
            headers={"Authorization": f"Bearer {token}"},
        )
        if org_resp.status_code != 200:
            return {"success": False, "detail": f"Turso orgs API error: {org_resp.status_code}"}
        orgs = org_resp.json()
        if not orgs:
            return {"success": False, "detail": "No Turso organizations found"}
        org_slug = orgs[0].get("slug", "")

        # The hostname is "dbname-orgslug.turso.io" so the full DB name
        # may include hyphens. Extract it properly by stripping the org suffix.
        hostname = resource_url.replace("libsql://", "").split(".")[0] if resource_url else ""
        if hostname.endswith(f"-{org_slug}"):
            db_name = hostname[: -(len(org_slug) + 1)]
        else:
            db_name = hostname

        resp = await client.delete(
            f"https://api.turso.tech/v1/organizations/{org_slug}/databases/{db_name}",
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code in (200, 204):
        return {"success": True}
    return {"success": False, "detail": f"Turso delete error {resp.status_code}: {resp.text[:200]}"}


# =============================================================================
# Neon Deleter — Project
# =============================================================================

async def _delete_neon_project(creds: dict[str, object], **kwargs: object) -> dict[str, object]:
    """Delete a Neon project by its project ID (stored as resource URL)."""
    token = str(creds.get("api_token", ""))
    if not token:
        return {"success": False, "detail": "No Neon API key"}

    resource_url = str(kwargs.get("resource_url", ""))
    # Neon resource_url could be a connection URI or a project ID
    # Try to extract project_id from config first
    config: dict[str, object] = dict(kwargs.get("config", {}))  # type: ignore[arg-type]
    project_id = str(config.get("neon_project_id", ""))

    if not project_id:
        # The resource ID was stored as URL (e.g. "postgresql://...@ep-xxx.neon.tech/neondb")
        # We can't delete by connection URI — need project_id in config
        return {"success": False, "detail": "No Neon project_id in config — cannot delete remotely"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.delete(
            f"https://console.neon.tech/api/v2/projects/{project_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code in (200, 204):
        return {"success": True}
    return {"success": False, "detail": f"Neon delete error {resp.status_code}: {resp.text[:200]}"}


# =============================================================================
# Registry — add new provider deleters here
# =============================================================================

_DELETERS: dict[str, dict[str, object]] = {
    "cloudflare": {
        "d1":    _delete_cf_d1,
        "kv":    _delete_cf_kv,
        "queue": _delete_cf_queue,
    },
    "upstash": {
        "redis": _delete_upstash_redis,
    },
    "turso": {
        "turso_db": _delete_turso_db,
    },
    "neon": {
        "neon_project": _delete_neon_project,
    },
}
