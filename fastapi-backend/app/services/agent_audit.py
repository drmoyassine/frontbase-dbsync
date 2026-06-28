"""Audit logging for Workspace Agent tool calls.

Writes an append-only ``agent_tool_audit`` row for every tool invocation so there
is a redeploy-surviving, centralized record of what the agent did — especially
for destructive operations. Records are scoped by tenant + project + user, and
the args/result are scrubbed of credential-shaped values before persistence.

Used by the tool implementations in ``agent_tools.py`` via the ``audit()``
context manager / helper.
"""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..database.config import SessionLocal
from ..models.models import AgentToolAudit
from .agent_permissions import ToolContext

logger = logging.getLogger(__name__)

# Cap the size of persisted args/result blobs so a runaway tool can't bloat the table.
_MAX_BLOB_CHARS = 4096

# Keys whose values are scrubbed from any persisted blob (credential-shaped).
# Expanded to catch connection strings, client secrets, webhook secrets, signing keys, etc.
_SENSITIVE_KEY_RE = re.compile(
    r"(?i)(password|passwd|secret|token|api[_-]?key|auth|credential|private[_-]?key|access[_-]?key|refresh[_-]?token|connection[_-]?string|client[_-]?secret|webhook[_-]?secret|signing[_-]?key)"
)


def _scrub(value: Any) -> Any:
    """Recursively replace sensitive values with '***REDACTED***'."""
    if isinstance(value, dict):
        return {k: ("***REDACTED***" if _SENSITIVE_KEY_RE.search(str(k)) else _scrub(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    if isinstance(value, str) and _SENSITIVE_KEY_RE.search(value):
        # Only redact if the whole string looks like a secret, not a sentence.
        # Lowered threshold from 16 to 8 chars to catch shorter tokens.
        if len(value) >= 8 and " " not in value:
            return "***REDACTED***"
    return value


def _truncate(value: Any) -> str:
    s = value if isinstance(value, str) else json.dumps(value, default=str)
    if len(s) <= _MAX_BLOB_CHARS:
        return s
    return json.dumps({"_truncated": True, "_original_length": len(s), "data": s[:_MAX_BLOB_CHARS]})


def log_tool_call(
    ctx: ToolContext,
    tool_name: str,
    *,
    args: Optional[dict[str, Any]] = None,
    result: Any = None,
    status: str = "success",
    error_message: Optional[str] = None,
    is_destructive: bool = False,
    duration_ms: Optional[int] = None,
) -> None:
    """Persist one audit row. Best-effort: never raises into the tool path."""
    try:
        db = SessionLocal()
        try:
            row = AgentToolAudit(
                id=str(uuid.uuid4()),
                tenant_id=ctx.tenant_id,
                project_id=ctx.project_id,
                user_id=ctx.user_id,
                profile_slug=ctx.profile_slug,
                tool_name=tool_name,
                is_destructive=is_destructive,
                args=_truncate(_scrub(args)) if args else None,
                result_summary=_truncate(_scrub(result)) if result is not None else None,
                status=status,
                error_message=(str(error_message)[:500] if error_message else None),
                duration_ms=duration_ms,
                created_at=datetime.now(timezone.utc).isoformat(),
            )
            db.add(row)
            db.commit()
        finally:
            db.close()
    except Exception:  # pragma: no cover — audit must never break a tool call
        logger.warning("[agent_audit] failed to log tool call '%s'", tool_name, exc_info=True)


class AuditSpan:
    """Context manager that times a tool call and writes the audit row on exit."""

    def __init__(self, ctx: ToolContext, tool_name: str, *, is_destructive: bool = False):
        self.ctx = ctx
        self.tool_name = tool_name
        self.is_destructive = is_destructive
        self._start = 0.0
        self.args: Optional[dict[str, Any]] = None

    def __enter__(self) -> "AuditSpan":
        self._start = time.monotonic()
        return self

    def __exit__(self, exc_type, exc, _tb) -> bool:
        duration_ms = int((time.monotonic() - self._start) * 1000)
        if exc is not None:
            log_tool_call(
                self.ctx, self.tool_name,
                args=self.args, result=None,
                status="error", error_message=str(exc),
                is_destructive=self.is_destructive, duration_ms=duration_ms,
            )
            return False  # propagate
        log_tool_call(
            self.ctx, self.tool_name,
            args=self.args, result={"ok": True},
            status="success", is_destructive=self.is_destructive, duration_ms=duration_ms,
        )
        return False
