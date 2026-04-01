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
    
    Key resolution order:
      1. FERNET_KEY environment variable (set by Docker/platform)
      2. Persistent volume .env at /app/data/.env (survives container recreation)
      3. Local .env at fastapi-backend/.env (dev fallback)
      4. Auto-generate + persist to the best available location
    """
    key = os.environ.get("FERNET_KEY")
    
    # If not in env, try loading from persistent volume (Docker deployments)
    if not key:
        key = _load_key_from_env_file(_persistent_env_path())
    
    # If still not found, try local dev .env
    if not key:
        key = _load_key_from_env_file(_local_env_path())
    
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
    else:
        os.environ["FERNET_KEY"] = key  # Cache in env for child processes
    
    return Fernet(key.encode() if isinstance(key, str) else key)


def _persistent_env_path() -> str:
    """Path on Docker persistent volume — survives container re-creation."""
    return "/app/data/.env"


def _local_env_path() -> str:
    """Path relative to fastapi-backend directory — for local dev."""
    return os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")


def _load_key_from_env_file(env_path: str) -> str | None:
    """Read FERNET_KEY from an .env file, returns None if not found."""
    try:
        if not os.path.exists(env_path):
            return None
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith("FERNET_KEY=") and not line.startswith("#"):
                    return line.split("=", 1)[1].strip()
    except OSError:
        pass
    return None


def _write_key_to_env_file(key: str, env_path: str) -> bool:
    """Append FERNET_KEY to an .env file. Returns True on success."""
    try:
        existing = ""
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                existing = f.read()

        if "FERNET_KEY=" in existing:
            return True  # Already set, don't overwrite

        with open(env_path, "a") as f:
            if existing and not existing.endswith("\n"):
                f.write("\n")
            f.write(f"# Auto-generated encryption key — do NOT delete or change\n")
            f.write(f"FERNET_KEY={key}\n")
        return True
    except OSError:
        return False


def _persist_key_to_env(key: str) -> None:
    """Write FERNET_KEY to the best available .env file.
    
    Priority: persistent Docker volume (/app/data/.env) first,
    then local dev .env as fallback.
    """
    # Try persistent volume first (Docker production)
    if os.path.isdir("/app/data"):
        if _write_key_to_env_file(key, _persistent_env_path()):
            return
    
    # Fallback: local dev .env
    _write_key_to_env_file(key, _local_env_path())


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
    "supabase":   {"access_token", "anon_key", "service_role_key", "jwt_secret"},
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
    if provider.provider_metadata is not None:
        try:
            metadata = json.loads(str(provider.provider_metadata))
            creds.update(metadata)
        except (json.JSONDecodeError, TypeError):
            pass
    
    return creds
