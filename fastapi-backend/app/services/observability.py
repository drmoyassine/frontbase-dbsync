"""
Backend observability integration point.

Sentry is initialized once at startup in ``main.py`` (cloud mode only, no-op when
``SENTRY_DSN`` is unset so self-host builds ship telemetry-free). This module
exposes the per-request identity hook so the tenant-context resolver can tag
error events with the acting user/tenant, plus a small capture helper.

Everything here is defensive: a Sentry failure can NEVER break the auth or
request path — all calls are guarded and short-circuit when Sentry is off.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

_ENABLED: Optional[bool] = None


def is_sentry_enabled() -> bool:
    """Cached check for whether Sentry is configured (SENTRY_DSN present)."""
    global _ENABLED
    if _ENABLED is None:
        _ENABLED = bool(os.getenv("SENTRY_DSN"))
    return _ENABLED


def set_request_user(
    *,
    user_id: str,
    email: str,
    tenant_id: Optional[str],
    role: str,
) -> None:
    """Attach identity to the current Sentry request scope.

    Safe to call on every request — no-op when Sentry is off, and a Sentry
    failure is swallowed so it can never affect request handling. Sentry's ASGI
    integration maintains a per-request scope, so this tags only the current
    request's events.
    """
    if not is_sentry_enabled():
        return
    try:
        import sentry_sdk

        sentry_sdk.set_user(
            {
                "id": tenant_id or user_id,
                "email": email or None,
            }
        )
        sentry_sdk.set_tag("tenant_id", tenant_id or "unknown")
        sentry_sdk.set_tag("role", role or "unknown")
    except Exception:
        logger.debug("Sentry set_request_user failed", exc_info=True)


def capture_exception(error: BaseException, **extra: Any) -> None:
    """Report a caught exception to Sentry. No-op when off."""
    if not is_sentry_enabled():
        return
    try:
        import sentry_sdk

        if extra:
            sentry_sdk.capture_exception(error, extras=extra)
        else:
            sentry_sdk.capture_exception(error)
    except Exception:
        logger.debug("Sentry capture_exception failed", exc_info=True)
