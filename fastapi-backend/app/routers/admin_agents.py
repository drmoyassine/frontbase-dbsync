"""Admin Agents Router — master-admin Workspace Agent configuration.

Registered only in cloud mode, mounted at ``/api/admin/agents``. All endpoints
require master admin (``require_master_admin``). Covers:

  * Global Workspace Agent config (enabled flag, quota-exceeded action)
  * The shared LLM provider (mark one EdgeProviderAccount as the default for all
    tenants — stored on ``provider_metadata.is_workspace_default``)
  * Per-tenant credit balances + manual grants
  * Usage analytics aggregated from ``agent_credit_usage_log``
  * Manual daily-reset trigger (also runs on the Celery beat at 00:05 UTC)

NOTE: These endpoints are consumed by the enhanced Tenants Directory page, not
a separate Workspace Agent configuration page. It does NOT touch Edge Agents.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.config import get_db
from app.models.models import (
    AgentCreditBalance,
    AgentCreditUsageLog,
    EdgeProviderAccount,
    Tenant,
)
from app.routers.tenant_admin import require_master_admin
from app.services import agent_quota

logger = logging.getLogger(__name__)

router = APIRouter()

# Providers usable as the shared Workspace Agent LLM (mirrors agent_executor).
LLM_PROVIDER_TYPES = ("openai", "anthropic", "google", "ollama", "workers_ai")


def _provider_meta(p: EdgeProviderAccount) -> dict[str, Any]:
    try:
        return json.loads(str(p.provider_metadata)) if p.provider_metadata else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def _provider_view(p: EdgeProviderAccount) -> dict[str, Any]:
    meta = _provider_meta(p)
    return {
        "id": str(p.id),
        "name": str(p.name),
        "provider": str(p.provider),
        "is_active": bool(p.is_active),
        "is_workspace_default": bool(meta.get("is_workspace_default")),
        "has_credentials": bool(p.provider_credentials),
        "created_at": str(p.created_at),
    }


# ---------------------------------------------------------------------------
# Global config
# ---------------------------------------------------------------------------

class AgentConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    quota_exceeded_action: Optional[str] = None  # block | warn


@router.get("/config")
async def get_agent_config(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    cfg = agent_quota.get_agent_global_config(db)
    # Surface the currently-defaulted shared provider, if any.
    default_provider = next(
        (
            _provider_view(p)
            for p in db.query(EdgeProviderAccount)
            .filter(EdgeProviderAccount.provider.in_(LLM_PROVIDER_TYPES))
            .filter(EdgeProviderAccount.is_active == True)  # noqa: E712
            .all()
            if _provider_meta(p).get("is_workspace_default")
        ),
        None,
    )
    return {
        "enabled": bool(cfg.get("enabled", True)),
        "quota_exceeded_action": cfg.get("quota_exceeded_action", agent_quota.DEFAULT_QUOTA_EXCEEDED_ACTION),
        "default_provider": default_provider,
    }


@router.put("/config")
async def update_agent_config(
    body: AgentConfigUpdate,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    cfg = agent_quota.set_agent_global_config(
        db,
        {"enabled": body.enabled, "quota_exceeded_action": body.quota_exceeded_action},
    )
    return {"config": cfg}


# ---------------------------------------------------------------------------
# Shared LLM provider
# ---------------------------------------------------------------------------

@router.get("/providers")
async def list_agent_providers(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """List all LLM-capable providers with their workspace-default flag.

    Uses the same scoping as edge_providers: master admin sees unassigned
    accounts (project_id == None) that can be marked as the shared default.
    """
    providers = (
        db.query(EdgeProviderAccount)
        .filter(EdgeProviderAccount.provider.in_(LLM_PROVIDER_TYPES))
        .filter(EdgeProviderAccount.is_active == True)  # noqa: E712
        .filter(EdgeProviderAccount.project_id.is_(None))  # Only unassigned (master admin scope)
        .order_by(EdgeProviderAccount.created_at.desc())
        .all()
    )
    return {"providers": [_provider_view(p) for p in providers]}


@router.post("/providers/{provider_id}/set-default")
async def set_default_agent_provider(
    provider_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """Mark one provider as the shared Workspace Agent default (clears others).

    All tenant Workspace Agent turns resolve this provider (via the executor's
    flagged-default fallback). Master admin's API costs scale with total usage.
    """
    target = (
        db.query(EdgeProviderAccount)
        .filter(EdgeProviderAccount.id == provider_id)
        .filter(EdgeProviderAccount.provider.in_(LLM_PROVIDER_TYPES))
        .first()
    )
    if target is None:
        raise HTTPException(status_code=404, detail="LLM provider not found")
    if not bool(target.is_active):
        raise HTTPException(status_code=400, detail="Provider is inactive")

    # Clear existing flags across all LLM providers.
    for p in db.query(EdgeProviderAccount).filter(EdgeProviderAccount.provider.in_(LLM_PROVIDER_TYPES)).all():
        meta = _provider_meta(p)
        if meta.get("is_workspace_default"):
            meta["is_workspace_default"] = False
            p.provider_metadata = json.dumps(meta)  # type: ignore[assignment]

    meta = _provider_meta(target)
    meta["is_workspace_default"] = True
    target.provider_metadata = json.dumps(meta)  # type: ignore[assignment]
    db.commit()
    return {"provider": _provider_view(target)}


# ---------------------------------------------------------------------------
# Balances + grants
# ---------------------------------------------------------------------------

class GrantRequest(BaseModel):
    daily: int = 0
    monthly: int = 0


def _tenant_name(db: Session, tenant_id: str) -> str:
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    return str(t.name) if t is not None else tenant_id


def _balance_view(db: Session, balance: AgentCreditBalance, include_usage: bool = False) -> dict[str, Any]:
    view = {
        "tenant_id": str(balance.tenant_id),
        "tenant_name": _tenant_name(db, str(balance.tenant_id)),
        "daily_remaining": int(balance.daily_credits_remaining),
        "monthly_remaining": int(balance.monthly_credits_remaining),
        "bonus_daily": int(balance.bonus_daily or 0),
        "bonus_monthly": int(balance.bonus_monthly or 0),
        "total_consumed": int(balance.total_consumed or 0),
        "daily_last_reset_at": balance.daily_credits_last_reset_at,
        "monthly_last_reset_at": balance.monthly_credits_last_reset_at,
    }
    if include_usage:
        daily_limit, monthly_limit = agent_quota.resolve_plan_limits(db, str(balance.tenant_id))
        view["daily_limit"] = daily_limit
        view["monthly_limit"] = monthly_limit
    return view


@router.get("/quota/balances")
async def list_balances(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    balances = db.query(AgentCreditBalance).order_by(AgentCreditBalance.total_consumed.desc()).all()
    return {"balances": [_balance_view(db, b, include_usage=True) for b in balances]}


@router.post("/quota/{tenant_id}/grant")
async def grant_credits(
    tenant_id: str,
    body: GrantRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    if not tenant_id or not isinstance(tenant_id, str) or len(tenant_id) < 10:
        raise HTTPException(status_code=400, detail="Invalid tenant ID")
    if body.daily < 0 or body.monthly < 0:
        raise HTTPException(status_code=400, detail="Grant amounts must be non-negative")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    try:
        balance = agent_quota.grant_credits(db, tenant_id, daily=body.daily, monthly=body.monthly)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    out = balance
    out["tenant_id"] = tenant_id
    out["tenant_name"] = str(tenant.name)
    return {"balance": out}


@router.post("/quota/{tenant_id}/reset-daily")
async def reset_tenant_daily(
    tenant_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    if not tenant_id or not isinstance(tenant_id, str) or len(tenant_id) < 10:
        raise HTTPException(status_code=400, detail="Invalid tenant ID")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    balance = agent_quota.reset_daily_for_tenant(db, tenant_id)
    return {"balance": balance}


@router.post("/quota/reset-daily")
async def reset_all_daily(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """Manually trigger the global daily reset (normally the Celery beat at 00:05 UTC)."""
    count = agent_quota.reset_all_daily(db)
    return {"reset_count": count}


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

_PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90}


@router.get("/analytics")
async def get_analytics(
    period: str = Query("30d"),
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """Aggregate Workspace Agent usage over the period (default 30 days)."""
    days = _PERIOD_DAYS.get(period, 30)
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    from datetime import timedelta
    start_iso = (start - timedelta(days=days)).isoformat()

    rows = (
        db.query(AgentCreditUsageLog)
        .filter(AgentCreditUsageLog.created_at >= start_iso)
        .all()
    )

    total_consumed = sum(1 for r in rows if r.status == "success")
    quota_exhausted = sum(1 for r in rows if r.status == "quota_exceeded")
    errors = sum(1 for r in rows if r.status == "error")
    active_tenants = {str(r.tenant_id) for r in rows}

    # Top tenants by consumed credits in the window.
    by_tenant: dict[str, int] = {}
    for r in rows:
        if r.status == "success":
            by_tenant[str(r.tenant_id)] = by_tenant.get(str(r.tenant_id), 0) + 1
    top_tenants = sorted(
        (
            {"tenant_id": tid, "tenant_name": _tenant_name(db, tid), "consumed": cnt}
            for tid, cnt in by_tenant.items()
        ),
        key=lambda x: x["consumed"],
        reverse=True,
    )[:10]

    avg_per_tenant = round(total_consumed / len(active_tenants), 1) if active_tenants else 0

    # Daily series for a simple sparkline (credits consumed per day).
    series: dict[str, int] = {}
    for r in rows:
        if r.status != "success":
            continue
        day = str(r.created_at)[:10]  # YYYY-MM-DD
        series[day] = series.get(day, 0) + 1
    daily_series = [{"date": d, "credits": series[d]} for d in sorted(series)]

    # Provider/model usage breakdown.
    provider_usage: dict[str, int] = {}
    model_usage: dict[str, int] = {}
    for r in rows:
        if r.status != "success":
            continue
        pkey = str(r.provider_id) if r.provider_id else "shared"
        provider_usage[pkey] = provider_usage.get(pkey, 0) + 1
        if r.model_id:
            model_usage[str(r.model_id)] = model_usage.get(str(r.model_id), 0) + 1

    return {
        "period": period,
        "total_consumed": total_consumed,
        "quota_exhausted": quota_exhausted,
        "errors": errors,
        "active_tenants": len(active_tenants),
        "avg_credits_per_tenant": avg_per_tenant,
        "top_tenants": top_tenants,
        "daily_series": daily_series,
        "provider_usage": [{"key": k, "credits": v} for k, v in sorted(provider_usage.items(), key=lambda x: x[1], reverse=True)],
        "model_usage": [{"model": k, "credits": v} for k, v in sorted(model_usage.items(), key=lambda x: x[1], reverse=True)],
    }
