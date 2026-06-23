"""
Auth Router - Dual-Mode Authentication Endpoints

Self-host mode: Session-based auth with env-var admin (ADMIN_EMAIL/ADMIN_PASSWORD).
Cloud mode: SuperTokens emailpassword for tenant users + env-var master admin.

Both modes share the same routes — the login endpoint checks master admin
first (env-var), then falls through to SuperTokens (cloud only).
"""

from fastapi import APIRouter, HTTPException, Response, Request, Depends, BackgroundTasks
from pydantic import BaseModel, EmailStr
from app.middleware.tenant_context import TenantContext, get_tenant_context
from typing import Optional, Literal, cast
import os
import json
import hashlib
import secrets
import logging
import uuid
import ipaddress
from datetime import datetime, timedelta, timezone, UTC

from app.config.edition import is_cloud
from app.database.config import get_db, SessionLocal
from app.models.models import IPBlocklist, AuditLog
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# ─────────────────────────────────────────────────────────────────────────────
# Master Admin (env-var based — works in BOTH modes)
# ─────────────────────────────────────────────────────────────────────────────

# In-memory session storage for master admin only
sessions: dict[str, dict] = {}

SESSION_COOKIE_NAME = "frontbase_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

ADMIN_USERS = {
    os.getenv("ADMIN_EMAIL", "admin@frontbase.dev"): {
        "id": "admin-1",
        "email": os.getenv("ADMIN_EMAIL", "admin@frontbase.dev"),
        "password_hash": hashlib.sha256(
            os.getenv("ADMIN_PASSWORD", "admin123").encode()
        ).hexdigest(),
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }
}


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    website: Optional[str] = None
    turnstile_token: Optional[str] = None


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    workspace_name: str
    slug: str


class AcceptInviteRequest(BaseModel):
    token: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    website: Optional[str] = None
    turnstile_token: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    token: str
    password: str
    website: Optional[str] = None
    turnstile_token: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    username: Optional[str] = None
    created_at: str
    updated_at: str
    tenant_id: Optional[str] = None
    tenant_slug: Optional[str] = None
    role: Optional[str] = None
    is_master: Optional[bool] = False


class AuthResponse(BaseModel):
    user: UserResponse
    message: str


class IPBlockRequest(BaseModel):
    ip_or_range: str
    reason: Optional[str] = None


class WafUpdateRequest(BaseModel):
    enabled: bool


class BotProtectionSettings(BaseModel):
    enabled: bool = False
    provider: Literal["cloudflare", "recaptcha_v2", "recaptcha_v3"] = "cloudflare"
    site_key: str = ""
    secret_key: str = ""
    protect_login: bool = True
    protect_forgot_password: bool = True
    recaptcha_v3_threshold: float = 0.5
    widget_theme: Literal["light", "dark", "auto"] = "auto"
    widget_size: Literal["normal", "compact", "invisible"] = "normal"
    auto_ban_lockout_hours: int = 24

class BotProtectionUpdateRequest(BaseModel):
    enabled: bool
    provider: Literal["cloudflare", "recaptcha_v2", "recaptcha_v3"]
    site_key: str
    secret_key: str
    protect_login: bool
    protect_forgot_password: bool
    recaptcha_v3_threshold: float
    widget_theme: Literal["light", "dark", "auto"]
    widget_size: Literal["normal", "compact", "invisible"]
    auto_ban_lockout_hours: int


# ─────────────────────────────────────────────────────────────────────────────
# SPA Protection & Bot Prevention Helpers
# ─────────────────────────────────────────────────────────────────────────────

# In-memory registry to track failed attempts per (IP + email)
# Format: { "ip:email": { "attempts": int, "locked_until": datetime } }
FAILED_LOGIN_ATTEMPTS: dict[str, dict] = {}

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15


def get_lockout_key(request: Request, email: str) -> str:
    """Generate a unique tracking key for IP + email combination."""
    ip = request.client.host if request.client else "unknown"
    return f"{ip}:{email.strip().lower()}"


async def check_lockout(request: Request, email: str) -> None:
    """Check if the client is currently locked out."""
    key = get_lockout_key(request, email)
    
    # 1. Try Redis first
    redis_url = None
    cache_get_fn = None
    try:
        from app.services.sync.redis_client import cache_get, get_configured_redis_settings
        cache_get_fn = cache_get
        redis_settings = await get_configured_redis_settings()
        redis_url = redis_settings.get("url") if redis_settings and redis_settings.get("enabled") else None
    except Exception:
        pass
        
    if redis_url and cache_get_fn is not None:
        try:
            locked_until_str = await cache_get_fn(redis_url, f"security:lockout:{key}")
            if locked_until_str:
                locked_until = datetime.fromisoformat(locked_until_str)
                if datetime.now(UTC) < locked_until:
                    remaining_seconds = int((locked_until - datetime.now(UTC)).total_seconds())
                    remaining_minutes = max(1, remaining_seconds // 60)
                    logger.warning(f"[Auth] Blocked locked out client {key} via Redis for {remaining_minutes} more minutes.")
                    raise HTTPException(
                        status_code=429,
                        detail=f"Too many failed attempts. Please try again in {remaining_minutes} minutes."
                    )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"[Auth] Redis check_lockout failed, falling back: {e}")

    # 2. Local Fallback
    entry = FAILED_LOGIN_ATTEMPTS.get(key)
    if entry:
        locked_until = entry.get("locked_until")
        if locked_until and datetime.now(UTC) < locked_until:
            remaining_seconds = int((locked_until - datetime.now(UTC)).total_seconds())
            remaining_minutes = max(1, remaining_seconds // 60)
            logger.warning(f"[Auth] Blocked locked out client {key} via L1 memory for {remaining_minutes} more minutes.")
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed attempts. Please try again in {remaining_minutes} minutes."
            )


async def record_failed_attempt(request: Request, email: str) -> None:
    """Record a failed login/reset attempt and lock out if threshold is reached."""
    key = get_lockout_key(request, email)
    
    # 1. Try Redis first
    redis_url = None
    cache_get_fn = None
    cache_set_fn = None
    try:
        from app.services.sync.redis_client import cache_get, cache_set, get_configured_redis_settings
        cache_get_fn = cache_get
        cache_set_fn = cache_set
        redis_settings = await get_configured_redis_settings()
        redis_url = redis_settings.get("url") if redis_settings and redis_settings.get("enabled") else None
    except Exception:
        pass
        
    if redis_url and cache_get_fn is not None and cache_set_fn is not None:
        try:
            fail_key = f"security:login_fail:{key}"
            attempts_str = await cache_get_fn(redis_url, fail_key)
            attempts = int(attempts_str) if attempts_str is not None else 0
            attempts += 1
            
            if attempts >= MAX_FAILED_ATTEMPTS:
                lockout_until = datetime.now(UTC) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
                lockout_key = f"security:lockout:{key}"
                await cache_set_fn(redis_url, lockout_key, lockout_until.isoformat(), ttl=LOCKOUT_DURATION_MINUTES * 60)
                await cache_set_fn(redis_url, fail_key, None, ttl=1)
                logger.warning(f"[Auth] Client {key} reached max failed attempts. Locked out for {LOCKOUT_DURATION_MINUTES} minutes (Redis).")
                return
            else:
                attempts_left = MAX_FAILED_ATTEMPTS - attempts
                await cache_set_fn(redis_url, fail_key, attempts, ttl=900)
                logger.info(f"[Auth] Failed attempt {attempts} for client {key}. {attempts_left} attempts remaining (Redis).")
                return
        except Exception as e:
            logger.warning(f"[Auth] Redis record_failed_attempt failed, falling back: {e}")

    # 2. Local Fallback
    entry = FAILED_LOGIN_ATTEMPTS.setdefault(key, {"attempts": 0, "locked_until": None})
    entry["attempts"] += 1
    
    if entry["attempts"] >= MAX_FAILED_ATTEMPTS:
        entry["locked_until"] = datetime.now(UTC) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        logger.warning(f"[Auth] Client {key} reached max failed attempts. Locked out for {LOCKOUT_DURATION_MINUTES} minutes (L1 memory).")
    else:
        attempts_left = MAX_FAILED_ATTEMPTS - entry["attempts"]
        logger.info(f"[Auth] Failed attempt {entry['attempts']} for client {key}. {attempts_left} attempts remaining (L1 memory).")


async def clear_failed_attempts(request: Request, email: str) -> None:
    """Clear failed attempts upon successful login/reset."""
    key = get_lockout_key(request, email)
    
    # 1. Try Redis first
    redis_url = None
    cache_set_fn = None
    try:
        from app.services.sync.redis_client import cache_set, get_configured_redis_settings
        cache_set_fn = cache_set
        redis_settings = await get_configured_redis_settings()
        redis_url = redis_settings.get("url") if redis_settings and redis_settings.get("enabled") else None
    except Exception:
        pass
        
    if redis_url and cache_set_fn is not None:
        try:
            await cache_set_fn(redis_url, f"security:login_fail:{key}", None, ttl=1)
            await cache_set_fn(redis_url, f"security:lockout:{key}", None, ttl=1)
            logger.info(f"[Auth] Cleared failed login attempts for client {key} (Redis).")
        except Exception as e:
            logger.warning(f"[Auth] Redis clear_failed_attempts failed: {e}")

    # 2. Local Fallback
    FAILED_LOGIN_ATTEMPTS.pop(key, None)


def check_honeypot(website: Optional[str]) -> None:
    """Verify that the honeypot field is empty."""
    if website:
        logger.warning("[Auth] Honeypot field filled. Silently rejecting bot request.")
        raise HTTPException(
            status_code=400,
            detail="Invalid request details."
        )


_BOT_STRIKES: dict[str, list[float]] = {}


async def verify_bot_token(token: Optional[str], ip_address: str, route: Literal["login", "forgot_password"]) -> None:
    """Verify Turnstile or reCAPTCHA token using DB settings or fallback env vars."""
    from app.routers.settings import load_settings
    settings_dict = load_settings()
    bot_settings = settings_dict.get("security", {}).get("bot_protection", {})
    
    enabled = bool(bot_settings.get("enabled", False))
    provider = str(bot_settings.get("provider", "cloudflare"))
    site_key = str(bot_settings.get("site_key", ""))
    secret_key = str(bot_settings.get("secret_key", ""))
    protect_login = bool(bot_settings.get("protect_login", True))
    protect_forgot_password = bool(bot_settings.get("protect_forgot_password", True))
    recaptcha_v3_threshold = float(bot_settings.get("recaptcha_v3_threshold", 0.5))
    
    # Fallback to Env vars if database config is not enabled/configured
    if not enabled:
        env_secret = os.getenv("TURNSTILE_SECRET_KEY")
        if not env_secret:
            # If nothing is configured or enabled, bypass (fail-safe)
            return
        provider = "cloudflare"
        secret_key = env_secret
        protect_login = True
        protect_forgot_password = True
        
    # Check if protection is enabled for this specific route
    if route == "login" and not protect_login:
        return
    if route == "forgot_password" and not protect_forgot_password:
        return

    # If enabled, token must be provided
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Bot verification token is missing. Please refresh and try again."
        )

    # Resolve Verification URL
    if provider == "cloudflare":
        verify_url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    else:
        verify_url = "https://www.google.com/recaptcha/api/siteverify"

    import httpx
    import time
    success = False
    details_str = ""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                verify_url,
                data={
                    "secret": secret_key,
                    "response": token,
                    "remoteip": ip_address
                },
                timeout=5.0
            )
            data = resp.json()
            
            if data.get("success"):
                if provider == "recaptcha_v3":
                    score = float(data.get("score", 1.0))
                    if score < recaptcha_v3_threshold:
                        details_str = f"reCAPTCHA v3 blocked: score {score} < threshold {recaptcha_v3_threshold}"
                    else:
                        success = True
                else:
                    success = True
            else:
                error_codes = data.get("error-codes", [])
                details_str = f"Verification failed: {error_codes}"
    except httpx.RequestError as e:
        logger.error(f"[Auth] Bot verification API request failed: {e}. Bypassing verification (fail-safe).")
        return
    except Exception as e:
        logger.error(f"[Auth] Bot verification exception: {e}. Bypassing verification (fail-safe).")
        return

    # Handle Outcomes and Logging
    db = SessionLocal()
    try:
        if success:
            audit_log = AuditLog(
                id=str(uuid.uuid4()),
                user_id="anonymous",
                action="BOT_CHALLENGE_SUCCESS",
                ip_address=ip_address,
                details=f"Bot challenge passed using {provider} for {route}",
                created_at=datetime.now(UTC).isoformat() + "Z"
            )
            db.add(audit_log)
            db.commit()
        else:
            audit_log = AuditLog(
                id=str(uuid.uuid4()),
                user_id="anonymous",
                action="BOT_CHALLENGE_FAILED",
                ip_address=ip_address,
                details=f"Bot challenge failed using {provider} for {route}. Details: {details_str}",
                created_at=datetime.now(UTC).isoformat() + "Z"
            )
            db.add(audit_log)
            db.commit()
            
            # Increment failure strikes for IP
            now = time.time()
            strikes = _BOT_STRIKES.get(ip_address, [])
            strikes = [t for t in strikes if now - t < 600]  # 10 minutes sliding window
            strikes.append(now)
            _BOT_STRIKES[ip_address] = strikes
            
            if len(strikes) >= 5:
                existing = db.query(IPBlocklist).filter(IPBlocklist.ip_or_range == ip_address).first()
                if not existing:
                    new_ban = IPBlocklist(
                        id=str(uuid.uuid4()),
                        ip_or_range=ip_address,
                        reason="Bot Protection Auto-Ban (Repeated Failures)",
                        created_at=datetime.now(UTC).isoformat() + "Z"
                    )
                    db.add(new_ban)
                    
                    ban_audit = AuditLog(
                        id=str(uuid.uuid4()),
                        user_id="anonymous",
                        action="IP_AUTO_BANNED",
                        ip_address=ip_address,
                        details="IP blocked for repeated bot verification failures",
                        created_at=datetime.now(UTC).isoformat() + "Z"
                    )
                    db.add(ban_audit)
                    db.commit()
                    
                    try:
                        from main import invalidate_blocklist_cache
                        invalidate_blocklist_cache()
                    except Exception:
                        pass
                    
            raise HTTPException(
                status_code=400,
                detail="Bot verification failed. Please try again."
            )
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Master Admin Session Helpers
# ─────────────────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash password with SHA256 (master admin only — ST uses bcrypt)."""
    return hashlib.sha256(password.encode()).hexdigest()


def create_session(
    user_id: str,
    email: str,
    *,
    tenant_id: Optional[str] = None,
    tenant_slug: Optional[str] = None,
    role: str = "master",
    is_master: bool = True,
) -> str:
    """Create a new master admin session and return session token."""
    token = secrets.token_urlsafe(32)
    sessions[token] = {
        "user_id": user_id,
        "email": email,
        "tenant_id": tenant_id,
        "tenant_slug": tenant_slug,
        "role": role,
        "is_master": is_master,
        "created_at": datetime.now(UTC).isoformat(),
        "expires_at": (datetime.now(UTC) + timedelta(seconds=SESSION_MAX_AGE)).isoformat(),
    }
    return token


def get_session(token: str) -> Optional[dict]:
    """Get master admin session by token if valid."""
    session = sessions.get(token)
    if not session:
        return None

    expires_at = datetime.fromisoformat(session["expires_at"])
    if datetime.now(UTC) > expires_at:
        del sessions[token]
        return None

    return session


async def log_security_event(db: Session, user_id: str, action: str, ip_address: Optional[str], user_agent: Optional[str], details: Optional[str] = None, email_alert_recipient: Optional[str] = None, tenant_slug: Optional[str] = None):
    """Log a security event, and send new-IP login warning email if required.

    Stores the FULL ip_address (legitimate interest: new-IP login alerts) plus an
    anonymized copy, with ``ip_full_until`` marking when the full IP should be
    purged per the tenant's security retention setting (Post-sprint 2.1).

    Args:
        tenant_slug: Required for per-tenant IP retention lookup in cloud mode.
    """
    from app.core.security import anonymize_ip
    from app.routers.settings import get_security_ip_retention_days

    now = datetime.now(UTC)
    retention_days = get_security_ip_retention_days(tenant_slug=tenant_slug)
    if retention_days < 0:
        ip_full_until_iso: Optional[str] = None            # retain indefinitely
    elif retention_days == 0:
        ip_full_until_iso = now.isoformat()                 # already expired → purge on next sweep
    else:
        ip_full_until_iso = (now + timedelta(days=retention_days)).isoformat()

    audit_log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        action=action,
        ip_address=ip_address,
        ip_address_anonymized=anonymize_ip(ip_address) if ip_address else None,
        ip_full_until=ip_full_until_iso,
        user_agent=user_agent,
        details=details,
        created_at=now.isoformat() + "Z",
    )
    db.add(audit_log)
    db.commit()

    # If this is a login success and we have an email recipient to notify:
    if action == "LOGIN_SUCCESS" and email_alert_recipient and ip_address and ip_address != "unknown":
        try:
            # Query last 3 login IPs before this one
            history = db.query(AuditLog).filter(
                AuditLog.user_id == user_id,
                AuditLog.action == "LOGIN_SUCCESS"
            ).order_by(AuditLog.created_at.desc()).limit(4).all()
            
            # The first one in history is the current login.
            # Compare current IP with previous ones in the history.
            previous_ips = [str(log.ip_address) for log in history[1:] if log.ip_address is not None]
            
            if previous_ips and str(ip_address) not in previous_ips:
                # Trigger async email alert
                from app.services.email_service import send_email
                import asyncio
                
                subject = "Security Alert: New Login to Frontbase"
                html = f"""
                <p>Hello,</p>
                <p>We detected a new login to your Frontbase account from an unrecognized IP address.</p>
                <p><strong>Account:</strong> {email_alert_recipient}</p>
                <p><strong>IP Address:</strong> {ip_address}</p>
                <p><strong>Time:</strong> {datetime.now(UTC).isoformat()}Z</p>
                <p><strong>User Agent:</strong> {user_agent or 'Unknown'}</p>
                <br>
                <p>If this was you, no action is needed. If you do not recognize this login, please change your password immediately.</p>
                """
                
                # Run the sending function in the background
                asyncio.create_task(send_email(to=email_alert_recipient, subject=subject, html=html))
                logger.warning(f"[Security] New IP login detected for user {user_id} (IP: {ip_address}). Warning email queued.")
        except Exception as e:
            logger.error(f"[Security] Failed to check new IP / send email alert: {e}")


def purge_expired_security_ips(db: Session) -> int:
    """Anonymize full IPs in ``audit_logs`` whose retention window has expired.

    For rows where ``ip_full_until`` is in the past, set ``ip_address = NULL``
    (the anonymized value in ``ip_address_anonymized`` is retained long-term for
    analytics/forensics). Rows with ``ip_full_until IS NULL`` (retention = -1,
    legitimate-interest mode) are left intact. Idempotent; safe to run from a
    cron/periodic task. Returns the number of rows purged.
    """
    now_iso = datetime.now(UTC).isoformat()
    rows = db.query(AuditLog).filter(
        AuditLog.ip_full_until.isnot(None),
        AuditLog.ip_full_until < now_iso,
        AuditLog.ip_address.isnot(None),
    ).all()
    for row in rows:
        row.ip_address = None
    if rows:
        db.commit()
    return len(rows)


def get_current_user(request: Request) -> Optional[dict]:
    """Get current user from master admin session cookie.

    Returns the session dict for master admin users.
    For SuperTokens users, returns None (handled separately).
    """
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None

    session = get_session(token)
    if not session:
        return None

    email = session["email"]
    admin = ADMIN_USERS.get(email)
    if admin:
        return {**admin, **session}

    # Legacy tenant session (pre-SuperTokens) — still valid if present
    return session


def _set_session_cookie(response: Response, token: str) -> None:
    """Set the master admin session cookie on the response."""
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_MAX_AGE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=os.getenv("ENVIRONMENT") == "production",
    )


# ─────────────────────────────────────────────────────────────────────────────
# CORS Preflight
# ─────────────────────────────────────────────────────────────────────────────

@router.options("/login")
async def login_options():
    """Handle CORS preflight for login."""
    return Response(status_code=200)


@router.options("/signup")
async def signup_options():
    """Handle CORS preflight for signup."""
    return Response(status_code=200)


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/auth/login — Dual-Path Login
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
async def login(request: Request, body: LoginRequest, response: Response):
    """Login with email and password.

    Path 1: Master admin (env-var) — always checked first.
    Path 2: SuperTokens emailpassword (cloud mode) — tenant users.
    """
    # ── Security Checks: Lockout, Honeypot & Turnstile ───────────────────
    if not is_cloud():
        await check_lockout(request, body.email)
        
    check_honeypot(body.website)
    await verify_bot_token(body.turnstile_token, request.client.host if request.client else "unknown", route="login")

    # ── Path 1: Master Admin ────────────────────────────────────────────
    admin = ADMIN_USERS.get(body.email)
    if admin:
        if is_cloud():
            default_email = "admin@frontbase.dev"
            default_password_hash = hashlib.sha256(b"admin123").hexdigest()
            is_using_default_email = body.email == default_email and os.getenv("ADMIN_EMAIL") is None
            is_using_default_password = admin["password_hash"] == default_password_hash and os.getenv("ADMIN_PASSWORD") is None
            if is_using_default_email or is_using_default_password:
                logger.warning("[Auth] Master admin login rejected: default credentials are not allowed in cloud mode.")
                raise HTTPException(status_code=401, detail="Invalid email or password")

        if admin["password_hash"] != hash_password(body.password):
            if not is_cloud():
                await record_failed_attempt(request, body.email)
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not is_cloud():
            await clear_failed_attempts(request, body.email)

        # Session rotation: invalidate any existing session
        old_token = request.cookies.get(SESSION_COOKIE_NAME)
        if old_token and old_token in sessions:
            sessions.pop(old_token, None)

        token = create_session(
            admin["id"], admin["email"],
            is_master=True, role="master",
        )
        _set_session_cookie(response, token)

        # Audit log and email alert check
        from app.database.config import SessionLocal
        db = SessionLocal()
        try:
            await log_security_event(
                db=db,
                user_id=admin["id"],
                action="LOGIN_SUCCESS",
                ip_address=request.client.host if request.client else "unknown",
                user_agent=request.headers.get("user-agent"),
                details=f"Master admin login: {admin['email']}",
                email_alert_recipient=admin["email"],
                tenant_slug=None
            )
        except Exception as e:
            logger.error(f"[Security] Master admin login audit failed: {e}")
        finally:
            db.close()

        return AuthResponse(
            user=UserResponse(
                id=admin["id"],
                email=admin["email"],
                created_at=admin["created_at"],
                updated_at=admin["updated_at"],
            ),
            message="Login successful",
        )

    # ── Path 2: SuperTokens (cloud mode) ────────────────────────────────
    if not is_cloud():
        await record_failed_attempt(request, body.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    from supertokens_python.recipe.emailpassword.asyncio import sign_in as st_sign_in
    from supertokens_python.recipe.emailpassword.interfaces import SignInOkResult
    from supertokens_python.recipe.session.asyncio import create_new_session
    from supertokens_python.recipe.usermetadata.asyncio import get_user_metadata

    result = await st_sign_in("public", body.email, body.password)

    if not isinstance(result, SignInOkResult):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    st_user = result.user
    st_user_id = st_user.id

    # Load tenant context from user metadata
    metadata_result = await get_user_metadata(st_user_id)
    metadata = metadata_result.metadata

    tenant_id = metadata.get("tenant_id")
    tenant_slug = metadata.get("tenant_slug")
    role = metadata.get("role", "owner")

    # Create SuperTokens session with tenant claims in access token
    from supertokens_python.types import RecipeUserId
    recipe_uid = st_user.login_methods[0].recipe_user_id if st_user.login_methods else RecipeUserId(st_user.id)
    session = await create_new_session(
        request,
        "public",
        recipe_uid,
        access_token_payload={
            "email": body.email,
            "tenant_id": tenant_id,
            "tenant_slug": tenant_slug,
            "role": role,
            "is_master": False,
        },
    )

    logger.info(f"[Auth] Tenant user login: {body.email} (tenant={tenant_slug})")

    now = datetime.now(UTC).isoformat()

    # Update last_login_at in database
    from app.database.config import SessionLocal
    from app.models.auth import User as DBUser
    db = SessionLocal()
    try:
        user_record = db.query(DBUser).filter(DBUser.id == st_user_id).first()
        if user_record:
            user_record.last_login_at = now  # type: ignore[assignment]
        
        await log_security_event(
            db=db,
            user_id=st_user_id,
            action="LOGIN_SUCCESS",
            ip_address=request.client.host if request.client else "unknown",
            user_agent=request.headers.get("user-agent"),
            details=f"Tenant user login: {body.email} (tenant={tenant_slug})",
            email_alert_recipient=body.email,
            tenant_slug=tenant_slug
        )
        db.commit()
    except Exception as e:
        logger.error(f"[Auth] Failed to update last_login_at / audit log for user {st_user_id}: {e}")
        db.rollback()
    finally:
        db.close()

    return AuthResponse(
        user=UserResponse(
            id=st_user_id,
            email=body.email,
            created_at=now,
            updated_at=now,
            tenant_id=tenant_id,
            tenant_slug=tenant_slug,
            role=role,
            is_master=False,
        ),
        message="Login successful",
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/auth/signup — Self-Service Tenant Signup (Cloud Only)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/signup")
async def signup(request: Request, body: SignupRequest, response: Response):
    """Register a new tenant user with workspace.

    Creates: SuperTokens user → Tenant → TenantMember → Project → Session.
    Cloud mode only.
    """
    if not is_cloud():
        raise HTTPException(status_code=400, detail="Signup only available in cloud mode")

    from supertokens_python.recipe.emailpassword.asyncio import sign_up as st_sign_up
    from supertokens_python.recipe.emailpassword.interfaces import SignUpOkResult
    from supertokens_python.recipe.emailpassword.interfaces import EmailAlreadyExistsError
    from supertokens_python.recipe.session.asyncio import create_new_session
    from supertokens_python.recipe.usermetadata.asyncio import update_user_metadata
    from app.auth.supertokens_overrides import validate_slug, provision_tenant
    from app.database.config import SessionLocal

    # 1. Validate slug format
    slug = body.slug.lower().strip()
    slug_error = validate_slug(slug)
    if slug_error:
        raise HTTPException(status_code=400, detail=slug_error)

    # 2. Check slug availability in DB
    db = SessionLocal()
    try:
        from app.auth.supertokens_overrides import check_slug_available
        if not check_slug_available(db, slug):
            raise HTTPException(status_code=409, detail=f"Slug '{slug}' is already taken")
    finally:
        db.close()

    # 3. Create SuperTokens user (handles bcrypt hashing)
    st_result = await st_sign_up("public", body.email, body.password)

    if isinstance(st_result, EmailAlreadyExistsError):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    if not isinstance(st_result, SignUpOkResult):
        raise HTTPException(status_code=500, detail="Signup failed — unexpected error")

    st_user = st_result.user
    st_user_id = st_user.id

    # 4. Provision Tenant + TenantMember + Project
    db = SessionLocal()
    try:
        tenant_info = provision_tenant(
            db,
            st_user_id=st_user_id,
            email=body.email,
            slug=slug,
            workspace_name=body.workspace_name,
        )
        db.commit()
    except ValueError as e:
        db.rollback()
        # Rollback: delete the SuperTokens user we just created
        try:
            from supertokens_python.asyncio import delete_user
            await delete_user(st_user_id)
        except Exception:
            logger.error(f"[Signup] Failed to rollback ST user {st_user_id}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        # Rollback: delete the SuperTokens user
        try:
            from supertokens_python.asyncio import delete_user
            await delete_user(st_user_id)
        except Exception:
            logger.error(f"[Signup] Failed to rollback ST user {st_user_id}")
        logger.error(f"[Signup] Tenant provisioning failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create workspace")
    finally:
        db.close()

    # 5. Store tenant context in user metadata (persistent, survives session refresh)
    await update_user_metadata(st_user_id, {
        "tenant_id": tenant_info["tenant_id"],
        "tenant_slug": tenant_info["tenant_slug"],
        "role": tenant_info["role"],
    })

    # 6. Create SuperTokens session with tenant claims
    from supertokens_python.types import RecipeUserId
    recipe_uid = st_user.login_methods[0].recipe_user_id if st_user.login_methods else RecipeUserId(st_user.id)
    session = await create_new_session(
        request,
        "public",
        recipe_uid,
        access_token_payload={
            "email": body.email,
            "tenant_id": tenant_info["tenant_id"],
            "tenant_slug": tenant_info["tenant_slug"],
            "role": tenant_info["role"],
            "is_master": False,
        },
    )

    logger.info(f"[Signup] New tenant: {slug} ({body.email})")

    now = datetime.now(UTC).isoformat()
    return {
        "user": {
            "id": st_user_id,
            "email": body.email,
            "tenant_id": tenant_info["tenant_id"],
            "tenant_slug": tenant_info["tenant_slug"],
            "role": tenant_info["role"],
            "is_master": False,
            "created_at": now,
            "updated_at": now,
        },
        "tenant": {
            "id": tenant_info["tenant_id"],
            "slug": tenant_info["tenant_slug"],
            "name": tenant_info["workspace_name"],
            "project_id": tenant_info["project_id"],
        },
        "message": "Workspace created successfully",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Invite acceptance — join an EXISTING tenant via an emailed token
# ─────────────────────────────────────────────────────────────────────────────

def _load_valid_invite(db, token: str):
    """Return a pending, non-expired TenantInvite for the token, or None."""
    from app.models.models import TenantInvite
    inv = db.query(TenantInvite).filter(TenantInvite.token == token).first()
    if not inv or str(inv.status) != "pending":
        return None
    try:
        if datetime.fromisoformat(str(inv.expires_at)) < datetime.now(timezone.utc):
            return None
    except (ValueError, TypeError):
        return None
    return inv


@router.get("/invite/{token}")
async def get_invite(token: str):
    """Public — return invite details for the accept page."""
    if not is_cloud():
        raise HTTPException(status_code=400, detail="Invites only available in cloud mode")
    from app.database.config import SessionLocal
    from app.models.models import Tenant
    db = SessionLocal()
    try:
        inv = _load_valid_invite(db, token)
        if not inv:
            raise HTTPException(status_code=404, detail="Invite is invalid, revoked, or expired")
        tenant = db.query(Tenant).filter(Tenant.id == inv.tenant_id).first()
        return {
            "email": str(inv.email),
            "role": str(inv.role),
            "tenant_name": str(tenant.name) if tenant else None,
            "tenant_slug": str(tenant.slug) if tenant else None,
        }
    finally:
        db.close()


@router.post("/accept-invite")
async def accept_invite(request: Request, body: AcceptInviteRequest, response: Response):
    """Public — create an account for the invited email and join the tenant."""
    if not is_cloud():
        raise HTTPException(status_code=400, detail="Invites only available in cloud mode")

    from supertokens_python.recipe.emailpassword.asyncio import sign_up as st_sign_up
    from supertokens_python.recipe.emailpassword.interfaces import SignUpOkResult, EmailAlreadyExistsError
    from supertokens_python.recipe.session.asyncio import create_new_session
    from supertokens_python.recipe.usermetadata.asyncio import update_user_metadata
    from app.auth.supertokens_overrides import attach_user_to_tenant
    from app.database.config import SessionLocal

    # 1. Validate the invite
    db = SessionLocal()
    try:
        inv = _load_valid_invite(db, body.token)
        if not inv:
            raise HTTPException(status_code=404, detail="Invite is invalid, revoked, or expired")
        invite_email = str(inv.email)
        invite_role = str(inv.role)
        tenant_id = str(inv.tenant_id)
        # Parse granted projects (JSON list); None → no explicit project rows.
        raw_pids = getattr(inv, "project_ids", None)
        invite_project_ids: list = []
        if raw_pids:
            try:
                parsed = json.loads(str(raw_pids))
                if isinstance(parsed, list):
                    invite_project_ids = [str(p) for p in parsed]
            except (ValueError, TypeError):
                pass
    finally:
        db.close()

    # 2. Create the SuperTokens user (email is fixed by the invite)
    st_result = await st_sign_up("public", invite_email, body.password)
    if isinstance(st_result, EmailAlreadyExistsError):
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists. Please log in to accept the invite.",
        )
    if not isinstance(st_result, SignUpOkResult):
        raise HTTPException(status_code=500, detail="Signup failed — unexpected error")
    st_user = st_result.user
    st_user_id = st_user.id

    # 3. Attach to the existing tenant (hard team_members check) + mark invite accepted
    db = SessionLocal()
    try:
        from app.models.models import TenantInvite
        info = attach_user_to_tenant(
            db, st_user_id=st_user_id, email=invite_email, tenant_id=tenant_id,
            role=invite_role, project_ids=invite_project_ids,
        )
        inv = db.query(TenantInvite).filter(TenantInvite.token == body.token).first()
        if inv is not None:
            inv.status = "accepted"  # type: ignore[assignment]
            inv.accepted_at = datetime.now(timezone.utc).isoformat()  # type: ignore[assignment]
        db.commit()
    except ValueError as e:
        db.rollback()
        try:
            from supertokens_python.asyncio import delete_user
            await delete_user(st_user_id)
        except Exception:
            logger.error(f"[Invite] Failed to rollback ST user {st_user_id}")
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        db.rollback()
        try:
            from supertokens_python.asyncio import delete_user
            await delete_user(st_user_id)
        except Exception:
            logger.error(f"[Invite] Failed to rollback ST user {st_user_id}")
        logger.error(f"[Invite] Attach failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to join workspace")
    finally:
        db.close()

    # 4. Metadata + session with tenant claims
    await update_user_metadata(st_user_id, {
        "tenant_id": info["tenant_id"],
        "tenant_slug": info["tenant_slug"],
        "role": info["role"],
    })
    from supertokens_python.types import RecipeUserId
    recipe_uid = st_user.login_methods[0].recipe_user_id if st_user.login_methods else RecipeUserId(st_user.id)
    await create_new_session(
        request, "public", recipe_uid,
        access_token_payload={
            "email": invite_email,
            "tenant_id": info["tenant_id"],
            "tenant_slug": info["tenant_slug"],
            "role": info["role"],
            "is_master": False,
        },
    )
    logger.info(f"[Invite] {invite_email} joined tenant {info['tenant_slug']} as {info['role']}")
    return {
        "user": {"id": st_user_id, "email": invite_email, "tenant_id": info["tenant_id"],
                 "tenant_slug": info["tenant_slug"], "role": info["role"], "is_master": False},
        "message": "Joined workspace successfully",
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/auth/check-slug/{slug} — Public Slug Availability Check
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/check-slug/{slug}")
async def check_slug(slug: str):
    """Check if a workspace slug is available. Public endpoint."""
    if not is_cloud():
        raise HTTPException(status_code=400, detail="Not available in self-host mode")

    from app.auth.supertokens_overrides import validate_slug, check_slug_available
    from app.database.config import SessionLocal

    slug = slug.lower().strip()

    # Format validation
    error = validate_slug(slug)
    if error:
        return {"available": False, "error": error}

    # DB uniqueness check
    db = SessionLocal()
    try:
        available = check_slug_available(db, slug)
    finally:
        db.close()

    return {"available": available, "slug": slug}


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/auth/me — Current User (Dual-Path)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/me")
async def get_me(request: Request):
    """Get current authenticated user with tenant context.

    Checks SuperTokens session first (cloud mode), then master admin cookie.
    """
    # ── Try SuperTokens session first (cloud mode) ──────────────────────
    if is_cloud():
        try:
            from supertokens_python.recipe.session.asyncio import get_session as st_get_session

            session = await st_get_session(request, session_required=False)
            if session:
                payload = session.get_access_token_payload()
                user_id = session.get_user_id()

                # Email may be in access token or need fetching from ST
                email = payload.get("email", "")
                if not email:
                    try:
                        from supertokens_python.asyncio import get_user
                        st_user = await get_user(user_id)
                        if st_user and st_user.emails:
                            email = st_user.emails[0]
                    except Exception:
                        pass

                return {
                    "user": {
                        "id": user_id,
                        "email": email,
                        "username": None,
                        "created_at": "",
                        "updated_at": "",
                        "tenant_id": payload.get("tenant_id"),
                        "tenant_slug": payload.get("tenant_slug"),
                        "role": payload.get("role", "owner"),
                        "is_master": False,
                    }
                }
        except Exception:
            pass  # No SuperTokens session — try master admin

    # ── Try master admin session ────────────────────────────────────────
    user = get_current_user(request)
    if user:
        return {
            "user": {
                "id": user["user_id"],
                "email": user["email"],
                "username": user.get("username"),
                "created_at": user.get("created_at", ""),
                "updated_at": user.get("updated_at", ""),
                "tenant_id": user.get("tenant_id"),
                "tenant_slug": user.get("tenant_slug"),
                "role": user.get("role", "master"),
                "is_master": user.get("is_master", False),
            }
        }

    raise HTTPException(status_code=401, detail="Not authenticated")


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/auth/logout — Dual-Path Logout
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/logout")
async def logout(request: Request, response: Response):
    """Logout — revokes SuperTokens session and/or master admin cookie."""
    # ── Revoke SuperTokens session if present ───────────────────────────
    if is_cloud():
        try:
            from supertokens_python.recipe.session.asyncio import get_session as st_get_session
            session = await st_get_session(request, session_required=False)
            if session:
                await session.revoke_session()
                logger.info(f"[Auth] SuperTokens session revoked for user {session.get_user_id()}")
        except Exception as e:
            logger.warning(f"[Auth] SuperTokens logout error: {e}")

    # ── Clear master admin session cookie ───────────────────────────────
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token and token in sessions:
        del sessions[token]

    response.delete_cookie(SESSION_COOKIE_NAME)

    return {"message": "Logged out successfully"}


# ─────────────────────────────────────────────────────────────────────────────
# Password Reset Endpoints (Self-Hosted Only)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(request: Request, body: ForgotPasswordRequest):
    """Request a password reset link (Self-hosted only)."""
    if is_cloud():
        raise HTTPException(
            status_code=400,
            detail="Forgot password endpoint is managed via SuperTokens in cloud mode."
        )

    # ── Security Checks: Lockout, Honeypot & Turnstile ───────────────────
    if not is_cloud():
        await check_lockout(request, body.email)
        
    check_honeypot(body.website)
    await verify_bot_token(body.turnstile_token, request.client.host if request.client else "unknown", route="forgot_password")

    # Record the attempt to rate-limit password resets (protect against email spam)
    if not is_cloud():
        await record_failed_attempt(request, body.email)

    email = body.email.strip().lower()
    
    # Check if the user is the master admin
    admin = ADMIN_USERS.get(email)
    if not admin:
        # Return a generic success to avoid user enumeration
        return {
            "success": True,
            "message": "If the email is registered, a password reset link has been sent."
        }
        
    # Generate token and expiry
    token = secrets.token_urlsafe(32)
    expiry = (datetime.now(UTC) + timedelta(hours=1)).isoformat() + "Z"
    
    # Store token in-memory on the admin dict
    admin["reset_token"] = token
    admin["reset_token_expires_at"] = expiry
    
    # Determine base URL for reset link
    public_url = os.getenv("PUBLIC_URL")
    if not public_url:
        public_url = str(request.base_url).rstrip("/")
        
    reset_link = f"{public_url}/reset-password?token={token}&email={email}"
    
    # Check if email configuration is present
    resend_api_key = os.getenv("RESEND_API_KEY")
    mailgun_api_key = os.getenv("MAILGUN_API_KEY")
    has_email_config = bool(resend_api_key or (mailgun_api_key and os.getenv("MAILGUN_DOMAIN")))
    
    if not has_email_config:
        # No email provider configured! Print to console and return dev_link
        print(f"\n[PASSWORD RESET LINK (NO EMAIL CONFIG)]:\n{reset_link}\n")
        return {
            "success": False,
            "error_code": "NO_EMAIL_PROVIDER",
            "message": "No email provider is configured on this instance.",
            "dev_link": reset_link
        }
        
    # If configured, send email via email_service
    from app.services.email_service import send_email
    subject = "Reset your Frontbase password"
    html = f"""
    <p>Hello,</p>
    <p>We received a request to reset your password for Frontbase.</p>
    <p>Click the link below to set a new password:</p>
    <p><a href="{reset_link}">{reset_link}</a></p>
    <p>This link is valid for 1 hour.</p>
    <p>If you didn't request this, you can safely ignore this email.</p>
    """
    
    email_result = await send_email(
        to=email,
        subject=subject,
        html=html
    )
    
    if not email_result.success:
        # If sending failed, print to console as fallback and return warning
        print(f"\n[PASSWORD RESET LINK (SEND FAILURE - {email_result.error})]:\n{reset_link}\n")
        return {
            "success": False,
            "error_code": "NO_EMAIL_PROVIDER",
            "message": f"Failed to send email: {email_result.error}",
            "dev_link": reset_link
        }
        
    return {
        "success": True,
        "message": "If the email is registered, a password reset link has been sent."
    }


@router.post("/reset-password")
async def reset_password(request: Request, body: ResetPasswordRequest):
    """Reset password using the reset token (Self-hosted only)."""
    if is_cloud():
        raise HTTPException(
            status_code=400,
            detail="Reset password endpoint is managed via SuperTokens in cloud mode."
        )

    email = body.email.strip().lower()
    
    # ── Security Checks: Lockout, Honeypot & Turnstile ───────────────────
    if not is_cloud():
        await check_lockout(request, email)
        
    check_honeypot(body.website)
    await verify_bot_token(body.turnstile_token, request.client.host if request.client else "unknown", route="forgot_password")
    
    # Check if the user is the master admin
    admin = ADMIN_USERS.get(email)
    if not admin:
        if not is_cloud():
            await record_failed_attempt(request, email)
        raise HTTPException(status_code=400, detail="Invalid email or token.")
        
    # Verify token exists and matches
    stored_token = admin.get("reset_token")
    stored_expiry = admin.get("reset_token_expires_at")
    
    if not stored_token or stored_token != body.token:
        if not is_cloud():
            await record_failed_attempt(request, email)
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
        
    # Verify expiry
    if stored_expiry:
        try:
            # strip 'Z' for parsing if present
            expiry_str = stored_expiry[:-1] if stored_expiry.endswith("Z") else stored_expiry
            expiry_dt = datetime.fromisoformat(expiry_str)
            if datetime.now(UTC) > expiry_dt:
                if not is_cloud():
                    await record_failed_attempt(request, email)
                raise HTTPException(status_code=400, detail="Reset token has expired.")
        except HTTPException:
            raise
        except Exception:
            if not is_cloud():
                await record_failed_attempt(request, email)
            raise HTTPException(status_code=400, detail="Reset token verification failed.")
            
    # Update password
    admin["password_hash"] = hash_password(body.password)
    
    # Clear token
    admin.pop("reset_token", None)
    admin.pop("reset_token_expires_at", None)
    if not is_cloud():
        await clear_failed_attempts(request, email)
    
    return {
        "success": True,
        "message": "Password has been successfully reset. You can now log in."
    }


# ─────────────────────────────────────────────────────────────────────────────
# Advanced Security Endpoints (IP Blocklist, WAF, Audit Logs)
# ─────────────────────────────────────────────────────────────────────────────

async def push_security_to_edges(tenant_id: str | None = None, tenant_slug: str | None = None):
    """Sync FRONTBASE_SECURITY configuration to active edge engines via /api/import/settings.
    If tenant_slug is provided, appends ?tenant_slug=... so the edge stores settings under the correct tenant key.
    Non-fatal: failures are logged but don't block the CRUD response.
    """
    from app.database.config import SessionLocal
    from app.models.models import EdgeEngine, Project
    from app.services.edge_client import get_edge_headers
    from sqlalchemy import or_
    from app.database.utils import get_project
    from app.services.secrets_builder import _build_security_config
    import httpx
    
    db = SessionLocal()
    try:
        query = db.query(EdgeEngine).filter(EdgeEngine.url.isnot(None))
        if tenant_id:
            project = db.query(Project).filter(Project.tenant_id == tenant_id).first()
            if project:
                query = query.filter(or_(EdgeEngine.project_id == project.id, EdgeEngine.is_shared == True))
            else:
                return
        elif tenant_slug:
            from app.models.tenant import Tenant
            tenant = db.query(Tenant).filter(Tenant.slug == tenant_slug).first()
            if tenant:
                project = db.query(Project).filter(Project.tenant_id == tenant.id).first()
                if project:
                    query = query.filter(or_(EdgeEngine.project_id == project.id, EdgeEngine.is_shared == True))
                else:
                    return
            else:
                return
        else:
            project = get_project(db)
            if project and project.tenant_id is not None:
                query = query.filter(or_(EdgeEngine.project_id == project.id, EdgeEngine.is_shared == True))
                tenant_slug = str(project.tenant.slug) if project.tenant else None

        engines = query.all()
        if not engines:
            return

        # Detach engines data before closing DB or going async
        engine_data = []
        for eng in engines:
            sec_config = _build_security_config(db, str(eng.id))
            engine_data.append({
                "url": str(eng.url),
                "headers": get_edge_headers(eng),
                "securityConfig": sec_config,
            })
    finally:
        db.close()

    # Fan out to all engines (no DB held)
    async with httpx.AsyncClient(timeout=5.0) as client:
        for eng in engine_data:
            try:
                import_url = f"{eng['url'].rstrip('/')}/api/import/settings"
                if tenant_slug and tenant_slug != '_default':
                    import_url += f"?tenant_slug={tenant_slug}"

                await client.post(
                    import_url,
                    json={"securityConfig": eng["securityConfig"]},
                    headers={"Content-Type": "application/json", **eng["headers"]},
                )
                print(f"[SecuritySync] Synced security config to {import_url}")
            except Exception as e:
                print(f"[SecuritySync] Edge security sync failed for {eng['url']}: {e}")


@router.get("/security/blocklist")
async def get_blocklist(
    request: Request,
    db: Session = Depends(get_db),
    ctx: Optional[TenantContext] = Depends(get_tenant_context)
):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    tenant_id = ctx.tenant_id if ctx else None
    if tenant_id:
        bans = db.query(IPBlocklist).filter(IPBlocklist.tenant_id == tenant_id).order_by(IPBlocklist.created_at.desc()).all()
    else:
        bans = db.query(IPBlocklist).filter(IPBlocklist.tenant_id.is_(None)).order_by(IPBlocklist.created_at.desc()).all()
        
    return [{"id": ban.id, "ip_or_range": ban.ip_or_range, "reason": ban.reason, "created_at": ban.created_at} for ban in bans]


@router.post("/security/blocklist")
async def add_ip_ban(
    body: IPBlockRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: Optional[TenantContext] = Depends(get_tenant_context)
):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    ip_str = body.ip_or_range.strip()
    try:
        if '/' in ip_str:
            ipaddress.ip_network(ip_str, strict=False)
        else:
            ipaddress.ip_address(ip_str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid IP address or CIDR range format: {e}")
        
    tenant_id = ctx.tenant_id if ctx else None
    tenant_slug = ctx.tenant_slug if ctx else None
    
    existing = db.query(IPBlocklist).filter(
        IPBlocklist.ip_or_range == ip_str,
        IPBlocklist.tenant_id == tenant_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="IP address or range is already blocked.")
        
    new_ban = IPBlocklist(
        id=str(uuid.uuid4()),
        ip_or_range=ip_str,
        reason=body.reason,
        tenant_id=tenant_id,
        tenant_slug=tenant_slug,
        created_at=datetime.now(UTC).isoformat() + "Z"
    )
    db.add(new_ban)
    
    # Audit log
    audit_log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user["id"] if "id" in user else user.get("user_id", "admin"),
        action="IP_BANNED",
        ip_address=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent"),
        details=f"Banned IP/Range: {ip_str}. Reason: {body.reason}",
        created_at=datetime.now(UTC).isoformat() + "Z"
    )
    db.add(audit_log)
    db.commit()
    
    # Invalidate cache
    try:
        from main import invalidate_blocklist_cache
        invalidate_blocklist_cache()
    except Exception:
        pass
        
    # Sync settings to edges asynchronously
    background_tasks.add_task(push_security_to_edges, tenant_id=tenant_id, tenant_slug=tenant_slug)
            
    return {"success": True, "message": f"Successfully blocked {ip_str}"}


@router.delete("/security/blocklist/{ban_id}")
async def delete_ip_ban(
    ban_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: Optional[TenantContext] = Depends(get_tenant_context)
):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    tenant_id = ctx.tenant_id if ctx else None
    tenant_slug = ctx.tenant_slug if ctx else None
    
    if tenant_id:
        ban = db.query(IPBlocklist).filter(IPBlocklist.id == ban_id, IPBlocklist.tenant_id == tenant_id).first()
    else:
        ban = db.query(IPBlocklist).filter(IPBlocklist.id == ban_id, IPBlocklist.tenant_id.is_(None)).first()
        
    if not ban:
        raise HTTPException(status_code=404, detail="IP block record not found.")
        
    ip_str = ban.ip_or_range
    db.delete(ban)
    
    # Audit log
    audit_log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user["id"] if "id" in user else user.get("user_id", "admin"),
        action="IP_UNBANNED",
        ip_address=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent"),
        details=f"Unbanned IP/Range: {ip_str}",
        created_at=datetime.now(UTC).isoformat() + "Z"
    )
    db.add(audit_log)
    db.commit()
    
    # Invalidate cache
    try:
        from main import invalidate_blocklist_cache
        invalidate_blocklist_cache()
    except Exception:
        pass
        
    # Sync settings to edges asynchronously
    background_tasks.add_task(push_security_to_edges, tenant_id=tenant_id, tenant_slug=tenant_slug)
            
    return {"success": True, "message": f"Successfully unblocked {ip_str}"}


@router.get("/security/bot-protection", response_model=BotProtectionSettings)
async def get_bot_protection_settings(
    request: Request,
    ctx: Optional[TenantContext] = Depends(get_tenant_context)
):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    from app.routers.settings import load_settings
    tenant_slug = ctx.tenant_slug if ctx else None
    settings_dict = load_settings(tenant_slug)
    bot_settings = settings_dict.get("security", {}).get("bot_protection", {})
    
    # Expose site_key/provider fallbacks from env vars if database settings are empty
    env_site_key = os.getenv("VITE_TURNSTILE_SITE_KEY", "")
    env_secret_key = os.getenv("TURNSTILE_SECRET_KEY", "")
    
    enabled = bool(bot_settings.get("enabled", False))
    provider = str(bot_settings.get("provider", "cloudflare"))
    site_key = str(bot_settings.get("site_key", env_site_key if not bot_settings.get("site_key") else bot_settings.get("site_key")))
    secret_key = str(bot_settings.get("secret_key", env_secret_key if not bot_settings.get("secret_key") else bot_settings.get("secret_key")))
    
    # Mask secret key if populated
    masked_secret = "••••••••" if secret_key else ""
    
    return BotProtectionSettings(
        enabled=enabled,
        provider=cast(Literal["cloudflare", "recaptcha_v2", "recaptcha_v3"], provider),
        site_key=site_key,
        secret_key=masked_secret,
        protect_login=bool(bot_settings.get("protect_login", True)),
        protect_forgot_password=bool(bot_settings.get("protect_forgot_password", True)),
        recaptcha_v3_threshold=float(bot_settings.get("recaptcha_v3_threshold", 0.5)),
        widget_theme=cast(Literal["light", "dark", "auto"], bot_settings.get("widget_theme", "auto")),
        widget_size=cast(Literal["normal", "compact", "invisible"], bot_settings.get("widget_size", "normal")),
        auto_ban_lockout_hours=int(bot_settings.get("auto_ban_lockout_hours", 24))
    )


@router.post("/security/bot-protection")
async def update_bot_protection_settings(
    body: BotProtectionUpdateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: Optional[TenantContext] = Depends(get_tenant_context)
):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    from app.routers.settings import load_settings, save_settings
    tenant_slug = ctx.tenant_slug if ctx else None
    tenant_id = ctx.tenant_id if ctx else None
    settings_dict = load_settings(tenant_slug)
    
    if "security" not in settings_dict:
        settings_dict["security"] = {}
        
    old_bot_settings = settings_dict["security"].get("bot_protection", {})
    
    # Resolve the secret key
    secret_key = body.secret_key
    if secret_key == "••••••••":
        secret_key = str(old_bot_settings.get("secret_key", os.getenv("TURNSTILE_SECRET_KEY", "")))
        
    settings_dict["security"]["bot_protection"] = {
        "enabled": bool(body.enabled),
        "provider": str(body.provider),
        "site_key": str(body.site_key),
        "secret_key": str(secret_key),
        "protect_login": bool(body.protect_login),
        "protect_forgot_password": bool(body.protect_forgot_password),
        "recaptcha_v3_threshold": float(body.recaptcha_v3_threshold),
        "widget_theme": str(body.widget_theme),
        "widget_size": str(body.widget_size),
        "auto_ban_lockout_hours": int(body.auto_ban_lockout_hours)
    }
    
    save_settings(settings_dict, tenant_slug)
    
    # Log audit entry
    audit_log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user["id"] if "id" in user else user.get("user_id", "admin"),
        action="BOT_PROTECTION_UPDATED",
        ip_address=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent"),
        details=f"Bot protection settings updated. Enabled: {body.enabled}, Provider: {body.provider}",
        created_at=datetime.now(UTC).isoformat() + "Z"
    )
    db.add(audit_log)
    db.commit()
    
    # Sync settings to edges asynchronously
    background_tasks.add_task(push_security_to_edges, tenant_id=tenant_id, tenant_slug=tenant_slug)
    
    return {"success": True}


@router.get("/security/bot-protection/metrics")
async def get_bot_protection_metrics(
    request: Request,
    db: Session = Depends(get_db),
    ctx: Optional[TenantContext] = Depends(get_tenant_context)
):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    # Aggregate counts from AuditLog
    success_count = db.query(AuditLog).filter(AuditLog.action == "BOT_CHALLENGE_SUCCESS").count()
    failed_count = db.query(AuditLog).filter(AuditLog.action == "BOT_CHALLENGE_FAILED").count()
    
    tenant_id = ctx.tenant_id if ctx else None
    if tenant_id:
        banned_ips_count = db.query(IPBlocklist).filter(
            IPBlocklist.reason == "Bot Protection Auto-Ban (Repeated Failures)",
            IPBlocklist.tenant_id == tenant_id
        ).count()
    else:
        banned_ips_count = db.query(IPBlocklist).filter(
            IPBlocklist.reason == "Bot Protection Auto-Ban (Repeated Failures)",
            IPBlocklist.tenant_id.is_(None)
        ).count()
        
    total_challenges = success_count + failed_count
    solve_rate = 0.0
    if total_challenges > 0:
        solve_rate = round((success_count / total_challenges) * 100, 1)
        
    return {
        "solve_rate": solve_rate,
        "total_challenges": total_challenges,
        "blocked_solves": failed_count,
        "banned_ips": banned_ips_count
    }


@router.get("/security/waf")
async def get_waf_settings(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    from app.routers.settings import load_settings
    settings_dict = load_settings()
    enabled = settings_dict.get("security", {}).get("waf_enabled", False)
    return {"enabled": enabled}


@router.post("/security/waf")
async def update_waf_settings(
    body: WafUpdateRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    from app.routers.settings import load_settings, save_settings
    settings_dict = load_settings()
    if "security" not in settings_dict:
        settings_dict["security"] = {}
    settings_dict["security"]["waf_enabled"] = body.enabled
    save_settings(settings_dict)
    
    # Audit log
    audit_log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user["id"] if "id" in user else user.get("user_id", "admin"),
        action="WAF_TOGGLED",
        ip_address=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent"),
        details=f"WAF toggled to {'ENABLED' if body.enabled else 'DISABLED'}",
        created_at=datetime.now(UTC).isoformat() + "Z"
    )
    db.add(audit_log)
    db.commit()
    
    return {"success": True, "enabled": body.enabled}


@router.get("/security/audit-logs")
async def get_audit_logs(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 50
):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "action": log.action,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "details": log.details,
            "created_at": log.created_at
        }
        for log in logs
    ]

