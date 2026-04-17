"""
Auth Router - Admin Authentication Endpoints

Provides session-based authentication for Frontbase admins/designers.
Uses httponly cookies for session storage.
"""

from fastapi import APIRouter, HTTPException, Response, Request, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
import os
import hashlib
import secrets
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# In-memory session storage (replace with Redis/DB in production)
sessions: dict[str, dict] = {}

# Session configuration
SESSION_COOKIE_NAME = "frontbase_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

# Admin users (replace with database in production)
# For now, use environment variable or default dev credentials
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


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    username: Optional[str] = None
    created_at: str
    updated_at: str


class AuthResponse(BaseModel):
    user: UserResponse
    message: str


def hash_password(password: str) -> str:
    """Hash password with SHA256 (use bcrypt in production)"""
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
    """Create a new session and return session token.

    For master admin: is_master=True, tenant_id=None.
    For tenant users: is_master=False, tenant_id/slug/role populated.
    """
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
    """Get session by token if valid"""
    session = sessions.get(token)
    if not session:
        return None
    
    # Check expiration
    expires_at = datetime.fromisoformat(session["expires_at"])
    if datetime.utcnow() > expires_at:
        del sessions[token]
        return None
    
    return session


def get_current_user(request: Request) -> Optional[dict]:
    """Get current user from session cookie.

    Returns the session dict which includes tenant context fields.
    For master admin, returns the ADMIN_USERS entry merged with session.
    For tenant users, returns the session payload directly.
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
        # Master admin — merge static admin data with session context
        return {**admin, **session}
    
    # Tenant user — session has all needed fields
    return session


@router.options("/login")
async def login_options():
    """Handle CORS preflight for login"""
    return Response(status_code=200)


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest, response: Response):
    """Login with email and password.

    Checks master admin first, then DB users table (cloud mode).
    """
    user = ADMIN_USERS.get(request.email)
    
    if user:
        # Master admin login
        if user["password_hash"] != hash_password(request.password):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        token = create_session(
            user["id"], user["email"],
            is_master=True, role="master",
        )
        _set_session_cookie(response, token)
        
        return AuthResponse(
            user=UserResponse(
                id=user["id"],
                email=user["email"],
                created_at=user["created_at"],
                updated_at=user["updated_at"],
            ),
            message="Login successful",
        )
    
    # Not master admin — check DB users table (cloud mode)
    from app.config.edition import is_cloud
    if not is_cloud():
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    from app.database.config import SessionLocal
    from app.models.models import User, TenantMember, Tenant
    
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.email == request.email).first()
        if not db_user or str(db_user.password_hash) != hash_password(request.password):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Find tenant membership
        member = db.query(TenantMember).filter(
            TenantMember.user_id == db_user.id
        ).first()
        
        tenant_id = None
        tenant_slug = None
        role = "viewer"
        
        if member:
            tenant = db.query(Tenant).filter(Tenant.id == member.tenant_id).first()
            tenant_id = str(member.tenant_id)
            tenant_slug = str(tenant.slug) if tenant else None
            role = str(member.role)
        
        token = create_session(
            str(db_user.id), str(db_user.email),
            tenant_id=tenant_id,
            tenant_slug=tenant_slug,
            role=role,
            is_master=False,
        )
        _set_session_cookie(response, token)
        
        return AuthResponse(
            user=UserResponse(
                id=str(db_user.id),
                email=str(db_user.email),
                username=str(db_user.username) if db_user.username else None,
                created_at=str(db_user.created_at),
                updated_at=str(db_user.updated_at),
            ),
            message="Login successful",
        )
    finally:
        db.close()


def _set_session_cookie(response: Response, token: str) -> None:
    """Set the session cookie on the response."""
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_MAX_AGE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=os.getenv("ENVIRONMENT") == "production",
    )


@router.get("/me")
async def get_me(request: Request):
    """Get current authenticated user with tenant context."""
    user = get_current_user(request)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
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


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Logout and clear session"""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    
    if token and token in sessions:
        del sessions[token]
    
    response.delete_cookie(SESSION_COOKIE_NAME)
    
    return {"message": "Logged out successfully"}
