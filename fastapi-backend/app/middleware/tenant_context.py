"""
Tenant context extraction — FastAPI dependency.

Reads tenant identity from the session cookie.  Works for both:
- Master admin (cookie-based, is_master=True, tenant_id=None)
- Tenant users (Provider-specific JWT/session, is_master=False, tenant_id populated)

Supports multiple auth providers:
- SuperTokens (default for cloud mode)
- Supabase (when AUTH_PROVIDER=supabase)

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
    # Multi-project: the project the request targets (from the X-Project-Id header).
    # Untrusted — get_project() validates it belongs to the tenant before use.
    active_project_id: Optional[str] = None


async def get_tenant_context(request: Request) -> Optional[TenantContext]:
    """FastAPI dependency — extract tenant context from session.

    * **Self-host mode**: Returns ``None`` (no tenant scoping).
    * **Cloud mode**:
      1. Tries configured auth provider session first (tenant users).
      2. Falls back to master admin in-memory cookie session.
      Returns ``None`` only when neither session is present.

    Supports multiple auth providers (SuperTokens, Supabase) selected
    via AUTH_PROVIDER env var.
    """
    from app.config.edition import is_cloud
    if not is_cloud():
        return None

    # -- Path 1: Provider session (tenant users) ------------------------
    try:
        from app.auth.provider import get_auth_provider
        provider = get_auth_provider()
        if provider:
            session_data = await provider.validate_session(request)
            if session_data:
                # Tag the current Sentry request scope with the acting identity.
                # No-op when Sentry is off; guarded so it can never affect auth.
                from app.services.observability import set_request_user
                set_request_user(
                    user_id=session_data.get("user_id"),
                    email=session_data.get("email"),
                    tenant_id=session_data.get("tenant_id"),
                    role=session_data.get("role", "owner"),
                )

                # 🔒 TENANT IP BLOCKLIST CHECK: Enforce tenant-specific blocks after JWT resolution
                # This prevents cross-tenant blocking while maintaining per-tenant security
                tenant_id = session_data.get("tenant_id")
                if tenant_id:
                    client_ip = request.client.host if request.client else None
                    if client_ip:
                        from main import check_tenant_blocklist
                        if await check_tenant_blocklist(tenant_id, client_ip):
                            raise HTTPException(
                                status_code=403,
                                detail="Forbidden: Your IP address has been blocked for this tenant."
                            )

                return TenantContext(
                    user_id=session_data["user_id"],
                    email=session_data["email"],
                    tenant_id=session_data.get("tenant_id"),
                    tenant_slug=session_data.get("tenant_slug"),
                    role=session_data.get("role", "owner"),
                    is_master=bool(session_data.get("is_master", False)),
                    active_project_id=request.headers.get("x-project-id"),
                )
    except Exception:
        pass  # No provider session — try master admin cookie

    # -- Path 2: Master admin cookie session -----------------------------
    from app.routers.auth import get_current_user
    user = get_current_user(request)
    if not user:
        if is_cloud():
            raise HTTPException(status_code=401, detail="Authentication required")
        return None

    # Tag Sentry scope for the master-admin identity (no-op when Sentry is off).
    from app.services.observability import set_request_user
    set_request_user(
        user_id=user.get("user_id", user.get("id", "")),
        email=user.get("email", ""),
        tenant_id=user.get("tenant_id"),
        role=user.get("role", "master"),
    )

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
