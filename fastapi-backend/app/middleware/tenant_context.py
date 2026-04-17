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

    * **Cloud mode**: Verifies SuperTokens session.
      Returns a ``TenantContext`` or raises 401.
    * **Self-host mode**: Returns ``None`` (no tenant scoping).
    """
    if not is_cloud():
        return None

    from supertokens_python.recipe.session.asyncio import get_session
    from supertokens_python.recipe.session.exceptions import try_refresh_token
    try:
        session = await get_session(request, session_required=True)
    except Exception as e:
        # SuperTokens throws specific errors, we catch all and map to 401
        raise HTTPException(status_code=401, detail="Missing or invalid session")

    if not session:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = session.get_user_id()
    claims = session.get_access_token_payload()

    return TenantContext(
        user_id=user_id,
        email=claims.get("email", ""),
        tenant_id=claims.get("tenant_id"),
        tenant_slug=claims.get("tenant_slug"),
        role=claims.get("role", "viewer"),
        is_master=claims.get("is_master", False),
    )


async def require_tenant_context(request: Request) -> TenantContext:
    """Like ``get_tenant_context`` but 401s if context is ``None``."""
    ctx = await get_tenant_context(request)
    if ctx is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return ctx
