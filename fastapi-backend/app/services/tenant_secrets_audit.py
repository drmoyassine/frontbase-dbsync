"""
Tenant Secrets Audit Service — log + query control-plane operations on
shared/community engines.

Community engines store per-tenant secret blobs (datasources, auth, …)
encrypted in the worker's state-DB, pushed by the control plane. This module is
the centralized audit trail for those operations: every push / delete / rotate
is recorded here so operators can answer "who pushed what datasources when?"
and track failed rotations.

Why the backend DB (not the worker state-DB):
  - The control plane is the authority for tenant secrets (it pushes them).
  - Workers are ephemeral — audit logs must survive redeployments.
  - Multi-tenant SaaS needs a unified view across all workers.

What is NOT logged (to avoid bloat): successful per-request reads, cache
hits/misses, and normal operations. Only control-plane mutations (push/delete/
rotate) and their outcomes are recorded — a few hundred to low-thousands of rows
per engine per year.

See docs/plans/phase-3-async-accessors.md (Part 2).
"""

import json
import uuid
from datetime import datetime, UTC
from typing import Any, Literal

from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..models.edge import TenantSecretAudit

Operation = Literal['push', 'delete', 'rotate']
Status = Literal['success', 'failure']


def _now_iso() -> str:
    """UTC ISO-8601 timestamp with a trailing 'Z' (matches engine_config usage)."""
    return datetime.now(UTC).isoformat() + "Z"


def log_tenant_secret_audit(
    db: Session,
    engine_id: str,
    operation: Operation,
    tenant_slug: str,
    kind: str,
    status: Status,
    *,
    error: str | None = None,
    metadata: dict[str, Any] | None = None,
    initiated_by: str = 'control_plane',
    initiated_by_user_id: str | None = None,
) -> TenantSecretAudit:
    """Append one audit row describing a control-plane tenant-secrets operation.

    Never raises: a logging failure is swallowed and logged so it can never
    break the operation it is recording (the push/delete/rotate must still
    succeed/fail on its own merits). Returns the persisted row, or None on a
    logging error.

    SECURITY NOTE: initiated_by_user_id MUST be validated against the authenticated
    user before calling this function. For API-initiated operations (initiated_by='api'),
    only set this parameter if you've verified it matches the current request's user.
    For control-plane operations (initiated_by='control_plane'), leave it as None.

    NOTE: Invalid tenant_slug or kind values will raise ValueError (caller error).
    """
    # Validate inputs FIRST (these are caller errors, not DB/logging failures).
    if not isinstance(tenant_slug, str) or tenant_slug == '':
        raise ValueError(f"Invalid tenant_slug: {tenant_slug!r}")

    if not isinstance(kind, str) or kind == '':
        raise ValueError(f"Invalid kind: {kind!r}")

    try:

        # Cap error_message at the column width to avoid a DB-level truncation
        # error on verbose upstream failures.
        error_message = (error[:500]) if error else None
        row = TenantSecretAudit(
            id=uuid.uuid4().hex,
            operation=operation,
            tenant_slug=tenant_slug,
            kind=kind,
            status=status,
            error_message=error_message,
            engine_id=engine_id,
            initiated_by=initiated_by,
            initiated_by_user_id=initiated_by_user_id,
            timestamp=_now_iso(),
            audit_metadata=json.dumps(metadata) if metadata else None,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row
    except Exception as e:  # never let auditing break the audited operation
        try:
            db.rollback()
        except Exception:
            pass
        print(f"[TenantSecretAudit] Failed to log {operation} for "
              f"{tenant_slug}/{kind} on engine {engine_id}: {e}")
        return None  # type: ignore[return-value]


def query_tenant_secret_audit(
    db: Session,
    engine_id: str,
    *,
    tenant_slug: str | None = None,
    operation: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[TenantSecretAudit]:
    """Return audit rows for an engine, newest first, with optional filters."""
    q = db.query(TenantSecretAudit).filter(TenantSecretAudit.engine_id == engine_id)
    if tenant_slug:
        q = q.filter(TenantSecretAudit.tenant_slug == tenant_slug)
    if operation:
        q = q.filter(TenantSecretAudit.operation == operation)
    if status:
        q = q.filter(TenantSecretAudit.status == status)
    return q.order_by(desc(TenantSecretAudit.timestamp)).limit(max(1, min(limit, 500))).all()


def serialize_audit_row(row: TenantSecretAudit) -> dict[str, Any]:
    """ORM row → JSON-safe dict for API responses."""
    metadata_obj: Any = None
    if row.audit_metadata is not None:
        try:
            metadata_obj = json.loads(str(row.audit_metadata))
        except (json.JSONDecodeError, TypeError):
            metadata_obj = row.audit_metadata
    return {
        "id": row.id,
        "operation": row.operation,
        "tenant_slug": row.tenant_slug,
        "kind": row.kind,
        "status": row.status,
        "error_message": row.error_message,
        "engine_id": row.engine_id,
        "initiated_by": row.initiated_by,
        "initiated_by_user_id": row.initiated_by_user_id,
        "timestamp": row.timestamp,
        "metadata": metadata_obj,
    }
