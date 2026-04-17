"""
Tenant context extraction — FastAPI dependency.

In cloud mode, extracts user identity and tenant context from the
``Authorization: Bearer <JWT>`` header.  In self-host mode, returns
``None`` so that callers can skip tenant scoping.

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

from app.config.edition import is_cloud


@dataclass(frozen=True)
class TenantContext:
    """Decoded identity + tenant information from a cloud-mode JWT."""
    user_id: str
    email: str
    tenant_id: Optional[str]    # None for master admin
    tenant_slug: Optional[str]  # None for master admin
    role: str                   # owner | admin | editor | viewer | master
    is_master: bool


async def get_tenant_context(request: Request) -> Optional[TenantContext]:
    """FastAPI dependency — extract tenant context from request.

    * **Cloud mode**: Will verify SuperTokens session once frontend
      auth integration is complete.  Currently returns ``None``
      (same as self-host) because the frontend still uses cookie auth.
    * **Self-host mode**: Returns ``None`` (no tenant scoping).
    """
    # TODO: Activate SuperTokens session verification once the frontend
    #       SuperTokens integration is wired up.  Until then, fall through
    #       to cookie-based auth so the app remains functional.
    #
    # if not is_cloud():
    #     return None
    #
    # from supertokens_python.recipe.session.asyncio import get_session
    # try:
    #     session = await get_session(request, session_required=True)
    # except Exception:
    #     raise HTTPException(status_code=401, detail="Missing or invalid session")
    #
    # if not session:
    #     raise HTTPException(status_code=401, detail="Authentication required")
    #
    # user_id = session.get_user_id()
    # claims = session.get_access_token_payload()
    #
    # return TenantContext(
    #     user_id=user_id,
    #     email=claims.get("email", ""),
    #     tenant_id=claims.get("tenant_id"),
    #     tenant_slug=claims.get("tenant_slug"),
    #     role=claims.get("role", "viewer"),
    #     is_master=claims.get("is_master", False),
    # )
    return None


async def require_tenant_context(request: Request) -> TenantContext:
    """Like ``get_tenant_context`` but 401s if context is ``None``."""
    ctx = await get_tenant_context(request)
    if ctx is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return ctx
