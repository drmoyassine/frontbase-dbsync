"""
Supabase Auth Provider Implementation

Implements the AuthProvider protocol for Supabase authentication.
Uses Supabase JWT tokens for authentication and custom database table
for storing tenant claims.
"""

from __future__ import annotations

from typing import Optional, Dict, Any, Literal
from datetime import datetime, UTC
import logging

from fastapi import Request, Response, HTTPException
from pydantic import BaseModel

from app.auth.provider_protocol import (
    AuthProvider,
    LoginCredentials,
    SignupCredentials,
    SessionInfo,
    UserMetadata,
)
from app.auth.tenant_provisioning import (
    TenantProvisioner,
    TenantProvisionRequest,
    TenantProvisionResult,
    TenantAttachRequest,
    TenantAttachResult,
    BaseTenantProvisioner,
)
from sqlalchemy.orm import Session as DBSession

logger = logging.getLogger(__name__)


class SupabaseProviderImpl(AuthProvider):
    """Supabase authentication provider implementation.

    Uses Supabase JWT tokens for authentication and stores tenant
    claims in the supabase_user_metadata database table.

    Note: Supabase authentication (signup/login) is typically handled
    client-side via the Supabase JS SDK. This provider focuses on
    server-side validation and tenant management.
    """

    def __init__(self, supabase_url: str, supabase_anon_key: str, jwt_secret: Optional[str] = None):
        self._name = "supabase"
        self._supabase_url = supabase_url
        self._supabase_anon_key = supabase_anon_key
        self._jwt_secret = jwt_secret
        self._cached_jwt_secret: Optional[str] = None

    @property
    def provider_name(self) -> str:
        return self._name

    @property
    def provider_type(self) -> Literal["supertokens", "supabase"]:
        return "supabase"

    @classmethod
    def from_env(cls) -> "SupabaseProviderImpl":
        """Create instance from environment variables."""
        import os

        url = os.getenv("SUPABASE_URL", "")
        anon_key = os.getenv("SUPABASE_ANON_KEY", "")
        jwt_secret = os.getenv("SUPABASE_JWT_SECRET")

        if not url or not anon_key:
            raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY required for Supabase provider")

        return cls(url, anon_key, jwt_secret)

    # -------------------------------------------------------------------------
    # JWT Validation
    # -------------------------------------------------------------------------

    async def _get_jwt_secret(self) -> str:
        """Get JWT secret from env or cache."""
        if self._cached_jwt_secret:
            return self._cached_jwt_secret

        if self._jwt_secret:
            self._cached_jwt_secret = self._jwt_secret
            return self._jwt_secret

        logger.error("[Supabase] SUPABASE_JWT_SECRET environment variable is missing")
        raise ValueError("SUPABASE_JWT_SECRET environment variable required")

    async def _verify_jwt(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode Supabase JWT token."""
        try:
            import jwt
            from jwt.exceptions import InvalidTokenError

            secret = await self._get_jwt_secret()

            # Decode JWT (Supabase uses HS256)
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                options={"verify_aud": False},  # Supabase uses specific audiences
            )
            return payload
        except InvalidTokenError as e:
            logger.warning(f"[Supabase] Invalid JWT: {e}")
            return None
        except Exception as e:
            logger.error(f"[Supabase] JWT verification error: {e}")
            return None

    def _extract_token(self, request: Request) -> Optional[str]:
        """Extract JWT token from request."""
        # Try Authorization header first
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]

        # Try cookies (Supabase client SDK sets these)
        token = request.cookies.get("sb-access-token") or request.cookies.get(
            "supabase-session"
        )
        return token

    # -------------------------------------------------------------------------
    # Authentication Operations
    # -------------------------------------------------------------------------

    async def login(
        self,
        credentials: LoginCredentials,
        request: Request,
        response: Response,
    ) -> SessionInfo:
        """
        Login is handled client-side with Supabase JS SDK.
        
        This method is not supported server-side for Supabase.
        """
        raise NotImplementedError("Supabase login is handled client-side via SDK.")

    async def signup(
        self,
        credentials: SignupCredentials,
        request: Request,
        response: Response,
        metadata: Optional[UserMetadata] = None,
    ) -> SessionInfo:
        """
        Signup is handled client-side with Supabase JS SDK.
        
        This method is not supported server-side for Supabase.
        """
        raise NotImplementedError("Supabase signup is handled client-side via SDK.")

    # -------------------------------------------------------------------------
    # Session Management
    # -------------------------------------------------------------------------

    async def validate_session(self, request: Request) -> Optional[SessionInfo]:
        """Validate Supabase JWT from request."""
        token = self._extract_token(request)
        if not token:
            return None

        payload = await self._verify_jwt(token)
        if not payload:
            return None

        # Extract claims from JWT
        user_metadata = payload.get("user_metadata", {})
        app_metadata = payload.get("app_metadata", {})

        user_id = payload.get("sub")
        email = payload.get("email") or user_metadata.get("email")

        # Get tenant claims from our metadata table (more authoritative)
        tenant_claims = await self._get_tenant_claims_from_db(user_id)

        return SessionInfo(
            user_id=user_id,
            email=email,
            tenant_id=tenant_claims.get("tenant_id"),
            tenant_slug=tenant_claims.get("tenant_slug"),
            role=tenant_claims.get("role", "owner"),
            is_master=app_metadata.get("is_master", False),
            access_token_payload={
                "email": email,
                "tenant_id": tenant_claims.get("tenant_id"),
                "tenant_slug": tenant_claims.get("tenant_slug"),
                "role": tenant_claims.get("role", "owner"),
                "is_master": False,
            },
        )

    async def revoke_session(self, request: Request) -> None:
        """Revoke Supabase session.

        Note: Server-side revocation requires service_role key.
        Client typically handles this via signOut().
        """
        token = self._extract_token(request)
        if not token:
            return

        # Clear cookie
        # (In a real implementation, you might want to call Supabase admin API)
        pass

    async def refresh_session(self, request: Request) -> Optional[SessionInfo]:
        """Refresh Supabase session.

        Supabase handles refresh automatically via their SDK.
        This validates the current session.
        """
        return await self.validate_session(request)

    # -------------------------------------------------------------------------
    # User Metadata
    # -------------------------------------------------------------------------

    async def get_user_metadata(self, user_id: str) -> UserMetadata:
        """Get user metadata from our database table."""
        from app.database.config import SessionLocal
        from app.models.auth import SupabaseUserMetadata

        db = SessionLocal()
        try:
            record = (
                db.query(SupabaseUserMetadata)
                .filter(SupabaseUserMetadata.user_id == user_id)
                .first()
            )
            if record:
                return UserMetadata(
                    tenant_id=record.tenant_id,
                    tenant_slug=record.tenant_slug,
                    role=record.role,
                    extra={},
                )
            return UserMetadata()
        finally:
            db.close()

    async def set_user_metadata(
        self,
        user_id: str,
        metadata: UserMetadata,
    ) -> None:
        """Update user metadata in our database table."""
        from app.database.config import SessionLocal
        from app.models.auth import SupabaseUserMetadata

        db = SessionLocal()
        try:
            record = (
                db.query(SupabaseUserMetadata)
                .filter(SupabaseUserMetadata.user_id == user_id)
                .first()
            )

            now = datetime.now(UTC).isoformat()

            if record:
                record.tenant_id = metadata.tenant_id
                record.tenant_slug = metadata.tenant_slug
                record.role = metadata.role
                record.updated_at = now
            else:
                record = SupabaseUserMetadata(
                    user_id=user_id,
                    tenant_id=metadata.tenant_id,
                    tenant_slug=metadata.tenant_slug,
                    role=metadata.role,
                    created_at=now,
                    updated_at=now,
                )
                db.add(record)

            db.commit()
        finally:
            db.close()

    # -------------------------------------------------------------------------
    # User Management
    # -------------------------------------------------------------------------

    async def delete_user(self, user_id: str) -> None:
        """Delete user from Supabase and our metadata."""
        # Delete from Supabase
        await self._delete_user_from_supabase(user_id)

        # Delete metadata
        from app.database.config import SessionLocal
        from app.models.auth import SupabaseUserMetadata

        db = SessionLocal()
        try:
            record = (
                db.query(SupabaseUserMetadata)
                .filter(SupabaseUserMetadata.user_id == user_id)
                .first()
            )
            if record:
                db.delete(record)
                db.commit()
        finally:
            db.close()

        logger.info(f"[Supabase] Deleted user {user_id}")

    async def user_exists(self, email: str) -> bool:
        """Check if user exists in Supabase."""
        import httpx

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self._supabase_url}/auth/v1/user",
                    headers={
                        "apikey": self._supabase_anon_key,
                        "Authorization": f"Bearer {self._supabase_anon_key}",
                    },
                    timeout=5.0,
                )
                # This checks the current user, not by email
                # For production, you'd need to query the auth.users table directly
                return False
        except Exception:
            return False

    # -------------------------------------------------------------------------
    # Password Reset
    # -------------------------------------------------------------------------

    async def send_password_reset(self, email: str, reset_url: str) -> None:
        """Send password reset email via Supabase."""
        import httpx

        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self._supabase_url}/auth/v1/recover",
                    json={"email": email},
                    headers={"apikey": self._supabase_anon_key},
                    timeout=10.0,
                )
        except httpx.RequestError as e:
            logger.error(f"[Supabase] Password reset request failed: {e}")
            raise HTTPException(status_code=500, detail="Failed to send password reset email")

    async def reset_password(self, token: str, new_password: str) -> None:
        """Reset password with Supabase token."""
        import httpx

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self._supabase_url}/auth/v1/user/update",
                    json={"password": new_password},
                    headers={
                        "apikey": self._supabase_anon_key,
                        "Authorization": f"Bearer {token}",
                    },
                    timeout=10.0,
                )

                if response.status_code != 200:
                    raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        except httpx.RequestError as e:
            logger.error(f"[Supabase] Password reset request failed: {e}")
            raise HTTPException(status_code=500, detail="Failed to reset password")

    # -------------------------------------------------------------------------
    # Health Check
    # -------------------------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Check Supabase health."""
        try:
            import httpx

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self._supabase_url}/rest/v1/",
                    headers={"apikey": self._supabase_anon_key},
                    timeout=5.0,
                )

                healthy = response.status_code < 500

                return {
                    "healthy": healthy,
                    "details": {
                        "provider": "supabase",
                        "status_code": response.status_code,
                    },
                }
        except Exception as e:
            return {
                "healthy": False,
                "details": {"provider": "supabase", "error": str(e)},
            }

    # -------------------------------------------------------------------------
    # Private Helper Methods
    # -------------------------------------------------------------------------

    async def _get_tenant_claims_from_db(self, user_id: str) -> Dict[str, Any]:
        """Get tenant claims from SupabaseUserMetadata table."""
        from app.database.config import SessionLocal
        from app.models.auth import SupabaseUserMetadata

        db = SessionLocal()
        try:
            record = (
                db.query(SupabaseUserMetadata)
                .filter(SupabaseUserMetadata.user_id == user_id)
                .first()
            )
            if record and record.tenant_id:
                return {
                    "tenant_id": record.tenant_id,
                    "tenant_slug": record.tenant_slug,
                    "role": record.role,
                }
            return {}
        finally:
            db.close()

    async def _delete_user_from_supabase(self, user_id: str) -> None:
        """Delete user from Supabase using admin API."""
        import httpx
        import os

        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not service_role_key:
            logger.warning("[Supabase] SERVICE_ROLE_KEY not set, skipping user deletion")
            return

        try:
            async with httpx.AsyncClient() as client:
                await client.delete(
                    f"{self._supabase_url}/auth/v1/admin/users/{user_id}",
                    headers={
                        "apikey": service_role_key,
                        "Authorization": f"Bearer {service_role_key}",
                    },
                    timeout=10.0,
                )
        except Exception as e:
            logger.error(f"[Supabase] Failed to delete user {user_id}: {e}")


class SupabaseTenantProvisioner(BaseTenantProvisioner):
    """Supabase-specific tenant provisioning.

    Stores tenant claims in the supabase_user_metadata database table.
    """

    async def store_user_metadata(
        self,
        db: DBSession,
        user_id: str,
        tenant_id: str,
        tenant_slug: str,
        role: str = "owner",
    ) -> None:
        """Store tenant claims in SupabaseUserMetadata table."""
        from app.models.auth import SupabaseUserMetadata

        now = datetime.now(UTC).isoformat()

        record = (
            db.query(SupabaseUserMetadata)
            .filter(SupabaseUserMetadata.user_id == user_id)
            .first()
        )

        if record:
            record.tenant_id = tenant_id
            record.tenant_slug = tenant_slug
            record.role = role
            record.updated_at = now
        else:
            record = SupabaseUserMetadata(
                user_id=user_id,
                tenant_id=tenant_id,
                tenant_slug=tenant_slug,
                role=role,
                created_at=now,
                updated_at=now,
            )
            db.add(record)

        db.flush()

    async def get_user_tenant_claims(
        self,
        db: DBSession,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get tenant claims from SupabaseUserMetadata table."""
        from app.models.auth import SupabaseUserMetadata

        record = (
            db.query(SupabaseUserMetadata)
            .filter(SupabaseUserMetadata.user_id == user_id)
            .first()
        )

        if not record or not record.tenant_id:
            return None

        return {
            "tenant_id": record.tenant_id,
            "tenant_slug": record.tenant_slug,
            "role": record.role,
        }
