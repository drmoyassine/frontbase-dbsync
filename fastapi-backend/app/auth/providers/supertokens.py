"""
SuperTokens Auth Provider Implementation

Implements the AuthProvider protocol for SuperTokens authentication.
This is the default provider for cloud mode.
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


class SuperTokensProviderImpl(AuthProvider):
    """SuperTokens authentication provider implementation.

    Uses SuperTokens emailpassword recipe for authentication and
    recipe_usermetadata for storing tenant claims.
    """

    def __init__(self):
        self._name = "supertokens"

    @property
    def provider_name(self) -> str:
        return self._name

    @property
    def provider_type(self) -> Literal["supertokens", "supabase"]:
        return "supertokens"

    # -------------------------------------------------------------------------
    # Authentication Operations
    # -------------------------------------------------------------------------

    async def login(
        self,
        credentials: LoginCredentials,
        request: Request,
        response: Response,
    ) -> SessionInfo:
        """Authenticate with SuperTokens emailpassword."""
        from supertokens_python.recipe.emailpassword.asyncio import sign_in as st_sign_in
        from supertokens_python.recipe.emailpassword.interfaces import SignInOkResult
        from supertokens_python.recipe.session.asyncio import create_new_session
        from supertokens_python.recipe.usermetadata.asyncio import get_user_metadata
        from supertokens_python.types import RecipeUserId

        result = await st_sign_in("public", credentials.email, credentials.password)

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

        # Create session with tenant claims
        recipe_uid = (
            st_user.login_methods[0].recipe_user_id
            if st_user.login_methods
            else RecipeUserId(st_user.id)
        )
        await create_new_session(
            request,
            "public",
            recipe_uid,
            access_token_payload={
                "email": credentials.email,
                "tenant_id": tenant_id,
                "tenant_slug": tenant_slug,
                "role": role,
                "is_master": False,
            },
        )

        logger.info(f"[SuperTokens] User login: {credentials.email} (tenant={tenant_slug})")

        return SessionInfo(
            user_id=st_user_id,
            email=credentials.email,
            tenant_id=tenant_id,
            tenant_slug=tenant_slug,
            role=role,
            is_master=False,
            access_token_payload={
                "email": credentials.email,
                "tenant_id": tenant_id,
                "tenant_slug": tenant_slug,
                "role": role,
                "is_master": False,
            },
        )

    async def signup(
        self,
        credentials: SignupCredentials,
        request: Request,
        response: Response,
        metadata: Optional[UserMetadata] = None,
    ) -> SessionInfo:
        """Register with SuperTokens and provision tenant."""
        from supertokens_python.recipe.emailpassword.asyncio import sign_up as st_sign_up
        from supertokens_python.recipe.emailpassword.interfaces import (
            SignUpOkResult,
            EmailAlreadyExistsError,
        )
        from supertokens_python.recipe.session.asyncio import create_new_session
        from supertokens_python.recipe.usermetadata.asyncio import update_user_metadata
        from supertokens_python.types import RecipeUserId

        # Create SuperTokens user
        st_result = await st_sign_up("public", credentials.email, credentials.password)

        if isinstance(st_result, EmailAlreadyExistsError):
            raise HTTPException(status_code=409, detail="An account with this email already exists")

        if not isinstance(st_result, SignUpOkResult):
            raise HTTPException(status_code=500, detail="Signup failed — unexpected error")

        st_user = st_result.user
        st_user_id = st_user.id

        # Extract tenant info from metadata
        tenant_slug = metadata.tenant_slug if metadata else None
        workspace_name = metadata.extra.get("workspace_name") if metadata and metadata.extra else None

        # Provision tenant if metadata provided
        if tenant_slug and workspace_name:
            from app.database.config import SessionLocal
            from app.auth.tenant_provisioning import TenantProvisioningService

            db = SessionLocal()
            try:
                provision_result = await TenantProvisioningService.provision_tenant(
                    db,
                    user_id=st_user_id,
                    email=credentials.email,
                    workspace_name=workspace_name,
                    slug=tenant_slug,
                )
                if not provision_result.success:
                    # Rollback: delete SuperTokens user
                    from supertokens_python.asyncio import delete_user
                    await delete_user(st_user_id)
                    raise HTTPException(status_code=400, detail=provision_result.message)

                tenant_id = provision_result.tenant_id

                # Store tenant claims in SuperTokens metadata
                await update_user_metadata(
                    st_user_id,
                    {
                        "tenant_id": tenant_id,
                        "tenant_slug": tenant_slug,
                        "role": "owner",
                    },
                )
            except Exception as e:
                db.rollback()
                # Rollback: delete SuperTokens user
                try:
                    from supertokens_python.asyncio import delete_user
                    await delete_user(st_user_id)
                except Exception:
                    logger.error(f"[SuperTokens] Failed to rollback user {st_user_id}")
                raise HTTPException(status_code=500, detail=str(e))
            finally:
                db.close()

            logger.info(f"[SuperTokens] New tenant: {tenant_slug} ({credentials.email})")
        else:
            tenant_id = None

        # Create session
        recipe_uid = (
            st_user.login_methods[0].recipe_user_id
            if st_user.login_methods
            else RecipeUserId(st_user.id)
        )
        await create_new_session(
            request,
            "public",
            recipe_uid,
            access_token_payload={
                "email": credentials.email,
                "tenant_id": tenant_id,
                "tenant_slug": tenant_slug,
                "role": "owner",
                "is_master": False,
            },
        )

        return SessionInfo(
            user_id=st_user_id,
            email=credentials.email,
            tenant_id=tenant_id,
            tenant_slug=tenant_slug,
            role="owner",
            is_master=False,
            access_token_payload={
                "email": credentials.email,
                "tenant_id": tenant_id,
                "tenant_slug": tenant_slug,
                "role": "owner",
                "is_master": False,
            },
        )

    # -------------------------------------------------------------------------
    # Session Management
    # -------------------------------------------------------------------------

    async def validate_session(self, request: Request) -> Optional[SessionInfo]:
        """Validate SuperTokens session."""
        try:
            from supertokens_python.recipe.session.asyncio import get_session
            from supertokens_python.asyncio import get_user

            session = await get_session(request, session_required=False)
            if not session:
                return None

            user_id = session.get_user_id()
            payload = session.get_access_token_payload()

            # Get email from payload or user
            email = payload.get("email", "")
            if not email:
                st_user = await get_user(user_id)
                if st_user and st_user.emails:
                    email = st_user.emails[0]

            return SessionInfo(
                user_id=user_id,
                email=email,
                tenant_id=payload.get("tenant_id"),
                tenant_slug=payload.get("tenant_slug"),
                role=payload.get("role", "owner"),
                is_master=payload.get("is_master", False),
                access_token_payload=payload,
            )
        except Exception:
            return None

    async def revoke_session(self, request: Request) -> None:
        """Revoke SuperTokens session."""
        try:
            from supertokens_python.recipe.session.asyncio import get_session

            session = await get_session(request, session_required=False)
            if session:
                await session.revoke_session()
        except Exception as e:
            logger.warning(f"[SuperTokens] Session revoke error: {e}")

    async def refresh_session(self, request: Request) -> Optional[SessionInfo]:
        """Refresh SuperTokens session."""
        # SuperTokens handles refresh automatically via middleware
        return await self.validate_session(request)

    # -------------------------------------------------------------------------
    # User Metadata
    # -------------------------------------------------------------------------

    async def get_user_metadata(self, user_id: str) -> UserMetadata:
        """Get user metadata from SuperTokens."""
        from supertokens_python.recipe.usermetadata.asyncio import get_user_metadata

        result = await get_user_metadata(user_id)
        metadata = result.metadata or {}

        return UserMetadata(
            tenant_id=metadata.get("tenant_id"),
            tenant_slug=metadata.get("tenant_slug"),
            role=metadata.get("role", "owner"),
            extra={k: v for k, v in metadata.items() if k not in ("tenant_id", "tenant_slug", "role")},
        )

    async def set_user_metadata(
        self,
        user_id: str,
        metadata: UserMetadata,
    ) -> None:
        """Update user metadata in SuperTokens."""
        from supertokens_python.recipe.usermetadata.asyncio import update_user_metadata

        update_data = {
            "tenant_id": metadata.tenant_id,
            "tenant_slug": metadata.tenant_slug,
            "role": metadata.role,
        }
        update_data.update(metadata.extra)

        await update_user_metadata(user_id, update_data)

    # -------------------------------------------------------------------------
    # User Management
    # -------------------------------------------------------------------------

    async def delete_user(self, user_id: str) -> None:
        """Delete user from SuperTokens."""
        from supertokens_python.asyncio import delete_user

        await delete_user(user_id)
        logger.info(f"[SuperTokens] Deleted user {user_id}")

    async def user_exists(self, email: str) -> bool:
        """Check if user exists in SuperTokens."""
        from supertokens_python.recipe.emailpassword.asyncio import get_user_by_email

        user = await get_user_by_email("public", email)
        return user is not None

    # -------------------------------------------------------------------------
    # Password Reset
    # -------------------------------------------------------------------------

    async def send_password_reset(self, email: str, reset_url: str) -> None:
        """Send password reset email via SuperTokens."""
        from supertokens_python.recipe.emailpassword.asyncio import send_password_reset_email

        await send_password_reset_email("public", email, reset_url)

    async def reset_password(self, token: str, new_password: str) -> None:
        """Reset password with SuperTokens token."""
        from supertokens_python.recipe.emailpassword.asyncio import submit_new_password
        from supertokens_python.recipe.emailpassword.interfaces import ResetPasswordWrongOldPasswordError

        result = await submit_new_password("public", token, new_password)

        if isinstance(result, ResetPasswordWrongOldPasswordError):
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    # -------------------------------------------------------------------------
    # Health Check
    # -------------------------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Check SuperTokens health."""
        try:
            from supertokens_python.recipe.emailpassword.asyncio import get_user_by_email

            # Try to query a non-existent user (health check)
            await get_user_by_email("public", "_health_check_@test.com")

            return {
                "healthy": True,
                "details": {"provider": "supertokens"},
            }
        except Exception as e:
            return {
                "healthy": False,
                "details": {"provider": "supertokens", "error": str(e)},
            }


class SuperTokensTenantProvisioner(BaseTenantProvisioner):
    """SuperTokens-specific tenant provisioning.

    Stores tenant claims in SuperTokens recipe_usermetadata table.
    """

    async def store_user_metadata(
        self,
        db: DBSession,
        user_id: str,
        tenant_id: str,
        tenant_slug: str,
        role: str = "owner",
    ) -> None:
        """Store tenant claims in SuperTokens user metadata."""
        from supertokens_python.recipe.usermetadata.asyncio import update_user_metadata

        await update_user_metadata(
            user_id,
            {
                "tenant_id": tenant_id,
                "tenant_slug": tenant_slug,
                "role": role,
            },
        )

    async def get_user_tenant_claims(
        self,
        db: DBSession,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get tenant claims from SuperTokens user metadata."""
        from supertokens_python.recipe.usermetadata.asyncio import get_user_metadata

        result = await get_user_metadata(user_id)
        metadata = result.metadata or {}

        if not metadata.get("tenant_id"):
            return None

        return {
            "tenant_id": metadata.get("tenant_id"),
            "tenant_slug": metadata.get("tenant_slug"),
            "role": metadata.get("role", "owner"),
        }
