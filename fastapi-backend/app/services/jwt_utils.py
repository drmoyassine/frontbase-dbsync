"""
JWT utilities for cloud-mode authentication.

Provides helpers to create and decode JSON Web Tokens carrying
user identity, tenant context, and role information.
Only used when DEPLOYMENT_MODE=cloud.

Uses python-jose (already in requirements.txt) rather than PyJWT.
"""

import os
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError  # python-jose

SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production")
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
    now = datetime.utcnow()
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
