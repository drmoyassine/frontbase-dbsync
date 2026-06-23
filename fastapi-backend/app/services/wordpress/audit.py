"""
Audit logging for WordPress import operations.

Provides structured audit logging for security compliance and debugging.
Logs include: who started what import, when, the result, and any errors.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class AuditEventType(str, Enum):
    """Types of audit events for WordPress imports."""

    IMPORT_STARTED = "wordpress.import.started"
    IMPORT_COMPLETED = "wordpress.import.completed"
    IMPORT_FAILED = "wordpress.import.failed"
    IMPORT_CANCELLED = "wordpress.import.cancelled"
    IMPORT_PROGRESS = "wordpress.import.progress"
    DATASOURCE_ACCESS = "wordpress.datasource.access"
    DISCOVERY_CALLED = "wordpress.discovery.called"


@dataclass
class AuditEvent:
    """Structured audit event."""

    event_type: AuditEventType
    tenant_id: Optional[str]
    user_id: Optional[str]
    datasource_id: str
    import_id: Optional[str] = None
    status: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    error_message: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    def to_log_dict(self) -> Dict[str, Any]:
        """Convert to dict for structured logging."""
        return {
            "event": self.event_type.value,
            "tenant_id": self.tenant_id,
            "user_id": self.user_id,
            "datasource_id": self.datasource_id,
            "import_id": self.import_id,
            "status": self.status,
            "details": self.details,
            "timestamp": self.timestamp,
            "error": self.error_message,
            "ip": self.ip_address,
            "ua": self.user_agent,
        }


class WordPressAuditLogger:
    """Audit logger for WordPress import operations.

    Logs go to the 'wordpress.audit' logger with structured JSON format.
    Configure a separate handler/file in production to keep audit logs
    separate from application logs.
    """

    def __init__(self) -> None:
        self._audit_logger = logging.getLogger("wordpress.audit")

    def log_import_started(
        self,
        tenant_id: Optional[str],
        user_id: Optional[str],
        datasource_id: str,
        import_id: str,
        options: Dict[str, Any],
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Log when an import is started."""
        event = AuditEvent(
            event_type=AuditEventType.IMPORT_STARTED,
            tenant_id=tenant_id,
            user_id=user_id,
            datasource_id=datasource_id,
            import_id=import_id,
            status="pending",
            details={"options": options},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self._log(event)

    def log_import_completed(
        self,
        tenant_id: Optional[str],
        user_id: Optional[str],
        datasource_id: str,
        import_id: str,
        result: Dict[str, Any],
        duration_seconds: float,
        ip_address: Optional[str] = None,
    ) -> None:
        """Log when an import completes successfully."""
        event = AuditEvent(
            event_type=AuditEventType.IMPORT_COMPLETED,
            tenant_id=tenant_id,
            user_id=user_id,
            datasource_id=datasource_id,
            import_id=import_id,
            status="completed",
            details={
                "total_records": result.get("totalRecords"),
                "successful": result.get("successful"),
                "failed": result.get("failed"),
                "duration_seconds": duration_seconds,
                "post_types": list(result.get("postTypes", {}).keys()),
            },
            ip_address=ip_address,
        )
        self._log(event)

    def log_import_failed(
        self,
        tenant_id: Optional[str],
        user_id: Optional[str],
        datasource_id: str,
        import_id: str,
        error_message: str,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        """Log when an import fails."""
        event = AuditEvent(
            event_type=AuditEventType.IMPORT_FAILED,
            tenant_id=tenant_id,
            user_id=user_id,
            datasource_id=datasource_id,
            import_id=import_id,
            status="failed",
            details=details or {},
            error_message=error_message,
            ip_address=ip_address,
        )
        self._log(event)

    def log_datasource_access(
        self,
        tenant_id: Optional[str],
        user_id: Optional[str],
        datasource_id: str,
        action: str,
        ip_address: Optional[str] = None,
    ) -> None:
        """Log datasource access (for security monitoring)."""
        event = AuditEvent(
            event_type=AuditEventType.DATASOURCE_ACCESS,
            tenant_id=tenant_id,
            user_id=user_id,
            datasource_id=datasource_id,
            details={"action": action},
            ip_address=ip_address,
        )
        self._log(event)

    def log_discovery_called(
        self,
        tenant_id: Optional[str],
        user_id: Optional[str],
        datasource_id: str,
        ip_address: Optional[str] = None,
    ) -> None:
        """Log when WordPress discovery is called."""
        event = AuditEvent(
            event_type=AuditEventType.DISCOVERY_CALLED,
            tenant_id=tenant_id,
            user_id=user_id,
            datasource_id=datasource_id,
            details={"action": "discover"},
            ip_address=ip_address,
        )
        self._log(event)

    def _log(self, event: AuditEvent) -> None:
        """Internal logging method."""
        log_dict = event.to_log_dict()
        # Use structured logging (JSON format)
        self._audit_logger.info(
            "WordPress audit event",
            extra={"audit_event": log_dict}
        )


# Global audit logger instance
_audit_logger = WordPressAuditLogger()


def get_audit_logger() -> WordPressAuditLogger:
    """Get the global audit logger instance."""
    return _audit_logger


def extract_client_info(request: Any) -> tuple[Optional[str], Optional[str]]:
    """Extract IP address and user agent from a FastAPI request.

    Returns:
        Tuple of (ip_address, user_agent)
    """
    ip_address = None
    user_agent = None

    try:
        # Get IP from X-Forwarded-For (reverse proxy) or direct client
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            ip_address = forwarded_for.split(",")[0].strip()
        else:
            ip_address = request.client.host if request.client else None

        user_agent = request.headers.get("user-agent")
    except Exception:
        # Don't fail logging if we can't extract client info
        pass

    return ip_address, user_agent
