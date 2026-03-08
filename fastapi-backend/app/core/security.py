"""
Credential Encryption & Provider Security.

Single source of truth for:
- Fernet AES-256 symmetric encryption of provider credentials
- A single-source helper to fetch + decrypt provider credentials
- Separation of secrets vs metadata per provider type

Uses FERNET_KEY environment variable. If not set, auto-generates
a key and logs a warning. In production, always set FERNET_KEY.
"""

import json
import os
import warnings
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session


# ── Key Management ────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    """Get Fernet instance from FERNET_KEY env var (cached).
    
    If FERNET_KEY is not set, generates a key and warns.
    """
    key = os.environ.get("FERNET_KEY")
    if not key:
        key = Fernet.generate_key().decode()
        warnings.warn(
            f"FERNET_KEY not set! Auto-generated key: {key[:8]}... "
            "Set FERNET_KEY in .env for production. "
            "Restarting without it will make encrypted data unrecoverable.",
            RuntimeWarning,
            stacklevel=2,
        )
        os.environ["FERNET_KEY"] = key
    return Fernet(key.encode() if isinstance(key, str) else key)


# ── Encrypt / Decrypt ─────────────────────────────────────────────────

def encrypt_credentials(data: dict) -> str:
    """Encrypt a dict of credentials → base64 string for DB storage."""
    f = _get_fernet()
    plaintext = json.dumps(data).encode("utf-8")
    return f.encrypt(plaintext).decode("utf-8")


def decrypt_credentials(blob: str) -> dict:
    """Decrypt a stored credential blob → dict.
    
    Falls back to JSON parse for legacy plaintext data (migration-safe).
    """
    if not blob:
        return {}
    
    # Try Fernet decrypt first
    f = _get_fernet()
    try:
        plaintext = f.decrypt(blob.encode("utf-8"))
        return json.loads(plaintext)
    except (InvalidToken, Exception):
        pass
    
    # Fallback: legacy plaintext JSON (pre-encryption migration)
    try:
        return json.loads(blob)
    except (json.JSONDecodeError, TypeError):
        return {}


def is_encrypted(blob: str) -> bool:
    """Check if a blob is Fernet-encrypted (starts with gAAAA)."""
    return blob.startswith("gAAAA") if blob else False


# ── Provider Schemas ──────────────────────────────────────────────────
# Maps provider type → which credential keys are secrets vs metadata

PROVIDER_SECRET_KEYS: dict[str, set[str]] = {
    "cloudflare": {"api_token"},
    "supabase":   {"access_token"},
    "vercel":     {"api_token"},
    "netlify":    {"api_token"},
    "deno":       {"access_token"},
    "upstash":    {"api_token", "email"},
    "docker":     set(),               # Docker uses no external credentials
}

PROVIDER_METADATA_KEYS: dict[str, set[str]] = {
    "cloudflare": {"account_id"},
    "supabase":   {"project_ref"},
    "vercel":     {"team_id"},
    "netlify":    {"site_id"},
    "deno":       {"org_id"},
    "upstash":    set(),
    "docker":     set(),
}


def split_credentials(provider_type: str, data: dict) -> tuple[dict, dict]:
    """Split a credential dict into (secrets, metadata) based on provider schema.
    
    secrets: api_token, access_token, etc. → encrypted in DB
    metadata: account_id, project_ref, etc. → cleartext for UI display
    """
    secret_keys = PROVIDER_SECRET_KEYS.get(provider_type, set())
    metadata_keys = PROVIDER_METADATA_KEYS.get(provider_type, set())
    
    secrets = {}
    metadata = {}
    
    for key, value in data.items():
        if key in secret_keys:
            secrets[key] = value
        elif key in metadata_keys:
            metadata[key] = value
        else:
            # Unknown keys go to secrets by default (safer)
            secrets[key] = value
    
    return secrets, metadata


# ── Single-Source Credential Helper ───────────────────────────────────

def get_provider_creds(provider_id: str, db: Session) -> dict:
    """Fetch and decrypt a provider's credentials by ID.
    
    Returns the full credential dict (secrets + metadata merged).
    Handles both encrypted and legacy plaintext formats.
    """
    from ..models.models import EdgeProviderAccount
    
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == provider_id
    ).first()
    
    if not provider:
        return {}
    
    # Decrypt (or parse) the credentials
    creds = decrypt_credentials(str(provider.provider_credentials or "{}"))
    
    # Merge with metadata if available
    if provider.provider_metadata:
        try:
            metadata = json.loads(str(provider.provider_metadata))
            creds.update(metadata)
        except (json.JSONDecodeError, TypeError):
            pass
    
    return creds
