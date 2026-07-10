"""Plan limits — single source of truth for tier limits & feature flags.

Replaces the hardcoded ``PLAN_QUOTAS`` that used to live inline in
``tenant_admin.py``.  Limits are stored as a JSON map on ``plans.limits`` and
described here by a typed registry so the admin UI and the enforcement code
agree on keys/types without a DB migration per new limit.

Bypass rule (kept identical to ``[TEIRS] visibility-auth-gating`` plan):
self-host (``ctx is None``) and master admin (``ctx.is_master``) bypass every
limit/flag.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional, TypedDict

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import Plan, Tenant, TenantAddon

logger = logging.getLogger(__name__)

UNLIMITED = -1


class LimitDef(TypedDict):
    key: str
    label: str
    kind: Literal["int", "bool"]
    category: Literal["capacity", "operational", "feature", "agent"]
    scope: Literal["project", "tenant"]   # how the cap is counted — see LIMIT_REGISTRY notes
    unit: Optional[str]
    default: Any


# The canonical catalog of limit keys. Add a key here to expose a new limit to
# the admin editor and to enforcement — no DB migration required.
#
# Categories:
#   capacity    — "size of workspace" counts; control-plane owns the table, so
#                 enforced at create time. These ship enabled at launch.
#   operational — load on Frontbase's pipeline / managed infra (deploys, log
#                 retention, shared-worker runtime). Per-plan OPTIONAL: a value of
#                 UNLIMITED (-1) means "no cap / not enforced for this plan". They
#                 ship DORMANT (seeded -1) and their enforcement plumbing is wired
#                 only when we decide to turn them on.
#   feature     — boolean on/off entitlements.
#   agent       — Workspace Agent credit quotas (cloud only). Per-tenant daily +
#                 monthly credit pools consumed by backend PydanticAI agent turns.
#                 UNLIMITED (-1) = unlimited credits; 0 = none for that window.
#                 These are ACTIVE at launch (unlike dormant operational caps).
#
# Scope (how a cap is counted — from the multi-project binding model):
#   project — counted within the active project (today: the tenant's single project).
#             For shareable resources (datasources/storage), the count = grants to
#             the active project. Full scope-aware counting activates with
#             multi-project; under the current 1:1 tenant↔project it equals tenant-wide.
#   tenant  — counted across the whole tenant.
#
# NOTE on `projects`: forward-declared — today tenant↔project is 1:1 with no
# tenant-facing "create project" path, so it is NOT enforced yet. It activates with
# the multi-project plan (gate at the project-create endpoint).
LIMIT_REGISTRY: list[LimitDef] = [
    # -- Capacity --
    {"key": "projects", "label": "Projects", "kind": "int", "category": "capacity", "scope": "tenant", "unit": None, "default": 1},
    {"key": "pages", "label": "Pages", "kind": "int", "category": "capacity", "scope": "project", "unit": None, "default": 10},
    {"key": "workflows", "label": "Active workflows", "kind": "int", "category": "capacity", "scope": "project", "unit": None, "default": 5},
    {"key": "datasources", "label": "Data sources", "kind": "int", "category": "capacity", "scope": "project", "unit": None, "default": 1},
    {"key": "connected_accounts", "label": "Connected accounts", "kind": "int", "category": "capacity", "scope": "tenant", "unit": None, "default": 1},
    {"key": "edge_engines", "label": "Edge engines", "kind": "int", "category": "capacity", "scope": "project", "unit": None, "default": 0},
    {"key": "team_members", "label": "Team members", "kind": "int", "category": "capacity", "scope": "tenant", "unit": None, "default": 1},
    # (custom_domains is intentionally NOT here — it's a managed add-on on managed tiers / free BYO.
    #  See [TIERS] §4.4 + [FEATURE] multi-project-plan-gated.md §Custom domains.)
    # -- Operational (optional; dormant at launch, UNLIMITED = disabled) --
    {"key": "deploys_monthly", "label": "Deploys / republishes per month", "kind": "int", "category": "operational", "scope": "tenant", "unit": "/mo", "default": UNLIMITED},
    {"key": "log_retention_hours", "label": "Log retention window (hours)", "kind": "int", "category": "operational", "scope": "tenant", "unit": "h", "default": UNLIMITED},
    {"key": "shared_worker_executions_monthly", "label": "Shared-worker executions per month (free/managed)", "kind": "int", "category": "operational", "scope": "tenant", "unit": "/mo", "default": UNLIMITED},
    # -- Workspace Agent credits (cloud; active at launch) --
    # Consumed by backend PydanticAI Workspace Agent turns (1 credit/turn). Daily
    # pool refills at UTC midnight; monthly pool refills on the 1st of the month.
    # See app/services/agent_quota.py + docs/plans/[FEATURE] Multi-Tenant Agent Credit Quota System.md.
    {"key": "agent_credits_daily", "label": "Workspace Agent credits (daily)", "kind": "int", "category": "agent", "scope": "tenant", "unit": "/day", "default": 5},
    {"key": "agent_credits_monthly", "label": "Workspace Agent credits (monthly)", "kind": "int", "category": "agent", "scope": "tenant", "unit": "/mo", "default": 0},
    # -- Feature flags (plan-level entitlements; gated instances are project resources) --
    {"key": "private_pages", "label": "Private / auth-gated pages", "kind": "bool", "category": "feature", "scope": "tenant", "unit": None, "default": False},
    {"key": "auth_providers", "label": "Connect auth provider", "kind": "bool", "category": "feature", "scope": "tenant", "unit": None, "default": False},
    {"key": "remove_branding", "label": "Remove Frontbase branding", "kind": "bool", "category": "feature", "scope": "tenant", "unit": None, "default": False},
    {"key": "api_access", "label": "API access (/v1)", "kind": "bool", "category": "feature", "scope": "tenant", "unit": None, "default": False},
]

_REGISTRY_BY_KEY: dict[str, LimitDef] = {d["key"]: d for d in LIMIT_REGISTRY}


def registry_defaults() -> dict[str, Any]:
    """The limits map a plan inherits before its own overrides are applied."""
    return {d["key"]: d["default"] for d in LIMIT_REGISTRY}


def validate_limits(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate an admin-supplied limits map against the registry.

    Unknown keys are rejected; values are coerced to the declared kind.
    """
    clean: dict[str, Any] = {}
    for key, value in (raw or {}).items():
        spec = _REGISTRY_BY_KEY.get(key)
        if spec is None:
            raise HTTPException(status_code=400, detail=f"Unknown limit key: '{key}'")
        if spec["kind"] == "bool":
            clean[key] = bool(value)
        else:  # int
            try:
                clean[key] = int(value)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"Limit '{key}' must be an integer")
    return clean


# ---------------------------------------------------------------------------
# Plan lookup
# ---------------------------------------------------------------------------

def get_default_plan(db: Session) -> Optional[Plan]:
    return (
        db.query(Plan).filter(Plan.is_default == True).first()  # noqa: E712
        or db.query(Plan).filter(Plan.slug == "free").first()
    )


def get_plan(db: Session, slug: Optional[str]) -> Optional[Plan]:
    """Load a plan by slug, falling back to the default plan."""
    plan = db.query(Plan).filter(Plan.slug == slug).first() if slug else None
    return plan or get_default_plan(db)


def apply_plan(db: Session, tenant_id: str, slug: str) -> Tenant:
    """The single seam for changing a tenant's plan.

    Called by the master-admin change-request approval today; a future billing
    provider plugs in here too. After updating the plan, reconciles the projects
    cap: locks excess projects on a downgrade, unlocks on an upgrade. Caller commits.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if not db.query(Plan).filter(Plan.slug == slug).first():
        raise HTTPException(status_code=400, detail=f"Unknown plan '{slug}'")
    tenant.plan = slug  # type: ignore[assignment]
    tenant.updated_at = datetime.now(timezone.utc).isoformat()  # type: ignore[assignment]
    reconcile_projects_cap(db, tenant)
    return tenant


# ---------------------------------------------------------------------------
# Managed add-ons (à-la-carte managed-infra entitlements; managed tiers only)
# ---------------------------------------------------------------------------

MANAGED_ADDON_TYPES: tuple[str, ...] = (
    "managed_edge_db", "managed_cache", "managed_queue", "managed_domain",
)


def get_active_addons(db: Session, tenant_id: str) -> dict[str, int]:
    """Active managed add-ons for a tenant: {addon_type: total_quantity}."""
    rows = (
        db.query(TenantAddon)
        .filter(TenantAddon.tenant_id == tenant_id, TenantAddon.status == "active")
        .all()
    )
    out: dict[str, int] = {}
    for r in rows:
        key = str(r.addon_type)
        out[key] = out.get(key, 0) + (int(r.quantity) if r.quantity is not None else 1)  # type: ignore[arg-type]
    return out


def has_active_addon(db: Session, tenant_id: str, addon_type: str) -> bool:
    """True if the tenant holds an active managed add-on of the given type.

    The provisioning gate (managed cache/queue/domain/edge create requires the
    matching add-on) calls this once the managed auto-provisioning pipeline ships.
    """
    return addon_type in get_active_addons(db, tenant_id)


def count_deploys_this_month(db: Session, tenant_id: str) -> int:
    """Distinct (page → engine) publish targets deployed this month for the tenant.

    Each publish updates ``PageDeployment.published_at``; the (page, engine) row is
    unique, so this counts distinct publish *targets* touched this month — redeploys
    of the same target within the month count once (encourages iteration, caps breadth).
    Drives the ``deploys_monthly`` operational cap.
    """
    from app.models.models import PageDeployment, Page, Project
    now = datetime.now(timezone.utc)
    start_of_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc).isoformat()
    return (
        db.query(PageDeployment)
        .join(Page, PageDeployment.page_id == Page.id)
        .join(Project, Page.project_id == Project.id)
        .filter(Project.tenant_id == tenant_id, PageDeployment.published_at >= start_of_month)
        .count()
    )


# ---------------------------------------------------------------------------
# Projects-cap reconciliation (downgrade locks excess projects; upgrade unlocks)
# ---------------------------------------------------------------------------

def reconcile_projects_cap(db: Session, tenant: Tenant) -> None:
    """Enforce the tenant's ``projects`` cap across their projects.

    On a downgrade that leaves the tenant over the cap, the most recent non-default
    projects are set to ``status='locked'`` (read-only) until they fit. On an upgrade
    (or unlimited), all locked projects are re-activated. The default project is never
    locked. Caller commits.
    """
    from app.models.models import Project
    cap = plan_limits(get_plan(db, str(tenant.plan))).get("projects", 1)
    projects = (
        db.query(Project)
        .filter(Project.tenant_id == tenant.id)
        .order_by(Project.created_at)
        .all()
    )
    if not isinstance(cap, int) or cap == UNLIMITED:
        # Unlimited: unlock everything.
        for p in projects:
            if str(p.status) == "locked":
                p.status = "active"  # type: ignore[assignment]
        return
    # Keep `cap` projects active (default always counts), lock the rest by recency.
    active_targets = {str(p.id) for p in projects[:cap]}
    for p in projects:
        is_default = bool(p.is_default)
        want_active = is_default or str(p.id) in active_targets
        if want_active and str(p.status) == "locked":
            p.status = "active"  # type: ignore[assignment]
        elif (not want_active) and str(p.status) != "locked":
            p.status = "locked"  # type: ignore[assignment]


def serialize_plan(plan: Plan) -> dict[str, Any]:
    """Full plan representation for admin + tenant views."""
    try:
        features = json.loads(str(plan.features)) if plan.features is not None else []
    except (json.JSONDecodeError, TypeError):
        features = []
        
    try:
        gateway_metadata = json.loads(str(plan.gateway_metadata)) if plan.gateway_metadata is not None else {}
    except (json.JSONDecodeError, TypeError):
        gateway_metadata = {}
        
    return {
        "id": str(plan.id),
        "slug": str(plan.slug),
        "name": str(plan.name),
        "description": plan.description,
        "infra_mode": str(plan.infra_mode) if plan.infra_mode is not None else "byo",
        "price_display": plan.price_display,
        "price_period": plan.price_period,
        "price_cents": int(plan.price_cents) if plan.price_cents is not None else 0,
        "limits": plan_limits(plan),
        "features": features,
        "gateway_metadata": gateway_metadata,
        "is_public": bool(plan.is_public),
        "is_active": bool(plan.is_active),
        "is_default": bool(plan.is_default),
        "highlighted": bool(plan.highlighted),
        "badge": plan.badge,
        "sort_order": int(plan.sort_order) if plan.sort_order is not None else 0,  # type: ignore[arg-type]
        "created_at": str(plan.created_at),
        "updated_at": str(plan.updated_at),
    }

def plan_to_pricing_card(plan: Plan) -> dict[str, Any]:
    """Map a plan into the ``PricingPlan`` shape the SSR ``Pricing`` component expects.

    Reused by the public pricing endpoint and the publish serializer so the
    bound ``Pricing`` builder element renders without an SSR change.
    """
    data = serialize_plan(plan)
    features = data["features"] or _features_from_limits(data["limits"])
    return {
        "name": data["name"],
        "price": data["price_display"] or "",
        "period": data["price_period"] or "",
        "description": data["description"] or "",
        "features": features,
        "ctaText": "Get started",
        "ctaLink": f"/signup?plan={data['slug']}",
        "highlighted": data["highlighted"],
        "badge": data["badge"] or "",
    }


def _features_from_limits(limits: dict[str, Any]) -> list[str]:
    """Derive human-readable feature bullets from a limits map (fallback)."""
    out: list[str] = []
    for spec in LIMIT_REGISTRY:
        val = limits.get(spec["key"], spec["default"])
        if spec["kind"] == "bool":
            if val:
                out.append(spec["label"])
        else:
            shown = "Unlimited" if val == UNLIMITED else f"{val:,}"
            out.append(f"{shown} {spec['label'].lower()}{spec['unit'] or ''}")
    return out


def plan_limits(plan: Optional[Plan]) -> dict[str, Any]:
    """Resolved limits for a plan: registry defaults overlaid with the plan's map."""
    merged = registry_defaults()
    if plan is not None and plan.limits is not None:
        try:
            merged.update(json.loads(str(plan.limits)))
        except (json.JSONDecodeError, TypeError):
            logger.warning("[plan_limits] bad limits JSON on plan %s", getattr(plan, "slug", "?"))
    return merged


# ---------------------------------------------------------------------------
# Tenant-scoped resolution + enforcement
# ---------------------------------------------------------------------------

def _bypasses(ctx: Any) -> bool:
    """Self-host (ctx None) and master admin bypass all limits."""
    return ctx is None or bool(getattr(ctx, "is_master", False))


def tenant_limits(db: Session, ctx: Any) -> dict[str, Any]:
    """Resolved limits for the tenant behind ``ctx``."""
    tenant = db.query(Tenant).filter(Tenant.id == getattr(ctx, "tenant_id", None)).first()
    slug = str(tenant.plan) if tenant is not None and tenant.plan is not None else None
    limits = plan_limits(get_plan(db, slug))

    if tenant is not None:
        addons = db.query(TenantAddon).filter(
            TenantAddon.tenant_id == tenant.id,
            TenantAddon.status == "active"
        ).all()
        for addon in addons:
            qty = addon.quantity if addon.quantity is not None else 1
            if addon.addon_type == "edge_engine":
                limits["edge_engines"] = limits.get("edge_engines", 0) + qty
                limits["projects"] = limits.get("projects", 0) + qty
            elif addon.addon_type in limits:
                if limits[addon.addon_type] != UNLIMITED:
                    limits[addon.addon_type] = limits[addon.addon_type] + qty
    return limits


def limit_value(db: Session, ctx: Any, key: str) -> Any:
    """Single limit for the tenant. Master/self-host → UNLIMITED (int) / True (bool)."""
    spec = _REGISTRY_BY_KEY.get(key)
    if _bypasses(ctx):
        return True if spec and spec["kind"] == "bool" else UNLIMITED
    return tenant_limits(db, ctx).get(key, spec["default"] if spec else None)


def feature_enabled(db: Session, ctx: Any, key: str) -> bool:
    """True if a boolean feature flag is enabled for the tenant (or bypassed)."""
    return bool(limit_value(db, ctx, key))


def check_quota(db: Session, ctx: Any, key: str, current: int) -> None:
    """Raise 403 when ``current`` has reached the tenant's limit for ``key``.

    No-op for master/self-host and for unlimited (-1) limits.
    """
    if _bypasses(ctx):
        return
    limit = limit_value(db, ctx, key)
    if not isinstance(limit, int) or limit == UNLIMITED:
        return
    if current >= limit:
        spec = _REGISTRY_BY_KEY.get(key)
        label = spec["label"] if spec else key
        raise HTTPException(
            status_code=403,
            detail=f"You've reached your plan's {label} limit ({limit}). Please upgrade your plan.",
        )


def require_feature(db: Session, ctx: Any, key: str) -> None:
    """Raise 403 when a boolean feature flag is disabled for the tenant."""
    if feature_enabled(db, ctx, key):
        return
    spec = _REGISTRY_BY_KEY.get(key)
    label = spec["label"] if spec else key
    raise HTTPException(
        status_code=403,
        detail=f"{label} is not available on your current plan. Please upgrade your plan.",
    )


# ---------------------------------------------------------------------------
# Seed — default catalog (idempotent; called at startup)
# ---------------------------------------------------------------------------

# Launch posture: CAPACITY caps enabled; OPERATIONAL caps dormant (UNLIMITED =
# disabled per plan) until we decide to turn them on. infra_mode drives whether a
# tier runs on Frontbase-managed infra (free shared / Basic dedicated) or the
# tenant's own (Pro / Enterprise BYO).
#
# Suggested operational values for when they're enabled (kept dormant for now):
#   free:  deploys_monthly 50,   shared_worker_executions_monthly 1000
#   basic: deploys_monthly 500
_OFF = UNLIMITED  # operational cap disabled / not enforced for this plan

# NOTE: all prices/limits below are EXAMPLE DEFAULTS. The master admin configures real plan
# pricing + limits from the PlansManager UI (GET/POST/PUT /api/admin/plans). These seeds only run
# when a slug is missing, so admin edits are never overwritten.
#
# Basic is `infra_mode: managed` and priced à-la-carte (managed edge+state-db base + optional
# cache/queue/domain add-ons) — see [TIERS] §4.4. The add-on SKUs themselves are tracked in
# `tenant_addons` (multi-project plan); Basic's `price_display` here is just the managed-base entry
# price (example), editable in the UI.
_SEED_PLANS: list[dict[str, Any]] = [
    {
        "slug": "free", "name": "Free", "description": "Get started on shared infrastructure.",
        "infra_mode": "managed", "price_display": "Free", "price_period": "",
        "is_default": True, "is_public": True, "sort_order": 0,
        "limits": {
            "projects": 1,
            "pages": 10, "workflows": 5, "datasources": 1, "connected_accounts": 1,
            "edge_engines": 0, "team_members": 1,
            "deploys_monthly": 50, "log_retention_hours": 720, "shared_worker_executions_monthly": 1000,
            "agent_credits_daily": 5, "agent_credits_monthly": 0,
            "private_pages": False, "auth_providers": False, "remove_branding": False, "api_access": False,
        },
        "features": ["10 pages, 5 workflows", "Community / shared workers", "Public pages only"],
    },
    {
        "slug": "basic", "name": "Basic", "description": "Pro features on Frontbase-managed infrastructure — no setup.",
        "infra_mode": "managed", "price_display": "$1.99", "price_period": "/mo",
        "is_public": True, "highlighted": True, "badge": "Best value", "sort_order": 1,
        "limits": {
            "projects": 1,
            "pages": 50, "workflows": 25, "datasources": 3, "connected_accounts": 3,
            "edge_engines": 1, "team_members": 3,
            "deploys_monthly": 500, "log_retention_hours": 2160, "shared_worker_executions_monthly": 10000,
            "agent_credits_daily": 5, "agent_credits_monthly": 500,
            "private_pages": True, "auth_providers": True, "remove_branding": True, "api_access": True,
        },
        "features": ["Managed dedicated engine + state DB", "Private / auth-gated pages", "Connect auth providers", "No infra setup"],
    },
    {
        "slug": "pro", "name": "Pro", "description": "Pro features on your own infrastructure.",
        "infra_mode": "byo", "price_display": "$29", "price_period": "/month",
        "is_public": True, "sort_order": 2,
        "limits": {
            "projects": 3,
            "pages": 200, "workflows": 50, "datasources": 10, "connected_accounts": 10,
            "edge_engines": 3, "team_members": 10,
            "deploys_monthly": 5000, "log_retention_hours": 8760, "shared_worker_executions_monthly": _OFF,
            "agent_credits_daily": 20, "agent_credits_monthly": 2000,
            "private_pages": True, "auth_providers": True, "remove_branding": True, "api_access": True,
        },
        "features": ["Bring your own edge", "200 pages, 50 workflows", "Private pages & auth"],
    },
    {
        "slug": "enterprise", "name": "Enterprise", "description": "Unlimited scale on your own infrastructure.",
        "infra_mode": "byo", "price_display": "Custom", "price_period": "",
        "is_public": True, "sort_order": 3,
        "limits": {
            "projects": UNLIMITED,
            "pages": UNLIMITED, "workflows": UNLIMITED, "datasources": UNLIMITED, "connected_accounts": UNLIMITED,
            "edge_engines": UNLIMITED, "team_members": UNLIMITED,
            "deploys_monthly": _OFF, "log_retention_hours": _OFF, "shared_worker_executions_monthly": _OFF,
            "agent_credits_daily": UNLIMITED, "agent_credits_monthly": UNLIMITED,
            "private_pages": True, "auth_providers": True, "remove_branding": True, "api_access": True,
        },
        "features": ["Unlimited everything", "Priority support", "Private pages & auth"],
    },
]


def seed_default_plans(db: Session) -> None:
    """Create the free/pro/enterprise plans if the catalog is empty.

    Mirrors the seed pattern used by ``seed_system_themes``.  Idempotent: skips
    any slug that already exists, so admin edits are never overwritten.
    """
    now = datetime.now(timezone.utc).isoformat()
    created = 0
    for spec in _SEED_PLANS:
        if db.query(Plan).filter(Plan.slug == spec["slug"]).first():
            continue
        db.add(Plan(
            id=str(uuid.uuid4()),
            slug=spec["slug"],
            name=spec["name"],
            description=spec.get("description"),
            infra_mode=spec.get("infra_mode", "byo"),
            price_display=spec.get("price_display"),
            price_period=spec.get("price_period"),
            limits=json.dumps(spec.get("limits", {})),
            features=json.dumps(spec.get("features", [])),
            is_public=spec.get("is_public", False),
            is_active=True,
            is_default=spec.get("is_default", False),
            highlighted=spec.get("highlighted", False),
            badge=spec.get("badge"),
            sort_order=spec.get("sort_order", 0),
            created_at=now,
            updated_at=now,
        ))
        created += 1
    if created:
        db.commit()
        logger.info("[plan_limits] seeded %d default plans", created)


def prune_deprecated_plan_limits(db: Session) -> None:
    """Drop limit keys no longer in the registry from every plan's stored ``limits``.

    Keeps existing seeded plans editable when a key is retired (e.g. ``custom_domains`` moved
    to a managed add-on). Without this, ``validate_limits`` would reject admin edits of old
    plans that still carry the deprecated key. Idempotent; runs at startup.
    """
    known = set(_REGISTRY_BY_KEY)
    changed = 0
    for plan in db.query(Plan).all():
        raw = plan.limits
        if raw is None:
            continue
        try:
            data = json.loads(str(raw))
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(data, dict):
            continue
        stale = [k for k in data if k not in known]
        if not stale:
            continue
        for k in stale:
            data.pop(k, None)
        plan.limits = json.dumps(data)  # type: ignore[assignment]
        changed += 1
    if changed:
        db.commit()
        logger.info("[plan_limits] pruned deprecated keys from %d plan(s)", changed)
