"""
Cloudflare Scoped Token Manager — Create/Delete per-resource API tokens.

Creates minimal-permission API tokens scoped to specific CF resources
(D1, KV, Queues). Tokens are lifecycle-managed: created when a resource
is registered, deleted when the resource is removed.

Usage:
    from ..services.cf_token_manager import create_scoped_token, delete_scoped_token

    # On resource creation
    result = await create_scoped_token(parent_token, "d1", resource_name, account_id)
    # result = {"token_id": "...", "token_value": "..."}

    # On resource deletion
    await delete_scoped_token(parent_token, token_id)
"""

import httpx
from typing import Optional


# CF Permission Group IDs — these are fixed by Cloudflare
# Reference: https://developers.cloudflare.com/api/resources/user/subresources/tokens/
# We look them up dynamically from the API to be future-proof.

# Resource-type → permission group name mapping
# Names must match exactly what CF returns from /accounts/{id}/tokens/permission_groups
_PERMISSION_NAMES: dict[str, list[str]] = {
    "d1":    ["D1 Write", "D1 Read"],
    "kv":    ["Workers KV Storage Write", "Workers KV Storage Read"],
    "queue": ["Queues Write", "Queues Read"],
    "r2":    ["Workers R2 Storage Write", "Workers R2 Storage Read"],
}


async def _get_permission_group_ids(
    client: httpx.AsyncClient,
    token: str,
    account_id: str,
    names: list[str],
) -> list[dict]:
    """Look up CF permission group IDs by name (account-level API)."""
    resp = await client.get(
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/tokens/permission_groups",
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code != 200:
        print(f"[CF Token] Permission groups API returned {resp.status_code}: {resp.text[:300]}")
        return []
    
    all_groups = resp.json().get("result", [])
    matched = []
    for group in all_groups:
        if group.get("name") in names:
            matched.append({"id": group["id"]})
    
    if not matched:
        relevant = [g.get("name", "") for g in all_groups if any(
            kw in g.get("name", "").lower() for kw in ["d1", "kv", "queue", "r2", "worker", "storage", "token"]
        )]
        print(f"[CF Token] Could not match permission names {names}")
        print(f"[CF Token] Relevant available groups: {relevant}")
        print(f"[CF Token] Total permission groups returned: {len(all_groups)}")
    
    return matched


async def create_scoped_token(
    parent_token: str,
    resource_type: str,
    resource_name: str,
    account_id: str,
) -> dict:
    """Create a scoped CF API token for a specific resource type.
    
    Args:
        parent_token: The connected account's API token (must have tokens:edit)
        resource_type: "d1", "kv", "queue", or "r2"
        resource_name: Human name for the token (e.g. "frontbase-d1-my-database")
        account_id: CF account ID to scope the token to
        
    Returns:
        {"success": True, "token_id": "...", "token_value": "..."} on success
        {"success": False, "detail": "..."} on failure
    """
    perm_names = _PERMISSION_NAMES.get(resource_type)
    if not perm_names:
        return {"success": False, "detail": f"Unknown resource type: {resource_type}"}

    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1. Look up permission group IDs (account-level)
        perm_groups = await _get_permission_group_ids(client, parent_token, account_id, perm_names)
        if not perm_groups:
            # Fallback: try without scoped token, use parent token directly
            return {
                "success": False,
                "detail": f"Could not find CF permission groups for {resource_type}. "
                          f"The connected account's token may lack 'tokens:edit' permission.",
            }

        # 2. Create the scoped token (account-level API)
        token_name = f"frontbase-{resource_type}-{resource_name}"[:50]  # CF has name limits
        resp = await client.post(
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/tokens",
            headers={
                "Authorization": f"Bearer {parent_token}",
                "Content-Type": "application/json",
            },
            json={
                "name": token_name,
                "policies": [
                    {
                        "effect": "allow",
                        "permission_groups": perm_groups,
                        "resources": {
                            f"com.cloudflare.api.account.{account_id}": "*",
                        },
                    }
                ],
            },
        )

    data = resp.json()
    if data.get("success"):
        result = data.get("result", {})
        return {
            "success": True,
            "token_id": result.get("id", ""),
            "token_value": result.get("value", ""),
        }
    
    errors = data.get("errors", [{}])
    return {
        "success": False,
        "detail": errors[0].get("message", "Token creation failed"),
    }


async def delete_scoped_token(
    parent_token: str,
    token_id: str,
    account_id: str = "",
) -> dict:
    """Delete a scoped CF API token.
    
    Args:
        parent_token: The connected account's API token
        token_id: The scoped token's ID (from create_scoped_token)
        account_id: CF account ID (uses account-level API)
        
    Returns:
        {"success": True} on success
        {"success": False, "detail": "..."} on failure
    """
    if not token_id:
        return {"success": True}  # Nothing to delete

    # Use account-level endpoint if account_id is available, else fall back to user-level
    if account_id:
        url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/tokens/{token_id}"
    else:
        url = f"https://api.cloudflare.com/client/v4/user/tokens/{token_id}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.delete(
            url,
            headers={"Authorization": f"Bearer {parent_token}"},
        )
    
    if resp.status_code in (200, 204):
        return {"success": True}
    
    data = resp.json() if resp.status_code != 204 else {}
    errors = data.get("errors", [{}])
    return {
        "success": False,
        "detail": errors[0].get("message", f"Token delete failed: HTTP {resp.status_code}"),
    }


async def get_cf_account_id(token: str) -> Optional[str]:
    """Get the first CF account ID for a token. Used to resolve account_id from creds."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            "https://api.cloudflare.com/client/v4/accounts",
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code != 200:
        return None
    accounts = resp.json().get("result", [])
    return accounts[0].get("id") if accounts else None


# =============================================================================
# High-Level Lifecycle Hooks (call from resource create/delete endpoints)
# =============================================================================

# Maps resource table type → CF resource type for permission scoping
_RESOURCE_TYPE_MAP = {
    "d1": "d1", "cloudflare_d1": "d1",
    "kv": "kv", "cloudflare_kv": "kv",
    "queue": "queue", "cloudflare_queue": "queue",
    "r2": "r2", "cloudflare_r2": "r2",
}


async def maybe_create_scoped_token(
    provider: str,
    resource_name: str,
    provider_account_id: Optional[str],
    db_session: object,
) -> dict:
    """Auto-create a scoped CF token if provider is cloudflare.
    
    Call this from resource create endpoints. Returns a provider_config
    dict to store on the resource, or empty dict for non-CF providers.
    
    Args:
        provider: The resource's provider (e.g. "cloudflare", "upstash")
        resource_name: Human name for the resource
        provider_account_id: FK to edge_providers_accounts
        db_session: SQLAlchemy Session
        
    Returns:
        {"scoped_token_id": "...", "scoped_token_value": "...(encrypted)", "cf_account_id": "..."}
        or {} for non-CF providers
    """
    if provider != "cloudflare" or not provider_account_id:
        return {}

    # Resolve parent token from connected account
    try:
        from ..core.security import get_provider_creds, encrypt_field
        creds = get_provider_creds(str(provider_account_id), db_session)  # type: ignore[arg-type]
        if not creds:
            print(f"[CF Token] No creds for provider account {provider_account_id}")
            return {}
        
        parent_token = creds.get("api_token", "")
        account_id = creds.get("account_id", "")
        if not parent_token:
            return {}
        if not account_id:
            account_id = await get_cf_account_id(parent_token) or ""
        if not account_id:
            return {}

        # Determine CF resource type from the resource's discovered type
        # The provider field is "cloudflare" — the resource type is inferred
        # from the URL scheme (d1://, kv://, cfq://)
        # Default to "d1" — callers can override by passing specific type
        cf_type = "d1"  # Will be overridden by callers

        result = await create_scoped_token(parent_token, cf_type, resource_name, account_id)
        if result.get("success"):
            config = {
                "scoped_token_id": result["token_id"],
                "scoped_token_value": encrypt_field(result["token_value"]),
                "cf_account_id": account_id,
            }
            print(f"[CF Token] Created scoped token for {resource_name}")
            return config
        else:
            print(f"[CF Token] Scoped token creation failed: {result.get('detail')}")
            return {"cf_account_id": account_id}  # Still store account_id for direct token fallback
    except Exception as e:
        print(f"[CF Token] Error creating scoped token: {e}")
        return {}


async def maybe_create_scoped_token_typed(
    provider: str,
    cf_resource_type: str,
    resource_name: str,
    provider_account_id: Optional[str],
    db_session: object,
) -> dict:
    """Same as maybe_create_scoped_token but with explicit CF resource type.
    
    Args:
        cf_resource_type: "d1", "kv", "queue", or "r2"
    """
    if provider != "cloudflare" or not provider_account_id:
        return {}

    try:
        from ..core.security import get_provider_creds, encrypt_field
        creds = get_provider_creds(str(provider_account_id), db_session)  # type: ignore[arg-type]
        if not creds:
            return {}
        
        parent_token = creds.get("api_token", "")
        account_id = creds.get("account_id", "")
        if not parent_token:
            return {}
        if not account_id:
            account_id = await get_cf_account_id(parent_token) or ""
        if not account_id:
            return {}

        result = await create_scoped_token(parent_token, cf_resource_type, resource_name, account_id)
        if result.get("success"):
            config = {
                "scoped_token_id": result["token_id"],
                "scoped_token_value": encrypt_field(result["token_value"]),
                "cf_account_id": account_id,
            }
            print(f"[CF Token] Created scoped {cf_resource_type} token for {resource_name}")
            return config
        else:
            detail = result.get('detail', 'Unknown error')
            print(f"[CF Token] Scoped token failed: {detail}")
            return {
                "cf_account_id": account_id,
                "_warning": f"Scoped token not created: {detail}. The parent account token will be used at deploy time.",
            }
    except Exception as e:
        print(f"[CF Token] Error: {e}")
        return {"_warning": f"Scoped token error: {e}"}


async def maybe_delete_scoped_token(
    provider: str,
    provider_config_json: Optional[str],
    provider_account_id: Optional[str],
    db_session: object,
) -> None:
    """Auto-delete a scoped CF token on resource deletion.
    
    Call this from resource delete endpoints. No-op for non-CF providers.
    """
    if provider != "cloudflare" or not provider_config_json:
        return

    import json
    try:
        config = json.loads(provider_config_json)
    except (json.JSONDecodeError, TypeError):
        return

    token_id = config.get("scoped_token_id")
    if not token_id:
        return

    # Resolve account_id from config (stored at creation time)
    cf_account_id = config.get("cf_account_id", "")

    try:
        from ..core.security import get_provider_creds
        creds = get_provider_creds(str(provider_account_id), db_session)  # type: ignore[arg-type]
        if not creds:
            return
        parent_token = creds.get("api_token", "")
        if not parent_token:
            return

        # If no account_id in config, try to resolve it
        if not cf_account_id:
            cf_account_id = await get_cf_account_id(parent_token) or ""

        result = await delete_scoped_token(parent_token, token_id, cf_account_id)
        if result.get("success"):
            print(f"[CF Token] Deleted scoped token {token_id}")
        else:
            print(f"[CF Token] Delete failed: {result.get('detail')}")
    except Exception as e:
        print(f"[CF Token] Error deleting scoped token: {e}")



