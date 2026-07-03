"""
JWT utilities for cloud-mode authentication.

Provides helpers to create and decode JSON Web Tokens carrying
user identity, tenant context, and role information.
Only used when DEPLOYMENT_MODE=cloud.

Uses python-jose (already in requirements.txt) rather than PyJWT.
"""

import os
import secrets
import logging
from datetime import datetime, timedelta, UTC
from typing import Optional

from jose import jwt, JWTError  # python-jose

_logger = logging.getLogger(__name__)


def _resolve_secret_key() -> str:
    """Resolve SECRET_KEY: env var > persisted file > auto-generate and persist."""
    # 1. Explicit env var takes priority
    env_key = os.getenv("SECRET_KEY", "").strip()
    if env_key:
        return env_key

    # 2. Check for a previously auto-generated key on the data volume
    data_dir = "/app/data" if os.path.isdir("/app/data") else "."
    key_file = os.path.join(data_dir, ".secret_key")
    if os.path.isfile(key_file):
        stored = open(key_file).read().strip()
        if stored:
            _logger.info("[JWT] Using persisted SECRET_KEY from %s", key_file)
            return stored

    # 3. Auto-generate, persist, and return
    generated = secrets.token_hex(32)
    try:
        with open(key_file, "w") as f:
            f.write(generated)
        _logger.info("[JWT] Auto-generated SECRET_KEY and persisted to %s", key_file)
    except OSError as e:
        _logger.warning("[JWT] Could not persist SECRET_KEY to %s: %s (using ephemeral key)", key_file, e)
    return generated


SECRET_KEY: str = _resolve_secret_key()
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7


def create_token(
    user_id: str,
    email: str,
    tenant_id: Optional[str] = None,
    tenant_slug: Optional[str] = None,
    role: str = "owner",
    is_master: bool = False,
) -> str:
    """Create a signed JWT with user + tenant claims.

    Args:
        user_id:     UUID of the user.
        email:       User email (included for convenience).
        tenant_id:   UUID of the active tenant (None for master admin).
        tenant_slug: URL slug of the tenant (None for master admin).
        role:        Membership role — owner | admin | editor | viewer | master.
        is_master:   True when the caller is the platform master admin.

    Returns:
        Encoded JWT string.
    """
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "email": email,
        "tenant_id": tenant_id,
        "tenant_slug": tenant_slug,
        "role": role,
        "is_master": is_master,
        "iat": now,
        "exp": now + timedelta(days=JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT.

    Returns:
        Dict of claims.

    Raises:
        jose.JWTError:  Token is expired, malformed, or signature invalid.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
