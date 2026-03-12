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
    
    If FERNET_KEY is not set, generates a key and auto-persists it
    to fastapi-backend/.env so it survives restarts and --reload.
    """
    key = os.environ.get("FERNET_KEY")
    if not key:
        key = Fernet.generate_key().decode()
        os.environ["FERNET_KEY"] = key
        # Auto-persist to .env so the key survives restarts
        _persist_key_to_env(key)
        warnings.warn(
            f"FERNET_KEY not set! Auto-generated and saved to .env: {key[:8]}... "
            "This key will persist across restarts.",
            RuntimeWarning,
            stacklevel=2,
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def _persist_key_to_env(key: str) -> None:
    """Write FERNET_KEY to .env file (create or append)."""
    # Find .env relative to the fastapi-backend directory
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
    try:
        # Read existing content to avoid duplicates
        existing = ""
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                existing = f.read()
        
        if "FERNET_KEY=" in existing:
            return  # Already set, don't overwrite
        
        with open(env_path, "a") as f:
            if existing and not existing.endswith("\n"):
                f.write("\n")
            f.write(f"# Auto-generated encryption key — do NOT delete or change\n")
            f.write(f"FERNET_KEY={key}\n")
    except OSError:
        pass  # Can't write .env (e.g. read-only filesystem), key only lives in memory


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
    # ── Edge Providers (deploy targets) ──
    "cloudflare": {"api_token"},
    "supabase":   {"access_token", "anon_key", "service_role_key"},
    "vercel":     {"api_token"},
    "netlify":    {"api_token"},
    "deno":       {"access_token"},
    "upstash":    {"api_token", "email"},
    "docker":     set(),               # Docker uses no external credentials
    # ── Data Sources ──
    "supabase_db":       {"service_role_key", "anon_key", "password"},
    "postgres":          {"password"},
    "neon":              {"api_key", "password"},
    "mysql":             {"password"},
    "wordpress_rest":    {"app_password"},
    # ── Edge Infrastructure (Connected Account = management API token) ──
    "turso":         {"databases"},     # manual registry: JSON blob of DB entries
    "upstash_redis": {"cache_token"},
    "qstash":        {"queue_token", "signing_key", "next_signing_key"},
}

PROVIDER_METADATA_KEYS: dict[str, set[str]] = {
    # ── Edge Providers (deploy targets) ──
    "cloudflare": {"account_id"},
    "supabase":   {"project_ref", "api_url"},
    "vercel":     set(),
    "netlify":    {"site_id"},
    "deno":       {"org_id"},
    "upstash":    set(),
    "docker":     set(),
    # ── Data Sources ──
    "supabase_db":       {"api_url", "project_ref"},
    "postgres":          {"host", "port", "database", "username"},
    "neon":              {"host", "database", "project_id"},
    "mysql":             {"host", "port", "database", "username"},
    "wordpress_rest":    {"base_url", "username", "api_mode"},
    # ── Edge Infrastructure ──
    "turso":         set(),             # all data in encrypted blob
    "upstash_redis": {"cache_url"},
    "qstash":        {"queue_url"},
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


# ── Single-Value Encrypt/Decrypt Helpers ──────────────────────────────
# For encrypting individual model columns (passwords, tokens, API keys)
# rather than full JSON credential dicts.

def encrypt_field(value: str | None) -> str | None:
    """Encrypt a single string value for storage in a model column."""
    if not value:
        return value
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_field(value: str | None) -> str | None:
    """Decrypt a single string value from a model column.
    
    Falls back to returning the raw value if decryption fails
    (handles legacy plaintext data gracefully).
    """
    if not value:
        return value
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except Exception:
        return value  # Legacy plaintext fallback


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
