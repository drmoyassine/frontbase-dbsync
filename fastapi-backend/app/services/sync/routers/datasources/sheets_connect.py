"""
Google Sheets add-on connect flow.

The Sheets add-on is a setup wizard that deploys the Apps Script Web App into the
user's Drive behind the scenes and registers it with Frontbase. This router backs
that handshake:

    POST /sheets/connect/issue      — tenant-authed; mints a short-lived, single-use
                                      connect token (Redis) bound to {tenant, project}.
    POST /sheets/connect/callback   — called by the add-on with the token + the
                                      freshly-deployed Web App URL/secret; validates
                                      the token (atomic GETDEL), upserts a google_sheets
                                      Connected Account (EdgeProviderAccount).
    GET  /sheets/connect/status     — polled by the modal until the callback lands.

Phase 2: Callback creates a Connected Account instead of a Datasource.
The account stores webAppSecret encrypted and webAppUrl/spreadsheetId in metadata.
At datasource-create time, the AccountResourcePicker resolves the account.
"""

import hashlib
import json
import logging
import os
import secrets
import uuid
import datetime
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, constr
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, Session

from app.middleware.tenant_context import TenantContext, get_tenant_context
from app.models.models import Project, EdgeProviderAccount
from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource, DatasourceType
from app.services.sync.redis_client import cache_get, cache_getdel, cache_set
from app.services.sync.services.schema_service import SchemaService

from app.core.security import encrypt_field, encrypt_credentials
from app.database.config import SessionLocal as MainSessionLocal

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.sheets_connect")

# Single-use connect tokens live 15 minutes.
_CONNECT_TOKEN_TTL = 900
_TOKEN_PREFIX = "frontbase:sheets:connect:"


# ─────────────────────────── request / response models ────────────────────────

class SheetsConnectIssueRequest(BaseModel):
    """Optional reconnect target. If omitted, a new datasource is created."""
    datasource_id: Optional[constr(max_length=100)] = None


class SheetsConnectIssueResponse(BaseModel):
    token: str
    addonInstallUrl: str
    expiresAt: datetime


class SheetsConnectCallback(BaseModel):
    # Token is 256-bit (43 chars base64url), but allow room for future changes
    token: constr(min_length=10, max_length=128) = Field(..., description="Connect token from /issue")
    # Google Spreadsheet IDs are typically 44 chars but can vary
    spreadsheetId: constr(min_length=1, max_length=100) = Field(..., description="Google Sheet ID")
    spreadsheetName: Optional[constr(max_length=500)] = Field(None, description="Human-readable sheet name")
    # Web App URLs can be long, but cap at reasonable limit
    webAppUrl: constr(min_length=10, max_length=1000) = Field(..., description="Apps Script Web App exec URL")
    # Secret should match our generation (32 chars for add-on, user-defined for manual)
    webAppSecret: constr(min_length=8, max_length=256) = Field(..., description="Shared secret for Web App")


class SheetsConnectResult(BaseModel):
    ok: bool
    accountId: Optional[str] = None


class SheetsConnectStatus(BaseModel):
    connected: bool
    accountId: Optional[str] = None
    spreadsheetName: Optional[str] = None


# ───────────────────────────────── helpers ────────────────────────────────────

def _addon_install_url() -> str:
    """Workspace add-on install link (set via FRONTBASE_SHEETS_ADDON_URL)."""
    return os.environ.get("FRONTBASE_SHEETS_ADDON_URL", "")


async def _resolve_project_id(db: AsyncSession, ctx: Optional[TenantContext]) -> Optional[str]:
    """Mirror crud.create_datasource: master admin → None; tenant → their project id."""
    if not ctx or not ctx.tenant_id:
        return None
    result = await db.execute(select(Project).where(Project.tenant_id == ctx.tenant_id))
    project = result.scalar_one_or_none()
    return str(project.id) if project else None


async def _check_rate_limit(request: Request, identifier: str, max_attempts: int = 5, window_seconds: int = 60) -> bool:
    """Rate limit callback attempts using Redis.

    Args:
        request: FastAPI request (for client IP fallback)
        identifier: Unique key to rate limit (e.g., token hash or IP)
        max_attempts: Maximum attempts allowed in the window
        window_seconds: Time window in seconds

    Returns:
        True if within rate limit, False if limit exceeded

    Uses Redis INCR with expiration to track attempts per identifier.
    """
    # Get client IP as fallback identifier
    client_ip = request.client.host if request.client else "unknown"
    key = f"{_TOKEN_PREFIX}ratelimit:{identifier}:{client_ip}"

    # Get current count
    current = await cache_get(None, key)
    attempts = int(current) if current else 0

    if attempts >= max_attempts:
        logger.warning(
            "Sheets connect rate limit exceeded for identifier=%s ip=%s attempts=%s",
            identifier, client_ip, attempts
        )
        return False

    # Increment with expiration
    new_count = attempts + 1
    await cache_set(None, key, new_count, ttl=window_seconds)
    return True


# ─────────────────────────────── endpoints ────────────────────────────────────

@router.post("/sheets/connect/issue/", response_model=SheetsConnectIssueResponse)
async def sheets_connect_issue(
    body: Optional[SheetsConnectIssueRequest] = None,
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Mint a single-use connect token for the Sheets add-on.

    Tenant-scoped: the token is bound to the caller's tenant + project so the
    unauthenticated add-on callback can only ever write into this scope.
    (In cloud, ``get_tenant_context`` already 401s unauthenticated callers; in
    self-host it returns None and project_id is None — consistent with crud.py.)
    """
    project_id = await _resolve_project_id(db, ctx)

    token = secrets.token_urlsafe(32)
    payload: Dict[str, Any] = {
        "tenant_id": ctx.tenant_id if ctx else None,
        "tenant_slug": ctx.tenant_slug if ctx else None,
        "is_master": bool(ctx.is_master) if ctx else False,
        "project_id": project_id,
        "datasource_id": (body.datasource_id if body else None) or None,
    }

    ok = await cache_set(
        None, f"{_TOKEN_PREFIX}pending:{token}", payload, ttl=_CONNECT_TOKEN_TTL
    )
    if not ok:
        # Redis unavailable — refuse rather than fall back to an insecure model.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Connect token store unavailable (Redis)",
        )

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=_CONNECT_TOKEN_TTL)

    logger.info(
        "Issued Sheets connect token for tenant=%s project=%s reconnect_ds=%s",
        payload["tenant_id"], payload["project_id"], payload["datasource_id"],
    )
    return SheetsConnectIssueResponse(
        token=token,
        addonInstallUrl=_addon_install_url(),
        expiresAt=expires_at,
    )


@router.post("/sheets/connect/callback/", response_model=SheetsConnectResult)
async def sheets_connect_callback(
    body: SheetsConnectCallback,
    db: AsyncSession = Depends(get_db),
    main_db: Session = Depends(MainSessionLocal),
    request: Request = None,  # type: ignore[assignment]
):
    """Add-on callback: validate token, upsert a google_sheets Connected Account.

    Phase 2: Creates an EdgeProviderAccount in the main DB (not a Datasource).
    Stores webAppSecret encrypted and webAppUrl/spreadsheetId in provider_metadata.

    No tenant session — the token IS the credential (random, single-use, scoped).
    Rate limited to prevent brute force or DoS attacks.
    """
    # Rate limit: 5 attempts per token per 60 seconds (prevents brute force)
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()[:16]
    if not await _check_rate_limit(request, token_hash, max_attempts=5, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please wait before retrying.",
        )

    # Atomic consume — the token can never authorize more than one callback.
    payload = await cache_getdel(None, f"{_TOKEN_PREFIX}pending:{body.token}")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Connect token is invalid, expired, or already used",
        )

    project_id = payload.get("project_id")
    token_tenant_id = payload.get("tenant_id")

    # Build credential storage for google_sheets provider.
    # Secrets (encrypted): webAppSecret
    # Metadata (cleartext): webAppUrl, spreadsheetId, spreadsheetName
    sheet_label = body.spreadsheetName or "Google Sheet"
    secrets = {"webAppSecret": body.webAppSecret}
    metadata = {
        "spreadsheetId": body.spreadsheetId,
        "webAppUrl": body.webAppUrl,
        "spreadsheetName": sheet_label,
    }

    credentials_str = encrypt_credentials(secrets)
    metadata_str = json.dumps(metadata)

    now = datetime.datetime.now(datetime.UTC).isoformat()

    # Dedup: reuse an existing google_sheets account with the same spreadsheetId in this project
    provider: Optional[EdgeProviderAccount] = None
    query = main_db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.provider == "google_sheets",
        EdgeProviderAccount.project_id == project_id,
    )
    for existing in query.all():
        try:
            existing_meta = json.loads(str(existing.provider_metadata or "{}"))
        except (json.JSONDecodeError, TypeError):
            existing_meta = {}
        if existing_meta.get("spreadsheetId") == body.spreadsheetId:
            provider = existing
            break

    if provider is not None:
        # Update in place
        provider.provider_credentials = credentials_str
        provider.provider_metadata = metadata_str
        provider.name = sheet_label
        provider.updated_at = now
        main_db.commit()
        main_db.refresh(provider)
        logger.info(
            "Sheets connect: updated existing account=%s for spreadsheet=%s",
            provider.id, body.spreadsheetId,
        )
    else:
        # Create new Connected Account
        provider = EdgeProviderAccount(
            id=str(uuid.uuid4()),
            name=sheet_label,
            project_id=project_id,
            provider="google_sheets",
            provider_credentials=credentials_str,
            provider_metadata=metadata_str,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        main_db.add(provider)
        main_db.commit()
        main_db.refresh(provider)
        logger.info(
            "Sheets connect: created new account=%s for spreadsheet=%s",
            provider.id, body.spreadsheetId,
        )

    # Surface the result for the /status poller (not single-use — modal polls).
    result_payload = {
        "connected": True,
        "accountId": str(provider.id),
        "spreadsheetName": sheet_label,
    }
    await cache_set(
        None,
        f"{_TOKEN_PREFIX}result:{body.token}",
        result_payload,
        ttl=_CONNECT_TOKEN_TTL,
    )

    logger.info(
        "Sheets connected: accountId=%s project=%s spreadsheet=%s",
        provider.id, project_id, body.spreadsheetId,
    )
    return SheetsConnectResult(ok=True, accountId=str(provider.id))


@router.get("/sheets/connect/status/", response_model=SheetsConnectStatus)
async def sheets_connect_status(token: str):
    """Polled by the modal until the add-on callback completes the connection.

    Phase 2: Returns accountId (Connected Account) instead of datasourceId.
    """
    if len(token) < 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

    result = await cache_get(None, f"{_TOKEN_PREFIX}result:{token}")
    if result and result.get("connected"):
        return SheetsConnectStatus(
            connected=True,
            accountId=result.get("accountId"),
            spreadsheetName=result.get("spreadsheetName"),
        )
    return SheetsConnectStatus(connected=False)


__all__ = ["router"]
