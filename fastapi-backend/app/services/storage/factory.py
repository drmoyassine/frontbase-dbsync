"""
Storage Adapter Factory — resolves StorageProvider → credentials → adapter instance.

This is the main entry point for all storage operations.
Uses lazy imports to avoid circular dependencies.
"""

import json
import logging
from typing import Dict, Any

from sqlalchemy.orm import Session

from app.core.credential_resolver import get_provider_context_by_id
from app.services.storage.base import StorageAdapter

logger = logging.getLogger(__name__)


# ── Adapter Registry (lazy — classes imported on first use) ──────────

def _get_adapter_registry() -> Dict[str, type]:
    """Lazy import of adapter classes to avoid circular imports."""
    from app.services.storage.supabase_adapter import SupabaseStorageAdapter
    from app.services.storage.cloudflare_adapter import CloudflareR2Adapter
    from app.services.storage.vercel_adapter import VercelBlobAdapter
    from app.services.storage.netlify_adapter import NetlifyBlobsAdapter

    return {
        "supabase": SupabaseStorageAdapter,
        "cloudflare": CloudflareR2Adapter,
        "vercel": VercelBlobAdapter,
        "netlify": NetlifyBlobsAdapter,
    }


def get_storage_adapter(db: Session, storage_provider_id: str) -> StorageAdapter:
    """Resolve a StorageProvider → EdgeProviderAccount → credentials → adapter.

    This is the main entry point for all storage operations.
    Uses the adapter registry to map provider type → adapter class,
    then builds the adapter with provider-specific credentials.
    """
    from app.models.storage_provider import StorageProvider

    sp = db.query(StorageProvider).filter(
        StorageProvider.id == storage_provider_id,
    ).first()
    if not sp:
        from fastapi import HTTPException
        raise HTTPException(404, f"Storage provider {storage_provider_id} not found")

    # Resolve credentials from the linked account
    ctx = get_provider_context_by_id(db, str(sp.provider_account_id))
    provider_type = str(sp.provider)

    registry = _get_adapter_registry()
    adapter_cls = registry.get(provider_type)
    if not adapter_cls:
        from fastapi import HTTPException
        raise HTTPException(400, f"No storage adapter for provider type '{provider_type}'")

    # ── Build adapter with provider-specific credentials ──────────────
    if provider_type == "supabase":
        api_url = ctx.get("api_url", "")
        auth_key = ctx.get("service_role_key", "") or ctx.get("anon_key", "")
        if not api_url or not auth_key:
            from fastapi import HTTPException
            raise HTTPException(400, "Supabase account missing api_url or keys")
        from app.services.storage.supabase_adapter import SupabaseStorageAdapter
        return SupabaseStorageAdapter(api_url, auth_key)

    if provider_type == "cloudflare":
        api_token = ctx.get("api_token", "")
        if not api_token:
            from fastapi import HTTPException
            raise HTTPException(400, "Cloudflare account missing api_token")
        # Resolve account_id from metadata or first account
        account_id = ctx.get("account_id", "")
        if not account_id:
            # Fetch first account ID via CF API
            try:
                import httpx as _httpx
                resp = _httpx.get(
                    "https://api.cloudflare.com/client/v4/accounts",
                    headers={"Authorization": f"Bearer {api_token}"},
                    params={"per_page": 1},
                )
                if resp.is_success:
                    accounts = resp.json().get("result", [])
                    if accounts:
                        account_id = accounts[0]["id"]
            except Exception:
                pass
        if not account_id:
            from fastapi import HTTPException
            raise HTTPException(400, "Could not resolve Cloudflare account ID for R2")
        from app.services.storage.cloudflare_adapter import CloudflareR2Adapter
        return CloudflareR2Adapter(api_token, account_id)

    if provider_type == "vercel":
        api_token = ctx.get("api_token", "")
        if not api_token:
            from fastapi import HTTPException
            raise HTTPException(400, "Vercel account missing api_token")
        from app.services.storage.vercel_adapter import VercelBlobAdapter
        return VercelBlobAdapter(api_token)

    if provider_type == "netlify":
        api_token = ctx.get("api_token", "")
        if not api_token:
            from fastapi import HTTPException
            raise HTTPException(400, "Netlify account missing api_token")
        # Read site_id from StorageProvider.config
        config = json.loads(str(sp.config or "{}"))
        site_id = config.get("site_id", "")
        if not site_id:
            from fastapi import HTTPException
            raise HTTPException(
                400,
                "Netlify storage requires a site_id. "
                "Re-add the storage provider and select a Netlify site."
            )
        from app.services.storage.netlify_adapter import NetlifyBlobsAdapter
        return NetlifyBlobsAdapter(api_token, site_id)

    from fastapi import HTTPException
    raise HTTPException(400, f"Unsupported storage provider: {provider_type}")
