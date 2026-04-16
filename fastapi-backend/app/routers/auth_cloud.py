"""
Cloud Auth Router — signup, JWT login, and /me for cloud mode.

Registered only when DEPLOYMENT_MODE=cloud.
The master admin (env-var credentials) can also login via these endpoints.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import hashlib
import uuid
import re
import os

from sqlalchemy.orm import Session

from app.database.config import SessionLocal
from app.models.models import User, Tenant, TenantMember, Project
from app.services.jwt_utils import create_token, decode_token
from app.middleware.tenant_context import TenantContext, get_tenant_context

router = APIRouter(prefix="/api/auth", tags=["Authentication (Cloud)"])


# ---------------------------------------------------------------------------
# Password hashing — bcrypt with fallback to SHA-256 for master admin
# ---------------------------------------------------------------------------

def _hash_password_bcrypt(password: str) -> str:
    """Hash a password with bcrypt."""
    try:
        import bcrypt
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    except ImportError:
        # Fallback if bcrypt not installed — SHA-256 (acceptable for alpha)
        return "sha256:" + hashlib.sha256(password.encode()).hexdigest()


def _verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    if hashed.startswith("sha256:"):
        return hashed == "sha256:" + hashlib.sha256(password.encode()).hexdigest()
    try:
        import bcrypt
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Reserved slugs — cannot be used as tenant subdomains
# ---------------------------------------------------------------------------

RESERVED_SLUGS = frozenset({
    "app", "www", "api", "docs", "admin", "cdn", "mail", "blog",
    "help", "support", "status", "ftp", "ssh", "test", "dev",
    "staging", "demo", "beta", "alpha", "dashboard", "login",
    "signup", "auth", "oauth", "websocket", "ws", "static",
    "assets", "img", "images", "fonts", "css", "js",
})

SLUG_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$")


def _validate_slug(slug: str) -> Optional[str]:
    """Return an error message if slug is invalid, or None if OK."""
    if not slug:
        return "Slug is required"
    slug = slug.lower()
    if slug in RESERVED_SLUGS:
        return f"'{slug}' is reserved and cannot be used"
    if not SLUG_PATTERN.match(slug):
        return "Slug must be 3-30 characters, lowercase alphanumeric and hyphens only"
    return None


# ---------------------------------------------------------------------------
# Platform settings — signup mode
# ---------------------------------------------------------------------------

def _get_platform_signup_mode() -> str:
    """Read signup mode from platform settings.  Defaults to 'open'."""
    db = SessionLocal()
    try:
        from sqlalchemy import text
        row = db.execute(
            text("SELECT settings_data FROM user_settings WHERE id = 'platform' LIMIT 1")
        ).fetchone()
        if row and row.settings_data:
            import json
            data = json.loads(row.settings_data)
            return str(data.get("signup_mode", "open"))
    except Exception:
        pass
    finally:
        db.close()
    return "open"


# ---------------------------------------------------------------------------
# Master admin helper
# ---------------------------------------------------------------------------

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@frontbase.dev")
ADMIN_PASSWORD_HASH = hashlib.sha256(
    os.getenv("ADMIN_PASSWORD", "admin123").encode()
).hexdigest()


def _try_master_admin_login(email: str, password: str) -> Optional[dict]:
    """Check if credentials match the master admin from env vars."""
    if email != ADMIN_EMAIL:
        return None
    if hashlib.sha256(password.encode()).hexdigest() != ADMIN_PASSWORD_HASH:
        return None
    return {
        "id": "master-admin",
        "email": ADMIN_EMAIL,
        "is_master": True,
    }


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    workspace_name: str
    slug: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class CloudAuthResponse(BaseModel):
    token: str
    user: dict
    tenant: Optional[dict] = None
    project: Optional[dict] = None
    message: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/signup", response_model=CloudAuthResponse)
async def cloud_signup(body: SignupRequest):
    """Create a new user + tenant + default project (cloud mode)."""
    # Check signup mode
    mode = _get_platform_signup_mode()
    if mode == "invite_only":
        raise HTTPException(status_code=403, detail="Signups are currently invite-only")

    # Validate slug
    slug = body.slug.lower().strip()
    slug_err = _validate_slug(slug)
    if slug_err:
        raise HTTPException(status_code=400, detail=slug_err)

    db = SessionLocal()
    try:
        # Check email uniqueness
        existing_user = db.query(User).filter(User.email == body.email).first()
        if existing_user:
            raise HTTPException(status_code=409, detail="Email already registered")

        # Check slug uniqueness
        existing_tenant = db.query(Tenant).filter(Tenant.slug == slug).first()
        if existing_tenant:
            raise HTTPException(status_code=409, detail=f"Workspace '{slug}' is already taken")

        now = datetime.utcnow().isoformat()
        user_id = str(uuid.uuid4())
        tenant_id = str(uuid.uuid4())
        member_id = str(uuid.uuid4())
        project_id = str(uuid.uuid4())

        # 1. Create User
        new_user = User(
            id=user_id,
            username=body.email.split("@")[0],
            email=body.email,
            password_hash=_hash_password_bcrypt(body.password),
            created_at=now,
            updated_at=now,
        )
        db.add(new_user)

        # 2. Create Tenant
        new_tenant = Tenant(
            id=tenant_id,
            slug=slug,
            name=body.workspace_name,
            owner_id=user_id,
            plan="free",
            status="active",
            created_at=now,
            updated_at=now,
        )
        db.add(new_tenant)

        # 3. Create TenantMember (owner)
        new_member = TenantMember(
            id=member_id,
            tenant_id=tenant_id,
            user_id=user_id,
            role="owner",
            created_at=now,
        )
        db.add(new_member)

        # 4. Create default Project
        new_project = Project(
            id=project_id,
            name=body.workspace_name,
            description=f"Default project for {body.workspace_name}",
            tenant_id=tenant_id,
            created_at=now,
            updated_at=now,
        )
        db.add(new_project)

        db.commit()

        # Issue JWT
        token = create_token(
            user_id=user_id,
            email=body.email,
            tenant_id=tenant_id,
            tenant_slug=slug,
            role="owner",
            is_master=False,
        )

        return CloudAuthResponse(
            token=token,
            user={
                "id": user_id,
                "email": body.email,
                "username": body.email.split("@")[0],
                "tenant_id": tenant_id,
                "tenant_slug": slug,
                "role": "owner",
                "is_master": False,
                "created_at": now,
                "updated_at": now,
            },
            tenant={
                "id": tenant_id,
                "slug": slug,
                "name": body.workspace_name,
                "plan": "free",
                "status": "active",
            },
            project={
                "id": project_id,
                "name": body.workspace_name,
            },
            message="Account created successfully",
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Signup failed: {e}")
    finally:
        db.close()


@router.post("/login", response_model=CloudAuthResponse)
async def cloud_login(body: LoginRequest):
    """Login — checks master admin first, then DB users."""
    # 1. Try master admin
    master = _try_master_admin_login(body.email, body.password)
    if master:
        token = create_token(
            user_id="master-admin",
            email=master["email"],
            tenant_id=None,
            tenant_slug=None,
            role="master",
            is_master=True,
        )
        return CloudAuthResponse(
            token=token,
            user={
                "id": "master-admin",
                "email": master["email"],
                "role": "master",
                "is_master": True,
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
            },
            message="Login successful (master admin)",
        )

    # 2. Try DB user
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == body.email).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not _verify_password(body.password, str(user.password_hash)):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Find the user's tenant
        membership = (
            db.query(TenantMember)
            .filter(TenantMember.user_id == user.id)
            .first()
        )

        tenant_id = None
        tenant_slug = None
        tenant_data = None
        role = "viewer"

        if membership:
            tenant = db.query(Tenant).filter(Tenant.id == membership.tenant_id).first()
            if tenant:
                tenant_id = str(tenant.id)
                tenant_slug = str(tenant.slug)
                tenant_data = {
                    "id": tenant_id,
                    "slug": tenant_slug,
                    "name": str(tenant.name),
                    "plan": str(tenant.plan),
                    "status": str(tenant.status),
                }
            role = str(membership.role)

        token = create_token(
            user_id=str(user.id),
            email=str(user.email),
            tenant_id=tenant_id,
            tenant_slug=tenant_slug,
            role=role,
            is_master=False,
        )

        return CloudAuthResponse(
            token=token,
            user={
                "id": str(user.id),
                "email": str(user.email),
                "username": str(user.username) if user.username else None,
                "tenant_id": tenant_id,
                "tenant_slug": tenant_slug,
                "role": role,
                "is_master": False,
                "created_at": str(user.created_at),
                "updated_at": str(user.updated_at),
            },
            tenant=tenant_data,
            message="Login successful",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {e}")
    finally:
        db.close()


@router.get("/me")
async def cloud_me(ctx: TenantContext = Depends(get_tenant_context)):
    """Get current authenticated user + tenant context."""
    if ctx is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result: dict = {
        "user": {
            "id": ctx.user_id,
            "email": ctx.email,
            "role": ctx.role,
            "is_master": ctx.is_master,
            "tenant_id": ctx.tenant_id,
            "tenant_slug": ctx.tenant_slug,
        }
    }

    # Fetch full tenant data for non-master users
    if ctx.tenant_id and not ctx.is_master:
        db = SessionLocal()
        try:
            tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).first()
            if tenant:
                result["tenant"] = {
                    "id": str(tenant.id),
                    "slug": str(tenant.slug),
                    "name": str(tenant.name),
                    "plan": str(tenant.plan),
                    "status": str(tenant.status),
                }
        finally:
            db.close()

    return result


@router.get("/check-slug/{slug}")
async def check_slug_availability(slug: str):
    """Check if a tenant slug is available."""
    slug = slug.lower().strip()
    err = _validate_slug(slug)
    if err:
        return {"available": False, "error": err}

    db = SessionLocal()
    try:
        existing = db.query(Tenant).filter(Tenant.slug == slug).first()
        return {"available": existing is None}
    finally:
        db.close()
