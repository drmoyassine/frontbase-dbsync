"""
Tenant context extraction — FastAPI dependency.

Reads tenant identity from the session cookie.  Works for both:
- Master admin (cookie-based, is_master=True, tenant_id=None)
- Tenant users (SuperTokens JWT, is_master=False, tenant_id populated)

Usage in a router::

    from app.middleware.tenant_context import TenantContext, get_tenant_context

    @router.get("/items")
    async def list_items(ctx: TenantContext | None = Depends(get_tenant_context)):
        ...
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Request, HTTPException


@dataclass(frozen=True)
class TenantContext:
    """Decoded identity + tenant information from the session."""
    user_id: str
    email: str
    tenant_id: Optional[str]    # None for master admin / self-host
    tenant_slug: Optional[str]  # None for master admin / self-host
    role: str                   # owner | admin | editor | viewer | master
    is_master: bool


async def get_tenant_context(request: Request) -> Optional[TenantContext]:
    """FastAPI dependency — extract tenant context from cookie session.

    * **Self-host mode**: Returns ``None`` (no tenant scoping).
    * **Cloud mode**:
      1. Tries SuperTokens session first (tenant users — JWT-based).
      2. Falls back to master admin in-memory cookie session.
      Returns ``None`` only when neither session is present.

    This dual-path check is critical: tenant users authenticate via
    SuperTokens and have NO ``frontbase_session`` cookie.  Checking only
    the master admin cookie would always return ``None`` for tenants,
    silently bypassing every project-scoping guard.
    """
    from app.config.edition import is_cloud
    if not is_cloud():
        return None

    # -- Path 1: SuperTokens session (tenant users) ----------------------
    try:
        from supertokens_python.recipe.session.asyncio import get_session as st_get_session
        st_session = await st_get_session(request, session_required=False)
        if st_session:
            payload = st_session.get_access_token_payload()
            user_id = st_session.get_user_id()

            email = payload.get("email", "")
            if not email:
                try:
                    from supertokens_python.asyncio import get_user
                    st_user = await get_user(user_id)
                    if st_user and st_user.emails:
                        email = st_user.emails[0]
                except Exception:
                    pass

            return TenantContext(
                user_id=user_id,
                email=email,
                tenant_id=payload.get("tenant_id"),
                tenant_slug=payload.get("tenant_slug"),
                role=payload.get("role", "owner"),
                is_master=bool(payload.get("is_master", False)),
            )
    except Exception:
        pass  # No SuperTokens session — try master admin cookie

    # -- Path 2: Master admin cookie session -----------------------------
    from app.routers.auth import get_current_user
    user = get_current_user(request)
    if not user:
        return None  # Not authenticated — let the route decide what to do

    return TenantContext(
        user_id=user.get("user_id", user.get("id", "")),
        email=user.get("email", ""),
        tenant_id=user.get("tenant_id"),
        tenant_slug=user.get("tenant_slug"),
        role=user.get("role", "master"),
        is_master=user.get("is_master", False),
    )


async def require_tenant_context(request: Request) -> TenantContext:
    """Like ``get_tenant_context`` but 401s if context is ``None``."""
    ctx = await get_tenant_context(request)
    if ctx is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return ctx
