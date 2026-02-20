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


def create_session(user_id: str, email: str) -> str:
    """Create a new session and return session token"""
    token = secrets.token_urlsafe(32)
    sessions[token] = {
        "user_id": user_id,
        "email": email,
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
    """Get current user from session cookie"""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    
    session = get_session(token)
    if not session:
        return None
    
    email = session["email"]
    return ADMIN_USERS.get(email)


@router.options("/login")
async def login_options():
    """Handle CORS preflight for login"""
    return Response(status_code=200)


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest, response: Response):
    """Login with email and password"""
    user = ADMIN_USERS.get(request.email)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if user["password_hash"] != hash_password(request.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Create session
    token = create_session(user["id"], user["email"])
    
    # Set cookie
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=os.getenv("ENVIRONMENT") == "production",
    )
    
    return AuthResponse(
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            created_at=user["created_at"],
            updated_at=user["updated_at"],
        ),
        message="Login successful",
    )


@router.get("/me")
async def get_me(request: Request):
    """Get current authenticated user"""
    user = get_current_user(request)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    return {
        "user": UserResponse(
            id=user["id"],
            email=user["email"],
            username=user.get("username"),
            created_at=user["created_at"],
            updated_at=user["updated_at"],
        )
    }


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Logout and clear session"""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    
    if token and token in sessions:
        del sessions[token]
    
    response.delete_cookie(SESSION_COOKIE_NAME)
    
    return {"message": "Logged out successfully"}
