"""Agent Settings Router — tenant / user-side Workspace Agent overrides.

Exposes the gear-icon modal's data plane:

    GET    /api/agent/settings          → effective merged settings
    PUT    /api/agent/settings          → upsert user (or tenant) override
    DELETE /api/agent/settings?scope=   → reset to lower layer / defaults

Identity resolution is edition-aware:
  * **Cloud** — ``get_tenant_context`` yields the SuperTokens (tenant user) or
    master-admin identity. ``tenant_id`` scopes the row.
  * **Self-host** — ``get_tenant_context`` returns ``None``; we fall back to the
    master-admin session. ``tenant_id`` is NULL and the row is keyed on the
    admin user id, so self-host users get the same per-user overrides.

Tenant-scope writes (``scope=tenant``) require the master admin / owner role.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Request

from app.database.config import SessionLocal
from app.middleware.tenant_context import TenantContext, get_tenant_context
from app.models.models import TenantAgentSettings
from app.schemas.agent_settings import (
    AgentSettings,
    SettingsResponse,
    SettingsUpdate,
)
from app.services.agent_settings import (
    apply_overrides_to_profile_cfg,  # noqa: F401  (re-exported for tests/consumers)
    load_effective_settings,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent/settings", tags=["Agent Settings"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_identity(
    request: Request, ctx: Optional[TenantContext]
) -> tuple[Optional[str], Optional[str], bool]:
    """Return ``(tenant_id, user_id, is_master)``, raising 401 if unauthenticated.

    Cloud: identity comes from the tenant context (SuperTokens or master cookie).
    Self-host: tenant context is None, so the master-admin session is used.
    """
    if ctx is not None:
        return ctx.tenant_id, ctx.user_id, bool(getattr(ctx, "is_master", False))

    # Self-host path — no tenant context; require a master-admin session.
    from .auth import get_current_user
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user.get("user_id") or user.get("id")
    return None, user_id, True


def _can_write_tenant(is_master: bool, role: str) -> bool:
    """Tenant-scope writes are admin-gated (master admin or tenant owner/admin)."""
    if is_master:
        return True
    return role in ("owner", "admin")


@router.get("", response_model=SettingsResponse)
async def get_agent_settings(
    request: Request,
    ctx: Optional[TenantContext] = Depends(get_tenant_context),
):
    """Return the effective merged settings the caller's next turn will use."""
    tenant_id, user_id, is_master = _resolve_identity(request, ctx)
    role = ctx.role if ctx is not None else "master"

    db = SessionLocal()
    try:
        settings, inherited = load_effective_settings(db, tenant_id, user_id)
    finally:
        db.close()

    return SettingsResponse(
        settings=settings,
        inherited_from=inherited,
        can_modify_tenant=_can_write_tenant(is_master, role),
    )


@router.put("", response_model=dict[str, Any])
async def update_agent_settings(
    payload: SettingsUpdate,
    request: Request,
    ctx: Optional[TenantContext] = Depends(get_tenant_context),
):
    """Upsert the caller's user override (``scope=user``) or tenant default
    (``scope=tenant``, admin-gated)."""
    tenant_id, user_id, is_master = _resolve_identity(request, ctx)
    role = ctx.role if ctx is not None else "master"

    if payload.scope == "tenant" and not _can_write_tenant(is_master, role):
        raise HTTPException(status_code=403, detail="Only admins can modify tenant-wide defaults")

    target_user_id: Optional[str] = None if payload.scope == "tenant" else user_id

    envelope = AgentSettings(general=payload.general, system=payload.system)
    settings_json = envelope.model_dump_json()
    now = _now()

    db = SessionLocal()
    try:
        existing = db.query(TenantAgentSettings).filter(
            TenantAgentSettings.tenant_id == tenant_id,
            TenantAgentSettings.user_id == target_user_id,
        ).first()

        if existing:
            existing.settings = settings_json
            existing.updated_at = now
        else:
            db.add(TenantAgentSettings(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                user_id=target_user_id,
                settings=settings_json,
                created_at=now,
                updated_at=now,
            ))
        db.commit()
    finally:
        db.close()

    logger.info(
        "[agent_settings] saved scope=%s tenant=%s user=%s",
        payload.scope, tenant_id, target_user_id,
    )
    return {"message": "Settings saved", "scope": payload.scope}


@router.delete("", response_model=dict[str, Any])
async def reset_agent_settings(
    request: Request,
    scope: str = "user",
    ctx: Optional[TenantContext] = Depends(get_tenant_context),
):
    """Delete the caller's user override (``scope=user``) or tenant default
    (``scope=tenant``, admin-gated), falling back to the lower layer."""
    tenant_id, user_id, is_master = _resolve_identity(request, ctx)
    role = ctx.role if ctx is not None else "master"

    if scope not in ("user", "tenant"):
        raise HTTPException(status_code=400, detail="scope must be 'user' or 'tenant'")
    if scope == "tenant" and not _can_write_tenant(is_master, role):
        raise HTTPException(status_code=403, detail="Only admins can reset tenant-wide defaults")

    target_user_id: Optional[str] = None if scope == "tenant" else user_id

    db = SessionLocal()
    try:
        deleted = db.query(TenantAgentSettings).filter(
            TenantAgentSettings.tenant_id == tenant_id,
            TenantAgentSettings.user_id == target_user_id,
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()

    logger.info(
        "[agent_settings] reset scope=%s rows=%s tenant=%s user=%s",
        scope, deleted, tenant_id, target_user_id,
    )
    return {"message": "Settings reset", "scope": scope, "deleted": deleted}
