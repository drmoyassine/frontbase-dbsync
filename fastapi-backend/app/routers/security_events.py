"""
Security Events router — read-only audit surface over ``security_events``.

The table itself is populated by ``services.security_logger.log_security_event``
(blocked SSRF attempts, upstream auth failures, credential-resolution
failures). This router exposes a tenant-scoped, paginated, filterable list so
operators can audit them from the dashboard.

Tenant isolation: a request with a ``tenant_id`` sees only its own events; a
request without one (master admin / self-hosted) sees only NULL-tenant events.
A tenant can therefore never read another tenant's audit trail.
"""

from __future__ import annotations

from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func

from ..database.config import SessionLocal
from ..database.utils import get_project
from ..middleware.tenant_context import TenantContext, get_tenant_context
from ..models.models import SecurityEvent

from ..schemas.op_responses import ListSecurityEventsResult, SecurityEventsSummaryResult
router = APIRouter(prefix="/api/security-events", tags=["security-events"])

_VALID_SEVERITIES = {"low", "medium", "high", "critical"}
_MAX_LIMIT = 500


@router.get("/", response_model=ListSecurityEventsResult)
async def list_security_events(
    event_type: Optional[str] = Query(None, description="Filter by event type (e.g. ssrf_attempt_blocked)"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    start_date: Optional[str] = Query(None, description="ISO-8601 lower bound on created_at (inclusive)"),
    end_date: Optional[str] = Query(None, description="ISO-8601 upper bound on created_at (inclusive)"),
    limit: int = Query(100, ge=1, le=_MAX_LIMIT),
    offset: int = Query(0, ge=0),
    ctx: Optional[TenantContext] = Depends(get_tenant_context),
):
    """List security events for the calling tenant (read-only).

    Filters: event_type, severity, and a created_at date window. ``created_at``
    is stored as an ISO-8601 UTC string, so lexicographic comparison is
    chronological and the date filters accept plain ``YYYY-MM-DD`` or full
    timestamps.
    """
    if severity is not None and severity not in _VALID_SEVERITIES:
        raise HTTPException(400, f"severity must be one of {sorted(_VALID_SEVERITIES)}")

    db = SessionLocal()
    try:
        query = db.query(SecurityEvent)

        # ── Tenant isolation ──────────────────────────────────────────────
        # Tenanted requests see only their events; tenant-less requests
        # (master / self-hosted) see only NULL-tenant events. No path returns
        # another tenant's rows.
        if ctx and ctx.tenant_id:
            # Confirm the tenant resolves to a real project before revealing
            # its events — mirrors the guard used across the edge routers.
            if get_project(db, ctx) is None:
                return {"events": [], "total": 0, "limit": limit, "offset": offset}
            query = query.filter(SecurityEvent.tenant_id == str(ctx.tenant_id))
        else:
            query = query.filter(SecurityEvent.tenant_id.is_(None))

        # ── Optional filters ──────────────────────────────────────────────
        if event_type:
            query = query.filter(SecurityEvent.event_type == event_type)
        if severity:
            query = query.filter(SecurityEvent.severity == severity)
        if start_date:
            query = query.filter(SecurityEvent.created_at >= start_date)
        if end_date:
            query = query.filter(SecurityEvent.created_at <= end_date)

        query = query.order_by(SecurityEvent.created_at.desc())
        total = query.count()
        events = query.offset(offset).limit(limit).all()

        return {
            "events": [
                {
                    "id": str(e.id),
                    "event_type": e.event_type,
                    "severity": e.severity,
                    "tenant_id": e.tenant_id,
                    "project_id": e.project_id,
                    "user_id": e.user_id,
                    "source_ip": e.source_ip,
                    "details": e.details,
                    "created_at": e.created_at,
                }
                for e in events
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    finally:
        db.close()


@router.get("/summary", response_model=SecurityEventsSummaryResult)
async def security_events_summary(
    ctx: Optional[TenantContext] = Depends(get_tenant_context),
):
    """Lightweight counts by severity for dashboard badges/header chips.

    Returns ``{total, by_severity: {low, medium, high, critical}}`` scoped to
    the calling tenant (same isolation rules as the list endpoint).
    """
    db = SessionLocal()
    try:
        query = db.query(SecurityEvent)
        if ctx and ctx.tenant_id:
            if get_project(db, ctx) is None:
                base = {"low": 0, "medium": 0, "high": 0, "critical": 0}
                return {"total": 0, "by_severity": base}
            query = query.filter(SecurityEvent.tenant_id == str(ctx.tenant_id))
        else:
            query = query.filter(SecurityEvent.tenant_id.is_(None))

        by_severity = {"low": 0, "medium": 0, "high": 0, "critical": 0}
        total = 0
        rows = (
            query.with_entities(SecurityEvent.severity, func.count(SecurityEvent.id))
            .group_by(SecurityEvent.severity)
            .all()
        )
        for sev, cnt in rows:
            if sev in by_severity:
                by_severity[sev] = int(cnt)
            total += int(cnt)
        return {"total": total, "by_severity": by_severity}
    finally:
        db.close()
