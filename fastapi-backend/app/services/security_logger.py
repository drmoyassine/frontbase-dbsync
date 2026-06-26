"""
Security Event Logging.

Records security-relevant events (blocked SSRF attempts, auth failures on
upstream connections, credential-resolution failures) for monitoring and
auditing.

Design:
  - **Primary path**: Python `logging` (always works, no DB dependency).
  - **Secondary path**: a best-effort row in the `security_events` table.
    Wrapped in try/except so a missing/inaccessible table degrades silently to
    logging only — the connection tester must NEVER fail because the audit write
    failed.

The `SecurityEvent` model is registered on `Base.metadata` and re-exported from
`app.models.models`, so the startup `Base.metadata.create_all(...)` provisions
the table automatically on fresh and existing deployments (mirrors how every
other model in this repo gets its table). All model/DB imports inside
`log_security_event` are lazy to avoid circular imports.
"""

import logging
import uuid
from datetime import datetime, UTC
from typing import Any, Optional

from sqlalchemy import Column, String, JSON

from ..database.config import Base

logger = logging.getLogger(__name__)


class SecurityEvent(Base):
    """Security event log for auditing and monitoring."""
    __tablename__ = "security_events"

    id = Column(String, primary_key=True)
    event_type = Column(String(80), nullable=False, index=True)
    severity = Column(String(20), nullable=False)  # 'low' | 'medium' | 'high' | 'critical'
    tenant_id = Column(String, nullable=True, index=True)
    project_id = Column(String, nullable=True)
    user_id = Column(String, nullable=True)
    source_ip = Column(String, nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(String, nullable=False, index=True)  # ISO-8601 UTC string


# ─── Event type constants ───────────────────────────────────────────────────
SSRF_ATTEMPT_BLOCKED = "ssrf_attempt_blocked"
VECTOR_CONNECTION_FAILED = "vector_connection_failed"
VECTOR_AUTH_FAILED = "vector_auth_failed"
CREDENTIAL_RESOLUTION_FAILED = "credential_resolution_failed"


def log_security_event(
    event_type: str,
    severity: str = "medium",
    details: Optional[dict[str, Any]] = None,
    ctx: Optional[object] = None,
    source_ip: Optional[str] = None,
) -> None:
    """Log a security event.

    Always emits to the Python logger; additionally attempts a best-effort DB
    insert. Any failure in the DB path is swallowed so callers (notably the
    SSRF guard in the connection tester) are unaffected.

    Args:
        event_type: one of the ``*_BLOCKED`` / ``*_FAILED`` constants above.
        severity: 'low' | 'medium' | 'high' | 'critical'.
        details: arbitrary JSON-serializable context.
        ctx: a TenantContext (tenant_id/project_id read defensively).
        source_ip: originating IP if known.
    """
    # Pull tenant/project defensively — ctx shape varies across middleware.
    tenant_id = getattr(ctx, "tenant_id", None) if ctx else None
    project_id = getattr(ctx, "project_id", None) if ctx else None

    now = datetime.now(UTC).isoformat() + "Z"
    safe_details = details or {}

    # 1. Always emit to Python logging (reliable path).
    log_message = (
        f"SecurityEvent[{event_type}] severity={severity} "
        f"tenant={tenant_id} ip={source_ip} details={safe_details}"
    )
    if severity in ("high", "critical"):
        logger.warning(log_message)
    else:
        logger.info(log_message)

    # 2. Best-effort DB row (never raises into the caller).
    try:
        from ..database.config import SessionLocal
        db = SessionLocal()
        try:
            event = SecurityEvent(
                id=str(uuid.uuid4()),
                event_type=event_type,
                severity=severity,
                tenant_id=str(tenant_id) if tenant_id else None,
                project_id=str(project_id) if project_id else None,
                source_ip=str(source_ip) if source_ip else None,
                details=safe_details,
                created_at=now,
            )
            db.add(event)
            db.commit()
        finally:
            db.close()
    except Exception as e:  # noqa: BLE001 — audit write must never break callers
        logger.debug(f"SecurityEvent DB write skipped: {e}")
