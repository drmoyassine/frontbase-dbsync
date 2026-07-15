"""Workspace Agent credit quota service (cloud mode).

Per-tenant credit pools for the backend PydanticAI Workspace Agent. Workspace
turns consume 1 credit (daily pool first, then monthly); support turns are free.
Limits come from the plan's ``agent_credits_daily`` / ``agent_credits_monthly``
limits (see ``plan_limits.LIMIT_REGISTRY``).

Bypass rule (mirrors ``plan_limits``): self-host (ctx None) and master admin
(``ctx.is_master``) bypass all quota checks — they are not billed/limited.

Edge Agents are intentionally NOT routed through here — they run on the tenant's
own providers and never touch this quota.

Tables: ``agent_credit_balances`` (one row/tenant) + ``agent_credit_usage_log``
(one row/turn). Both created by migration 0056 / startup ``create_all()``.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from sqlalchemy.orm import Session

from app.models.models import (
    AgentCreditBalance,
    AgentCreditUsageLog,
    AppVariable,
    Tenant,
)
from .plan_limits import UNLIMITED, get_plan, plan_limits

logger = logging.getLogger(__name__)

PoolType = Literal["daily", "monthly", "unlimited", "none"]
UseType = Literal["workspace", "support"]

# Global config row (AppVariable, project_id NULL) holding master-admin Workspace
# Agent settings: { enabled, default_quota_exceeded_action }.
AGENT_GLOBAL_CONFIG_NAME = "workspace_agent_config"
DEFAULT_QUOTA_EXCEEDED_ACTION = "block"  # block | warn

# The two Workspace Agent profiles. ``workspace`` consumes credits and has broad
# full-project-management permissions; ``support`` is free + read-only.
PROFILE_NAMES = ("workspace", "support")

# Validation bounds for the surfaced generation parameters.
PARAM_BOUNDS = {
    "temperature": (0.0, 2.0),
    "max_tokens": (1, 128000),
    "top_p": (0.0, 1.0),
}


# ---------------------------------------------------------------------------
# Time helpers (all UTC; daily resets at 00:00 UTC, monthly on the 1st)
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _start_of_today(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _start_of_tomorrow(now: datetime) -> datetime:
    return _start_of_today(now) + timedelta(days=1)


def _start_of_month(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _start_of_next_month(now: datetime) -> datetime:
    first = _start_of_month(now)
    if first.month == 12:
        return first.replace(year=first.year + 1, month=1)
    return first.replace(month=first.month + 1)


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _needs_daily_reset(last_reset_iso: Optional[str], now: datetime) -> bool:
    last = _parse_iso(last_reset_iso)
    return last is None or last < _start_of_today(now)


def _needs_monthly_reset(last_reset_iso: Optional[str], now: datetime) -> bool:
    last = _parse_iso(last_reset_iso)
    return last is None or last < _start_of_month(now)


# ---------------------------------------------------------------------------
# Plan resolution
# ---------------------------------------------------------------------------

def resolve_plan_limits(db: Session, tenant_id: str) -> tuple[int, int]:
    """ ``(daily_limit, monthly_limit)`` for the tenant's current plan.

    UNLIMITED (-1) is passed through. Defaults (5 / 0) if the plan lacks the keys.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    slug = str(tenant.plan) if tenant is not None and tenant.plan is not None else None
    limits = plan_limits(get_plan(db, slug))
    daily = limits.get("agent_credits_daily", 5)
    monthly = limits.get("agent_credits_monthly", 0)
    try:
        return int(daily), int(monthly)
    except (TypeError, ValueError):
        return 5, 0


# ---------------------------------------------------------------------------
# Global (master-admin) Workspace Agent config
# ---------------------------------------------------------------------------

SUPPORT_SYSTEM_PROMPT = """You are the Frontbase Technical Support Agent.
Your primary role is to help users understand and use the Frontbase platform by answering their questions using the official documentation.

CRITICAL INSTRUCTIONS:
1. ALWAYS use the `search_docs` tool to find relevant information before answering. Do not guess or hallucinate features.
2. If the documentation does not contain the answer, explicitly state that you cannot find the answer in the current documentation.
3. Be polite, concise, and technical. Provide code snippets and step-by-step instructions when applicable.
4. You have READ-ONLY access to the user's project context to help you understand their environment, but you CANNOT make changes. Do not attempt to use tools that mutate state.
"""

def _default_global_config() -> dict[str, Any]:
    from .agent_permissions import default_workspace_permissions, default_support_permissions
    return {
        "enabled": True,
        "quota_exceeded_action": DEFAULT_QUOTA_EXCEEDED_ACTION,
        "profiles": {
            "workspace": {
                "system_prompt": None,  # None → executor uses the built-in default
                "temperature": 0.7,
                "max_tokens": 4096,
                "top_p": 0.9,
                "model_id": None,
                "provider_id": None,
                "permissions": default_workspace_permissions(),
                "excluded_tools": [],
            },
            "support": {
                "system_prompt": SUPPORT_SYSTEM_PROMPT,
                "temperature": 0.5,
                "max_tokens": 2048,
                "top_p": 0.95,
                "model_id": None,
                "provider_id": None,
                "permissions": default_support_permissions(),
                "excluded_tools": [],
            },
        },
    }


def _clamp_param(name: str, value: Any) -> Any:
    """Coerce + range-clamp a generation parameter to its valid type/range."""
    if value is None:
        return None
    lo, hi = PARAM_BOUNDS[name]
    try:
        if name == "max_tokens":
            v = int(value)
        else:
            v = float(value)
    except (TypeError, ValueError):
        return None
    return max(lo, min(hi, v))


def get_profile_config(db: Session, use_type: str) -> dict[str, Any]:
    """Resolve the merged config for one profile ('workspace' | 'support').

    Returns the master-admin profile settings (defaults if unset). Cloud tenant
    turns resolve these; self-host / master admin also use them as the source of
    truth for parameters + permissions.
    """
    if use_type not in PROFILE_NAMES:
        use_type = "workspace"
    cfg = get_agent_global_config(db)
    return cfg.get("profiles", {}).get(use_type) or _default_global_config()["profiles"][use_type]


def set_profile_config(db: Session, use_type: str, updates: dict[str, Any]) -> dict[str, Any]:
    """Merge validated ``updates`` into one profile's config. Caller commits.

    Allowed keys: system_prompt, temperature, max_tokens, top_p, model_id,
    provider_id, permissions, excluded_tools.
    """
    if use_type not in PROFILE_NAMES:
        raise ValueError(f"Unknown profile '{use_type}'")
    cfg = get_agent_global_config(db)
    cfg.setdefault("profiles", {})
    profile = dict(cfg["profiles"].get(use_type) or _default_global_config()["profiles"][use_type])

    if "system_prompt" in updates:
        profile["system_prompt"] = updates["system_prompt"] or None
    for p in ("temperature", "max_tokens", "top_p"):
        if p in updates:
            profile[p] = _clamp_param(p, updates[p])
    if "model_id" in updates:
        profile["model_id"] = updates["model_id"] or None
    if "provider_id" in updates:
        profile["provider_id"] = updates["provider_id"] or None
    if "permissions" in updates and isinstance(updates["permissions"], dict):
        profile["permissions"] = updates["permissions"]
    if "excluded_tools" in updates and isinstance(updates["excluded_tools"], list):
        profile["excluded_tools"] = [str(t) for t in updates["excluded_tools"]]

    cfg["profiles"][use_type] = profile
    # Persist the full merged config.
    _write_global_config_row(db, cfg)
    return profile


def _write_global_config_row(db: Session, cfg: dict[str, Any]) -> None:
    """Upsert the global config AppVariable row. Caller commits."""
    now = _utcnow().isoformat()
    row = (
        db.query(AppVariable)
        .filter(AppVariable.name == AGENT_GLOBAL_CONFIG_NAME, AppVariable.project_id.is_(None))
        .first()
    )
    if row is None:
        db.add(AppVariable(
            id=str(uuid.uuid4()),
            name=AGENT_GLOBAL_CONFIG_NAME,
            type="variable",
            value=json.dumps(cfg),
            description="Master-admin Workspace Agent configuration",
            project_id=None,
            created_at=now,
        ))
    else:
        row.value = json.dumps(cfg)  # type: ignore[assignment]
    db.commit()


def get_agent_global_config(db: Session) -> dict[str, Any]:
    """Master-admin Workspace Agent config (enabled flag + default action)."""
    row = (
        db.query(AppVariable)
        .filter(AppVariable.name == AGENT_GLOBAL_CONFIG_NAME, AppVariable.project_id.is_(None))
        .first()
    )
    cfg = _default_global_config()
    if row and row.value:
        try:
            cfg.update(json.loads(str(row.value)))
        except (json.JSONDecodeError, TypeError):
            pass
    return cfg


def set_agent_global_config(db: Session, updates: dict[str, Any]) -> dict[str, Any]:
    """Merge ``updates`` into the global Workspace Agent config. Caller commits."""
    cfg = get_agent_global_config(db)
    for k in ("enabled", "quota_exceeded_action"):
        if k in updates and updates[k] is not None:
            val = updates[k]
            if k == "quota_exceeded_action" and val not in ("block", "warn"):
                continue
            if k == "enabled":
                val = bool(val)
            cfg[k] = val
    _write_global_config_row(db, cfg)
    return cfg


def get_quota_exceeded_action(db: Session, tenant_id: Optional[str] = None) -> str:
    """Resolve the quota-exceeded action: per-tenant override → global → default."""
    if tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if tenant is not None and tenant.settings:
            try:
                s = json.loads(str(tenant.settings)) or {}
                a = (s.get("agent") or {}).get("quota_exceeded_action")
                if a in ("block", "warn"):
                    return str(a)
            except (json.JSONDecodeError, TypeError):
                pass
    a = get_agent_global_config(db).get("quota_exceeded_action")
    return a if a in ("block", "warn") else DEFAULT_QUOTA_EXCEEDED_ACTION


# ---------------------------------------------------------------------------
# Balance access + lazy reset
# ---------------------------------------------------------------------------

def _ensure_balance(db: Session, tenant_id: str) -> tuple[AgentCreditBalance, int, int, datetime]:
    """Get-or-create the tenant's balance row, applying any due daily/monthly reset.

    Commits when it creates or resets. Returns (balance, daily_limit, monthly_limit, now).
    """
    now = _utcnow()
    daily_limit, monthly_limit = resolve_plan_limits(db, tenant_id)
    today = _start_of_today(now).isoformat()
    month = _start_of_month(now).isoformat()

    balance = (
        db.query(AgentCreditBalance)
        .filter(AgentCreditBalance.tenant_id == tenant_id)
        .first()
    )

    if balance is None:
        dr = daily_limit if daily_limit == UNLIMITED else max(0, daily_limit)
        mr = monthly_limit if monthly_limit == UNLIMITED else max(0, monthly_limit)
        balance = AgentCreditBalance(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            daily_credits_remaining=dr,
            daily_credits_last_reset_at=today,
            monthly_credits_remaining=mr,
            monthly_credits_last_reset_at=month,
            bonus_daily=0,
            bonus_monthly=0,
            total_consumed=0,
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
        )
        db.add(balance)
        db.commit()
        db.refresh(balance)
        return balance, daily_limit, monthly_limit, now

    changed = False
    if _needs_daily_reset(balance.daily_credits_last_reset_at, now):
        balance.daily_credits_remaining = (
            UNLIMITED if daily_limit == UNLIMITED else max(0, daily_limit + int(balance.bonus_daily or 0))
        )
        balance.daily_credits_last_reset_at = today
        changed = True
    if _needs_monthly_reset(balance.monthly_credits_last_reset_at, now):
        balance.monthly_credits_remaining = (
            UNLIMITED if monthly_limit == UNLIMITED else max(0, monthly_limit + int(balance.bonus_monthly or 0))
        )
        balance.monthly_credits_last_reset_at = month
        changed = True
    if changed:
        balance.updated_at = now.isoformat()
        db.commit()
        db.refresh(balance)
    return balance, daily_limit, monthly_limit, now


def get_credit_balance(db: Session, tenant_id: str) -> dict[str, Any]:
    """Snapshot of the tenant's credit state for UI/SSE consumption."""
    balance, daily_limit, monthly_limit, now = _ensure_balance(db, tenant_id)
    return {
        "daily_remaining": int(balance.daily_credits_remaining),
        "daily_limit": daily_limit,
        "monthly_remaining": int(balance.monthly_credits_remaining),
        "monthly_limit": monthly_limit,
        "daily_resets_at": _start_of_tomorrow(now).isoformat(),
        "monthly_resets_at": _start_of_next_month(now).isoformat(),
        "total_consumed": int(balance.total_consumed or 0),
        "bonus_daily": int(balance.bonus_daily or 0),
        "bonus_monthly": int(balance.bonus_monthly or 0),
    }


# ---------------------------------------------------------------------------
# Enforcement + consumption
# ---------------------------------------------------------------------------

def check_credit_available(
    db: Session, tenant_id: str, use_type: str
) -> dict[str, Any]:
    """Decide whether a turn is allowed and which pool it would draw from.

    ``workspace`` consumes (daily → monthly → unlimited); ``support`` is always
    allowed and consumes nothing. Returns a dict with ``allowed``, ``pool``,
    the live remaining counts, and next-reset timestamps.
    """
    balance, daily_limit, monthly_limit, now = _ensure_balance(db, tenant_id)
    dr = int(balance.daily_credits_remaining)
    mr = int(balance.monthly_credits_remaining)
    daily_unlimited = dr == UNLIMITED
    monthly_unlimited = mr == UNLIMITED

    resets = {
        "daily_resets_at": _start_of_tomorrow(now).isoformat(),
        "monthly_resets_at": _start_of_next_month(now).isoformat(),
        "daily_remaining": dr,
        "monthly_remaining": mr,
        "daily_limit": daily_limit,
        "monthly_limit": monthly_limit,
    }

    if use_type == "support":
        return {"allowed": True, "pool": "none", "reason": None, **resets}

    if daily_unlimited or monthly_unlimited:
        return {"allowed": True, "pool": "unlimited", "reason": None, **resets}

    if dr > 0:
        return {"allowed": True, "pool": "daily", "reason": None, **resets}
    if mr > 0:
        return {"allowed": True, "pool": "monthly", "reason": None, **resets}

    return {
        "allowed": False,
        "pool": "none",
        "reason": "Your daily and monthly Workspace Agent credits are exhausted.",
        **resets,
    }


def consume_credit(
    db: Session,
    tenant_id: str,
    user_id: str,
    use_type: str,
    *,
    pool_hint: Optional[str] = None,
    provider_id: Optional[str] = None,
    model_id: Optional[str] = None,
    agent_profile: Optional[str] = None,
    metrics: Optional[dict[str, Any]] = None,
    status: str = "success",
    error_message: Optional[str] = None,
) -> AgentCreditUsageLog:
    """Decrement one credit (if applicable) and write a usage-log row.

    Re-reads the balance under a row lock (``FOR UPDATE`` on Postgres, no-op on
    SQLite) and re-evaluates the pool, so the decrement is clamped by the live
    remaining count and never goes negative. ``workspace`` decrements daily →
    monthly; ``support``/unlimited/overage consume nothing.
    """
    now = _utcnow()
    metrics = metrics or {}

    balance = (
        db.query(AgentCreditBalance)
        .filter(AgentCreditBalance.tenant_id == tenant_id)
        .with_for_update()
        .first()
    )
    if balance is None:
        # First-ever turn raced ahead of _ensure_balance; create lazily.
        balance, _, _, _ = _ensure_balance(db, tenant_id)
        db.refresh(balance)

    pool: str = "none"
    if use_type == "workspace":
        dr = int(balance.daily_credits_remaining)
        mr = int(balance.monthly_credits_remaining)
        if dr == UNLIMITED or mr == UNLIMITED:
            pool = "unlimited"
        elif dr > 0:
            balance.daily_credits_remaining = dr - 1
            balance.total_consumed = int(balance.total_consumed or 0) + 1
            pool = "daily"
        elif mr > 0:
            balance.monthly_credits_remaining = mr - 1
            balance.total_consumed = int(balance.total_consumed or 0) + 1
            pool = "monthly"
        else:
            # Overdrawn (race / warn-mode overage): log without consuming.
            pool = "none"
        balance.updated_at = now.isoformat()

    log = AgentCreditUsageLog(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        user_id=user_id,
        pool_type=pool,
        use_type=use_type,
        agent_profile=agent_profile,
        provider_id=provider_id,
        model_id=model_id,
        tokens_input=int(metrics.get("tokens_input") or 0) or None,
        tokens_output=int(metrics.get("tokens_output") or 0) or None,
        tool_calls_count=int(metrics.get("tool_calls") or 0),
        duration_ms=int(metrics.get("duration_ms") or 0) or None,
        status=status,
        error_message=error_message,
        created_at=now.isoformat(),
    )
    db.add(log)
    db.commit()
    return log


# ---------------------------------------------------------------------------
# Resets (daily beat task + manual admin trigger)
# ---------------------------------------------------------------------------

def _force_daily_reset(db: Session, balance: AgentCreditBalance) -> bool:
    daily_limit, _ = resolve_plan_limits(db, str(balance.tenant_id))
    balance.daily_credits_remaining = (
        UNLIMITED if daily_limit == UNLIMITED else max(0, daily_limit + int(balance.bonus_daily or 0))
    )
    balance.daily_credits_last_reset_at = _start_of_today(_utcnow()).isoformat()
    balance.updated_at = _utcnow().isoformat()
    return True


def reset_daily_for_tenant(db: Session, tenant_id: str) -> dict[str, Any]:
    balance, _, _, _ = _ensure_balance(db, tenant_id)
    _force_daily_reset(db, balance)
    db.commit()
    return get_credit_balance(db, tenant_id)


def reset_monthly_for_tenant(db: Session, tenant_id: str) -> dict[str, Any]:
    balance, _, monthly_limit, _ = _ensure_balance(db, tenant_id)
    balance.monthly_credits_remaining = (
        UNLIMITED if monthly_limit == UNLIMITED else max(0, monthly_limit + int(balance.bonus_monthly or 0))
    )
    balance.monthly_credits_last_reset_at = _start_of_month(_utcnow()).isoformat()
    balance.updated_at = _utcnow().isoformat()
    db.commit()
    return get_credit_balance(db, tenant_id)


def reset_all_daily(db: Session) -> int:
    """Reset the daily pool for every tenant. Returns the number of tenants reset.

    Used by the Celery beat task (00:05 UTC) and the manual admin trigger.
    Ensures every tenant has a balance row, then forces the daily refill.
    """
    now = _utcnow()
    today = _start_of_today(now).isoformat()
    count = 0
    for tenant in db.query(Tenant).all():
        balance, daily_limit, _, _ = _ensure_balance(db, str(tenant.id))
        balance.daily_credits_remaining = (
            UNLIMITED if daily_limit == UNLIMITED else max(0, daily_limit + int(balance.bonus_daily or 0))
        )
        balance.daily_credits_last_reset_at = today
        balance.updated_at = now.isoformat()
        count += 1
    db.commit()
    logger.info("[agent_quota] daily reset applied to %d tenant(s)", count)
    return count


# ---------------------------------------------------------------------------
# Manual grants (master admin Usage tab)
# ---------------------------------------------------------------------------

def grant_credits(
    db: Session, tenant_id: str, daily: int = 0, monthly: int = 0
) -> dict[str, Any]:
    """Add bonus credits to a tenant. Felt immediately AND layered onto resets.

    Negative values are rejected. Bonuses accumulate in ``bonus_daily`` /
    ``bonus_monthly`` (added on top of the plan limit at each reset) and are also
    applied to the live remaining counts right away.
    """
    if daily < 0 or monthly < 0:
        raise ValueError("Credit grants must be non-negative")
    balance, _, _, _ = _ensure_balance(db, tenant_id)
    if daily:
        balance.bonus_daily = int(balance.bonus_daily or 0) + daily
        if balance.daily_credits_remaining != UNLIMITED:
            balance.daily_credits_remaining = int(balance.daily_credits_remaining) + daily
    if monthly:
        balance.bonus_monthly = int(balance.bonus_monthly or 0) + monthly
        if balance.monthly_credits_remaining != UNLIMITED:
            balance.monthly_credits_remaining = int(balance.monthly_credits_remaining) + monthly
    balance.updated_at = _utcnow().isoformat()
    db.commit()
    return get_credit_balance(db, tenant_id)
