"""Response contracts for the auth domain (CF-22 P0 burn-down).

User payloads vary across the Supabase vs master-admin code paths, so `user` is
typed as `dict[str, Any]` rather than a fixed model — the envelope is the typed
contract. Blocklist and audit-logs return RAW lists today (envelope
inconsistency flagged by CF-21); typed as `list[...]` honestly until that is
standardized.
"""

from typing import Any, Optional

from pydantic import BaseModel


class UserPayload(BaseModel):
    """User dict embedded in auth responses (fields vary by code path)."""

    user: Optional[dict[str, Any]] = None
    message: Optional[str] = None
    tenant: Optional[dict[str, Any]] = None


class InviteInfo(BaseModel):
    email: str
    role: str
    tenant_name: Optional[str] = None
    tenant_slug: Optional[str] = None


class SlugCheck(BaseModel):
    available: bool
    slug: Optional[str] = None
    error: Optional[str] = None


# NOTE: MessageResponse lives in app.models.schemas (shared). Do NOT redefine
# it here — a duplicate class triggers a module-prefixed schema-name collision
# (enforced by scripts/openapi_check.py).


class ForgotPasswordResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error_code: Optional[str] = None
    dev_link: Optional[str] = None


class SuccessMessageResponse(BaseModel):
    """`{"success": bool, "message"?: str}` — blocklist ops, reset, bot toggle."""

    success: bool
    message: Optional[str] = None


class BlocklistEntry(BaseModel):
    id: Optional[str] = None
    ip_or_range: Optional[str] = None
    reason: Optional[str] = None
    created_at: Optional[Any] = None


class BotProtectionMetrics(BaseModel):
    solve_rate: float
    total_challenges: int
    blocked_solves: int
    banned_ips: int


class WafStatus(BaseModel):
    enabled: bool


class WafUpdateResponse(BaseModel):
    success: bool
    enabled: bool


class AuditLogEntry(BaseModel):
    id: Optional[str] = None
    user_id: Optional[Any] = None
    action: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Optional[Any] = None
    created_at: Optional[Any] = None
