"""Tenant / user-side Workspace Agent settings — persistence + merge service.

Single source of truth for the three-layer settings merge consumed by both:

  * ``app.routers.agent_settings``  — GET returns the *effective* merged set
  * ``app.services.agent_executor`` — applies tenant/user overrides on top of
    the master-admin profile config before each turn

Layer precedence (lowest → highest):

    1. Profile defaults   (master admin / self-host per-profile config)
    2. Tenant default     (``tenant_agent_settings`` row, ``user_id`` IS NULL)
    3. User override      (``tenant_agent_settings`` row for the acting user)

Merge rules (deliberately crisp so behaviour is predictable):

  * **General** — per-field overlay; ``temperature`` / ``top_p`` /
    ``timeout_seconds`` always override, ``max_tokens`` overrides only when
    not ``None`` (``None`` ⇒ inherit the lower layer / model default).
  * **System prompt** — the *most specific* existing record is authoritative:
    if a user record exists its ``system`` block wins (even when disabled),
    otherwise the tenant record's, otherwise no custom prompt. The profile
    system prompt applies whenever no custom prompt is enabled.
"""
from __future__ import annotations

import logging
from json import JSONDecodeError, loads
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.models import TenantAgentSettings
from ..schemas.agent_settings import (
    AgentSettings,
    AgentSettingsGeneral,
    AgentSettingsSystem,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Row accessors
# =============================================================================

def _row_to_settings(row: TenantAgentSettings) -> AgentSettings:
    """Parse a stored JSON ``settings`` blob into a validated ``AgentSettings``.

    Defends against legacy / partial payloads: unknown keys are dropped and a
    missing envelope degrades to schema defaults rather than 500-ing a turn.
    """
    try:
        data = loads(row.settings)
    except (JSONDecodeError, TypeError):
        logger.warning("[agent_settings] corrupt settings blob id=%s — using defaults", row.id)
        return AgentSettings()

    general_data = data.get("general") or {}
    system_data = data.get("system") or {}
    try:
        general = AgentSettingsGeneral(**general_data)
    except Exception:  # pydantic ValidationError or bad coercion
        logger.warning("[agent_settings] invalid general block id=%s — using defaults", row.id)
        general = AgentSettingsGeneral()
    try:
        system = AgentSettingsSystem(**system_data)
    except Exception:
        logger.warning("[agent_settings] invalid system block id=%s — using defaults", row.id)
        system = AgentSettingsSystem()
    return AgentSettings(general=general, system=system)


def get_tenant_settings(db: Session, tenant_id: Optional[str]) -> Optional[AgentSettings]:
    """Tenant-wide default (``user_id`` IS NULL). ``None`` if no record / no tenant."""
    if tenant_id is None:
        return None
    row = db.query(TenantAgentSettings).filter(
        TenantAgentSettings.tenant_id == tenant_id,
        TenantAgentSettings.user_id.is_(None),
    ).first()
    return _row_to_settings(row) if row else None


def get_user_settings(
    db: Session, tenant_id: Optional[str], user_id: Optional[str]
) -> Optional[AgentSettings]:
    """A specific user's override. ``None`` if no record / no user."""
    if user_id is None:
        return None
    row = db.query(TenantAgentSettings).filter(
        TenantAgentSettings.tenant_id == tenant_id,
        TenantAgentSettings.user_id == user_id,
    ).first()
    return _row_to_settings(row) if row else None


# =============================================================================
# Merge
# =============================================================================

def _overlay_general(base: AgentSettingsGeneral, overlay: AgentSettingsGeneral) -> None:
    """Apply ``overlay`` general params onto ``base`` in place (per-field)."""
    base.temperature = overlay.temperature
    base.top_p = overlay.top_p
    base.timeout_seconds = overlay.timeout_seconds
    if overlay.max_tokens is not None:
        base.max_tokens = overlay.max_tokens


def load_effective_settings(
    db: Session,
    tenant_id: Optional[str],
    user_id: Optional[str],
    use_type: str = "workspace",
) -> tuple[AgentSettings, str]:
    """Compute the *effective* settings a turn will use, for display.

    Returns ``(settings, inherited_from)`` where ``inherited_from`` is the most
    specific layer that contributed: ``user`` | ``tenant`` | ``profile`` |
    ``default``.
    """
    # Layer 1 — profile (master admin tuning). General params only.
    general = AgentSettingsGeneral()
    system = AgentSettingsSystem()
    inherited = "default"

    try:
        from . import agent_quota
        profile_cfg = agent_quota.get_profile_config(db, use_type)
        profile_touched = False
        temp = _safe_float(profile_cfg.get("temperature"))
        top_p = _safe_float(profile_cfg.get("top_p"))
        max_tokens = _safe_int(profile_cfg.get("max_tokens"))
        if temp is not None:
            general.temperature = temp
            profile_touched = True
        if top_p is not None:
            general.top_p = top_p
            profile_touched = True
        if max_tokens is not None:
            general.max_tokens = max_tokens
            profile_touched = True
        if profile_touched:
            inherited = "profile"
    except Exception:
        logger.debug("[agent_settings] profile config unavailable — schema defaults", exc_info=True)

    # Layer 2 — tenant default
    tenant = get_tenant_settings(db, tenant_id)
    if tenant is not None:
        _overlay_general(general, tenant.general)
        if tenant.system.enabled:
            system = AgentSettingsSystem(enabled=True, custom_prompt=tenant.system.custom_prompt)
        inherited = "tenant"

    # Layer 3 — user override (authoritative for system when a record exists)
    user = get_user_settings(db, tenant_id, user_id)
    if user is not None:
        _overlay_general(general, user.general)
        # Most-specific record wins for system, even if disabled (explicit opt-out).
        system = AgentSettingsSystem(
            enabled=user.system.enabled,
            custom_prompt=user.system.custom_prompt if user.system.enabled else None,
        )
        inherited = "user"

    return AgentSettings(general=general, system=system), inherited


def apply_overrides_to_profile_cfg(
    profile_cfg: dict[str, Any],
    db: Session,
    tenant_id: Optional[str],
    user_id: Optional[str],
) -> None:
    """Mutate ``profile_cfg`` in place, layering tenant/user overrides on top.

    Called from ``agent_executor._resolve`` so the merged generation params +
    system prompt take effect for the turn. Only non-None / enabled values
    override the profile config.
    """
    tenant = get_tenant_settings(db, tenant_id)
    user = get_user_settings(db, tenant_id, user_id)

    # --- General params (per-field overlay) -------------------------------
    # Start from the profile values already in profile_cfg.
    temperature = _safe_float(profile_cfg.get("temperature"))
    max_tokens = _safe_int(profile_cfg.get("max_tokens"))
    top_p = _safe_float(profile_cfg.get("top_p"))

    if tenant is not None:
        temperature = tenant.general.temperature
        top_p = tenant.general.top_p
        if tenant.general.max_tokens is not None:
            max_tokens = tenant.general.max_tokens

    if user is not None:
        temperature = user.general.temperature
        top_p = user.general.top_p
        if user.general.max_tokens is not None:
            max_tokens = user.general.max_tokens

    if temperature is not None:
        profile_cfg["temperature"] = temperature
    if top_p is not None:
        profile_cfg["top_p"] = top_p
    if max_tokens is not None:
        profile_cfg["max_tokens"] = max_tokens

    # --- System prompt (most-specific enabled record wins) ---------------
    winner_system: Optional[AgentSettingsSystem] = None
    if user is not None:
        winner_system = user.system
    elif tenant is not None:
        winner_system = tenant.system

    if winner_system is not None and winner_system.enabled and (winner_system.custom_prompt or "").strip():
        profile_cfg["system_prompt"] = winner_system.custom_prompt.strip()


# =============================================================================
# Coercion helpers
# =============================================================================

def _safe_float(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _safe_int(val: Any) -> Optional[int]:
    if val is None or val == "":
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None
