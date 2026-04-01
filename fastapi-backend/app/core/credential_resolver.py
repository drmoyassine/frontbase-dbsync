"""
Unified Credential Resolver — Single source of truth for ALL provider credentials.

DRYs out credential access across the entire platform:
- Edge Providers (deploy, redeploy, delete, reconfigure, inspect)
- Data Sources (builder data binding, publish pipeline)
- Edge Infrastructure (databases, caches, queues)
- Storage, Users, RLS, Analytics tabs

All provider credentials flow through get_provider_context() or
the Supabase-specific get_supabase_context() helper.
"""

import json
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException


# ── Generic Provider Resolver ─────────────────────────────────────────

def get_provider_context(
    db: Session,
    provider_type: str,
    provider_id: Optional[str] = None,
) -> dict:
    """Get decrypted credentials + metadata for any connected account.

    Args:
        db: SQLAlchemy session
        provider_type: e.g. 'cloudflare', 'supabase', 'vercel', 'turso'
        provider_id: specific account ID (optional — uses first active match)

    Returns:
        dict with all decrypted secret keys + metadata keys merged, plus:
          - provider_id, provider_type, source
    
    Raises:
        HTTPException 404 if no matching active account found
    """
    from ..models.models import EdgeProviderAccount
    from .security import decrypt_credentials

    query = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.provider == provider_type,
        EdgeProviderAccount.is_active == True,  # noqa: E712
    )
    if provider_id:
        query = query.filter(EdgeProviderAccount.id == provider_id)

    provider = query.first()
    if not provider:
        raise HTTPException(
            404,
            f"No active {provider_type} account found. "
            f"Connect one in Settings → Accounts."
        )

    # Decrypt secrets
    creds = decrypt_credentials(str(provider.provider_credentials or "{}"))

    # Parse metadata
    metadata = {}
    if provider.provider_metadata is not None:
        try:
            metadata = json.loads(str(provider.provider_metadata))
        except (json.JSONDecodeError, TypeError):
            pass

    # Return merged view — metadata keys are overridden by creds if both exist
    return {
        **metadata,
        **creds,
        "provider_id": str(provider.id),
        "provider_type": provider_type,
        "source": "connected_account",
        # Also expose raw dicts for callers that need them separately
        "_creds": creds,
        "_metadata": metadata,
    }


def get_provider_context_by_id(db: Session, provider_id: str) -> dict:
    """Get credentials for a specific provider account by ID (any type).

    Same as get_provider_context but looks up by ID without needing provider_type.
    """
    from ..models.models import EdgeProviderAccount
    from .security import decrypt_credentials

    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == provider_id,
    ).first()
    if not provider:
        raise HTTPException(404, f"Provider account {provider_id} not found")

    creds = decrypt_credentials(str(provider.provider_credentials or "{}"))
    metadata = {}
    if provider.provider_metadata is not None:
        try:
            metadata = json.loads(str(provider.provider_metadata))
        except (json.JSONDecodeError, TypeError):
            pass

    return {
        **metadata,
        **creds,
        "provider_id": str(provider.id),
        "provider_type": str(provider.provider),
        "source": "connected_account",
        "_creds": creds,
        "_metadata": metadata,
    }


def get_supabase_context(db: Session, mode: str = "builder") -> dict:
    """Get Supabase connection context (url, anon_key, auth_key).

    Priority:
      1. Connected Account (EdgeProviderAccount where provider='supabase')
         → Uses Management API-obtained credentials stored during connect flow
      2. Legacy project_settings table (backward compatibility)

    Args:
        db: SQLAlchemy session
        mode: 'builder' uses service_role_key, 'public' uses anon_key

    Returns:
        dict with keys: url, anon_key, auth_key, auth_method, source
    """
    # ── Try Connected Accounts first ──────────────────────────────────
    ctx = _from_connected_accounts(db, mode)
    if ctx:
        return ctx

    # ── Fallback to legacy project_settings ───────────────────────────
    return _from_legacy_project_settings(db, mode)


def _from_connected_accounts(db: Session, mode: str) -> Optional[dict]:
    """Try to get Supabase creds from EdgeProviderAccount."""
    from ..models.models import EdgeProviderAccount
    from .security import decrypt_credentials

    provider = (
        db.query(EdgeProviderAccount)
        .filter(
            EdgeProviderAccount.provider == "supabase",
            EdgeProviderAccount.is_active == True,
        )
        .first()
    )

    if not provider:
        return None

    # Get metadata (api_url, project_ref — non-sensitive)
    metadata = {}
    if provider.provider_metadata is not None:
        try:
            metadata = json.loads(str(provider.provider_metadata))
        except (json.JSONDecodeError, TypeError):
            pass

    # Get secrets (access_token, anon_key, service_role_key — encrypted at rest)
    creds = decrypt_credentials(str(provider.provider_credentials or "{}"))

    api_url = metadata.get("api_url", "")
    # Primary: encrypted credentials. Fallback: metadata (legacy data from before fix).
    anon_key = creds.get("anon_key", "") or metadata.get("anon_key", "")
    service_role_key = creds.get("service_role_key", "") or metadata.get("service_role_key", "")

    if not api_url or not anon_key:
        return None

    # Select auth key based on mode
    if mode == "builder" and service_role_key:
        auth_key = service_role_key
        auth_method = "service_role"
    else:
        auth_key = anon_key
        auth_method = "anon"

    return {
        "url": api_url,
        "anon_key": anon_key,
        "auth_key": auth_key,
        "auth_method": auth_method,
        "source": "connected_account",
        "provider_id": str(provider.id),
        "access_token": creds.get("access_token", ""),
        "project_ref": metadata.get("project_ref", ""),
        "jwt_secret": creds.get("jwt_secret", ""),
    }


def _from_legacy_project_settings(db: Session, mode: str) -> dict:
    """Fallback: read from legacy project_settings table."""
    from ..database.utils import get_project_settings, decrypt_data

    project = get_project_settings(db, "default")

    if not project or not project.get("supabase_url"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Supabase connection not configured. Connect a Supabase account in Settings → Accounts.")

    url = project["supabase_url"]
    anon_key = project.get("supabase_anon_key", "")
    encrypted_service_key = project.get("supabase_service_key_encrypted")

    auth_key = anon_key
    auth_method = "anon"

    if mode == "builder" and encrypted_service_key:
        try:
            # Check for old Express JSON format
            try:
                key_data = json.loads(encrypted_service_key)
                if isinstance(key_data, dict) and "encrypted" in key_data:
                    pass  # Can't decrypt Express format, use anon
                else:
                    raise ValueError()
            except (ValueError, TypeError):
                decrypted = decrypt_data(encrypted_service_key)
                if decrypted and decrypted != encrypted_service_key:
                    auth_key = decrypted
                    auth_method = "service_role"
        except Exception:
            pass  # Fall back to anon_key

    return {
        "url": url,
        "anon_key": anon_key,
        "auth_key": auth_key,
        "auth_method": auth_method,
        "source": "legacy_project_settings",
    }


def is_supabase_connected(db: Session) -> bool:
    """Quick check: is any Supabase credential source available?"""
    # Check connected accounts
    from ..models.models import EdgeProviderAccount

    has_account = (
        db.query(EdgeProviderAccount)
        .filter(
            EdgeProviderAccount.provider == "supabase",
            EdgeProviderAccount.is_active == True,
        )
        .count()
        > 0
    )
    if has_account:
        return True

    # Check legacy
    from ..database.utils import get_project_settings

    project = get_project_settings(db, "default")
    return bool(project and project.get("supabase_url") and project.get("supabase_anon_key"))
