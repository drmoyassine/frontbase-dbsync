"""
Auth Router - Dual-Mode Authentication Endpoints

Self-host mode: Session-based auth with env-var admin (ADMIN_EMAIL/ADMIN_PASSWORD).
Cloud mode: SuperTokens emailpassword for tenant users + env-var master admin.

Both modes share the same routes — the login endpoint checks master admin
first (env-var), then falls through to SuperTokens (cloud only).
"""

from fastapi import APIRouter, HTTPException, Response, Request, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
import os
import hashlib
import secrets
import logging
from datetime import datetime, timedelta

from app.config.edition import is_cloud

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


def check_lockout(request: Request, email: str) -> None:
    """Check if the client is currently locked out."""
    key = get_lockout_key(request, email)
    entry = FAILED_LOGIN_ATTEMPTS.get(key)
    if entry:
        locked_until = entry.get("locked_until")
        if locked_until and datetime.utcnow() < locked_until:
            remaining_seconds = int((locked_until - datetime.utcnow()).total_seconds())
            remaining_minutes = max(1, remaining_seconds // 60)
            logger.warning(f"[Auth] Blocked locked out client {key} for {remaining_minutes} more minutes.")
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed attempts. Please try again in {remaining_minutes} minutes."
            )


def record_failed_attempt(request: Request, email: str) -> None:
    """Record a failed login/reset attempt and lock out if threshold is reached."""
    key = get_lockout_key(request, email)
    entry = FAILED_LOGIN_ATTEMPTS.setdefault(key, {"attempts": 0, "locked_until": None})
    entry["attempts"] += 1
    
    if entry["attempts"] >= MAX_FAILED_ATTEMPTS:
        entry["locked_until"] = datetime.utcnow() + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        logger.warning(f"[Auth] Client {key} reached max failed attempts. Locked out for {LOCKOUT_DURATION_MINUTES} minutes.")
    else:
        attempts_left = MAX_FAILED_ATTEMPTS - entry["attempts"]
        logger.info(f"[Auth] Failed attempt {entry['attempts']} for client {key}. {attempts_left} attempts remaining.")


def clear_failed_attempts(request: Request, email: str) -> None:
    """Clear failed attempts upon successful login/reset."""
    key = get_lockout_key(request, email)
    FAILED_LOGIN_ATTEMPTS.pop(key, None)


def check_honeypot(website: Optional[str]) -> None:
    """Verify that the honeypot field is empty."""
    if website:
        logger.warning("[Auth] Honeypot field filled. Silently rejecting bot request.")
        raise HTTPException(
            status_code=400,
            detail="Invalid request details."
        )


async def verify_turnstile_token(token: Optional[str], ip_address: str) -> None:
    """Verify Turnstile token if Turnstile is configured."""
    secret_key = os.getenv("TURNSTILE_SECRET_KEY")
    if not secret_key:
        return
        
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Bot verification token is missing. Please refresh and try again."
        )
        
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={
                    "secret": secret_key,
                    "response": token,
                    "remoteip": ip_address
                },
                timeout=5.0
            )
            data = resp.json()
            if not data.get("success"):
                logger.warning(f"[Auth] Turnstile verification failed: {data}")
                raise HTTPException(
                    status_code=400,
                    detail="Bot verification failed. Please try again."
                )
    except httpx.RequestError as e:
        logger.error(f"[Auth] Turnstile API request failed: {e}. Bypassing verification (fail-safe).")
    except Exception as e:
        logger.error(f"[Auth] Turnstile verification exception: {e}. Bypassing verification (fail-safe).")


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
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": (datetime.utcnow() + timedelta(seconds=SESSION_MAX_AGE)).isoformat(),
    }
    return token


def get_session(token: str) -> Optional[dict]:
    """Get master admin session by token if valid."""
    session = sessions.get(token)
    if not session:
        return None

    expires_at = datetime.fromisoformat(session["expires_at"])
    if datetime.utcnow() > expires_at:
        del sessions[token]
        return None

    return session


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
        check_lockout(request, body.email)
        
    check_honeypot(body.website)
    await verify_turnstile_token(body.turnstile_token, request.client.host if request.client else "unknown")

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
                record_failed_attempt(request, body.email)
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not is_cloud():
            clear_failed_attempts(request, body.email)

        token = create_session(
            admin["id"], admin["email"],
            is_master=True, role="master",
        )
        _set_session_cookie(response, token)

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
        record_failed_attempt(request, body.email)
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

    now = datetime.utcnow().isoformat()
    
    # Update last_login_at in database
    from app.database.config import SessionLocal
    from app.models.auth import User as DBUser
    db = SessionLocal()
    try:
        user_record = db.query(DBUser).filter(DBUser.id == st_user_id).first()
        if user_record:
            user_record.last_login_at = now  # type: ignore[assignment]
            db.commit()
    except Exception as e:
        logger.error(f"[Auth] Failed to update last_login_at for user {st_user_id}: {e}")
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

    now = datetime.utcnow().isoformat()
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
        check_lockout(request, body.email)
        
    check_honeypot(body.website)
    await verify_turnstile_token(body.turnstile_token, request.client.host if request.client else "unknown")

    # Record the attempt to rate-limit password resets (protect against email spam)
    if not is_cloud():
        record_failed_attempt(request, body.email)

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
    expiry = (datetime.utcnow() + timedelta(hours=1)).isoformat() + "Z"
    
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
        check_lockout(request, email)
        
    check_honeypot(body.website)
    await verify_turnstile_token(body.turnstile_token, request.client.host if request.client else "unknown")
    
    # Check if the user is the master admin
    admin = ADMIN_USERS.get(email)
    if not admin:
        if not is_cloud():
            record_failed_attempt(request, email)
        raise HTTPException(status_code=400, detail="Invalid email or token.")
        
    # Verify token exists and matches
    stored_token = admin.get("reset_token")
    stored_expiry = admin.get("reset_token_expires_at")
    
    if not stored_token or stored_token != body.token:
        if not is_cloud():
            record_failed_attempt(request, email)
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
        
    # Verify expiry
    if stored_expiry:
        try:
            # strip 'Z' for parsing if present
            expiry_str = stored_expiry[:-1] if stored_expiry.endswith("Z") else stored_expiry
            expiry_dt = datetime.fromisoformat(expiry_str)
            if datetime.utcnow() > expiry_dt:
                if not is_cloud():
                    record_failed_attempt(request, email)
                raise HTTPException(status_code=400, detail="Reset token has expired.")
        except HTTPException:
            raise
        except Exception:
            if not is_cloud():
                record_failed_attempt(request, email)
            raise HTTPException(status_code=400, detail="Reset token verification failed.")
            
    # Update password
    admin["password_hash"] = hash_password(body.password)
    
    # Clear token
    admin.pop("reset_token", None)
    admin.pop("reset_token_expires_at", None)
    if not is_cloud():
        clear_failed_attempts(request, email)
    
    return {
        "success": True,
        "message": "Password has been successfully reset. You can now log in."
    }
