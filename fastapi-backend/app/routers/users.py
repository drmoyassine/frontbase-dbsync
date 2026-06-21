"""
App User Management — Supabase/GoTrue Admin CRUD.

Manages the *app users* of a tenant's published site — the people who sign in to
a tenant's Frontbase app via the tenant's **own Supabase project (GoTrue)**. This
is distinct from platform team members (SuperTokens `TenantMember`, managed in
`routers/tenants.py`).

All endpoints are tenant‑gated (`require_tenant_context`) and reach the tenant's
Supabase Auth Admin API via `get_supabase_context(db, mode="builder")`, which
yields the `service_role_key` (`auth_key`). The service role authorizes admin
operations against GoTrue (`/auth/v1/admin/users`).

⚠️ Quota: deliberately NOT gated on `team_members` (that caps platform
collaborators, not end‑users). v1 leaves app‑user CRUD ungated by Frontbase
quotas; GoTrue/provider limits still apply. Add an `app_users` quota key later if
billing should cap end‑users.

Routes (mounted under /api/users in main.py):
  GET    /api/users            list/search app users
  POST   /api/users/invite     create + invite an app user
  PATCH  /api/users/{id}/state enable/disable (GoTrue ban)
  DELETE /api/users/{id}        delete an app user
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr

from app.core.credential_resolver import get_supabase_context
from app.database.config import SessionLocal
from app.middleware.tenant_context import TenantContext, require_tenant_context

logger = logging.getLogger(__name__)
router = APIRouter()

GOTRUE_TIMEOUT = 15.0


def _gotrue_context(db) -> dict:
    """Resolve the tenant's Supabase admin context or 404 with guidance."""
    ctx = get_supabase_context(db, mode="builder")
    if not ctx or not ctx.get("url") or not ctx.get("auth_key"):
        raise HTTPException(
            status_code=409,
            detail="No Supabase auth provider configured for this workspace. "
            "Connect one in Settings → Accounts before managing app users.",
        )
    return ctx


def _admin_headers(ctx: dict) -> dict[str, str]:
    return {
        "apikey": ctx["auth_key"],
        "Authorization": f"Bearer {ctx['auth_key']}",
        "Content-Type": "application/json",
    }


async def _gotrue(
    ctx: dict, method: str, path: str, *, json_body: Optional[dict] = None,
    params: Optional[dict] = None,
) -> Any:
    """Call the tenant's GoTrue Admin API; raise HTTPException on upstream error."""
    url = f"{ctx['url'].rstrip('/')}/auth/v1/admin{path}"
    try:
        resp = await httpx.AsyncClient(timeout=GOTRUE_TIMEOUT).request(
            method, url, headers=_admin_headers(ctx), json=json_body, params=params,
        )
    except httpx.HTTPError as exc:
        logger.warning("GoTrue admin call failed: %s %s -> %s", method, path, exc)
        raise HTTPException(status_code=502, detail=f"Auth provider unreachable: {exc}")
    if resp.status_code >= 400:
        detail = _safe_detail(resp)
        logger.warning("GoTrue admin %s %s -> %s: %s", method, path, resp.status_code, detail)
        raise HTTPException(status_code=resp.status_code, detail=detail)
    if resp.status_code == 204 or not resp.content:
        return None
    return resp.json()


def _safe_detail(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        if isinstance(body, dict) and body.get("msg"):
            return str(body["msg"])
        if isinstance(body, dict) and body.get("error_description"):
            return str(body["error_description"])
        return resp.text[:300]
    except Exception:
        return resp.text[:300]


def _summarize(u: dict) -> dict:
    """Project a GoTrue user record to the fields the UI needs."""
    return {
        "id": u.get("id"),
        "email": (u.get("email") or ""),
        "created_at": u.get("created_at"),
        "last_sign_in_at": u.get("last_sign_in_at"),
        # A user is "disabled" when banned_until is set and in the future.
        "banned_until": u.get("banned_until"),
        "disabled": bool(u.get("banned_until")),
    }


# ──────────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────────

class InviteRequest(BaseModel):
    email: EmailStr
    role: Optional[str] = None  # optional app-level role hint (app_metadata)


class UserStateRequest(BaseModel):
    disabled: bool


# ──────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────

@router.get("")
@router.get("/")
async def list_users(
    ctx: TenantContext = Depends(require_tenant_context),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, description="Filter by email (provider‑dependent)"),
):
    """List app users from GoTrue (paginated)."""
    db = SessionLocal()
    try:
        gotrue = _gotrue_context(db)
    finally:
        db.close()

    params: dict[str, Any] = {"page": page, "per_page": per_page}
    if search:
        params["email"] = search  # Supabase supports email filtering; ignored if unsupported
    data = await _gotrue(gotrue, "GET", "/users", params=params)
    users = data.get("users", []) if isinstance(data, dict) else []
    # GoTrue returns `auds`/`total` inconsistently across versions; approximate.
    total = None
    if isinstance(data, dict):
        total = data.get("total") or data.get("count")
    return {"users": [_summarize(u) for u in users], "total": total}


@router.post("/invite", status_code=201)
async def invite_user(
    body: InviteRequest,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Create an app user in GoTrue (email unconfirmed) and send an invite email."""
    db = SessionLocal()
    try:
        gotrue = _gotrue_context(db)
        created = await _gotrue(
            gotrue, "POST", "/users",
            json_body={
                "email": body.email,
                "email_confirm": False,
                "app_metadata": {"invited_by": ctx.tenant_slug or ctx.user_id, "role": body.role},
            },
        )
    finally:
        db.close()

    user = _summarize(created) if isinstance(created, dict) else {}

    # Send our own invite email (mirrors routers/settings.py invite flow) so the
    # recipient gets a Frontbase-branded invitation independent of GoTrue's mail.
    try:
        from app.services.email_service import send_email
        await send_email(
            to_email=body.email,
            subject="You're invited",
            content=(
                f"You have been invited to join as an app user. "
                f"Follow the sign-up link from the auth provider to set your password."
            ),
        )
    except Exception as exc:
        # The user was created; a failed notification must not fail the request.
        logger.warning("Invite email to %s failed: %s", body.email, exc)

    return {"success": True, "user": user}


@router.patch("/{user_id}/state")
async def set_user_state(
    user_id: str,
    body: UserStateRequest,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Enable (unban) or disable (ban) an app user via GoTrue."""
    db = SessionLocal()
    try:
        gotrue = _gotrue_context(db)
        # GoTrue: a long `ban_duration` disables; "none"/null re-enables.
        patch = {"ban_duration": "876000h"} if body.disabled else {"ban_duration": "none"}
        updated = await _gotrue(gotrue, "PUT", f"/users/{user_id}", json_body=patch)
    finally:
        db.close()
    return {"success": True, "user": _summarize(updated) if isinstance(updated, dict) else {"id": user_id}}


@router.delete("/{user_id}", status_code=200)
async def delete_user(
    user_id: str,
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Permanently delete an app user from GoTrue."""
    db = SessionLocal()
    try:
        gotrue = _gotrue_context(db)
        await _gotrue(gotrue, "DELETE", f"/users/{user_id}")
    finally:
        db.close()
    return {"success": True, "id": user_id}
