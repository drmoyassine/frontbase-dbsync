"""
Authentication Provider Protocol Specification

Defines the protocol for authentication providers, enabling pluggable
auth backends (SuperTokens, Supabase, etc.) with a unified interface.

This protocol abstracts away provider-specific implementation details while
providing a consistent API for the application layer.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, Literal
from fastapi import Request, Response
from pydantic import BaseModel


# =============================================================================
# Request/Response Models
# =============================================================================

class LoginCredentials(BaseModel):
    """Standard login credentials across all providers."""
    email: str
    password: str


class SignupCredentials(BaseModel):
    """Standard signup credentials across all providers."""
    email: str
    password: str


class SessionInfo(BaseModel):
    """Standard session information returned by all providers.

    Supports both attribute access (session.user_id) and dictionary-style
    access (session["user_id"], session.get("user_id")) for backward
    compatibility with code that treats this as a dict.
    """
    user_id: str
    email: str
    tenant_id: Optional[str] = None
    tenant_slug: Optional[str] = None
    role: str = "owner"
    is_master: bool = False
    access_token_payload: Dict[str, Any] = {}

    def __getitem__(self, key: str) -> Any:
        """Allow dictionary-style access: session['user_id']."""
        try:
            return getattr(self, key)
        except AttributeError:
            raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        """Allow dictionary-style .get() access: session.get('user_id')."""
        return getattr(self, key, default)


class UserMetadata(BaseModel):
    """Standard user metadata structure."""
    tenant_id: Optional[str] = None
    tenant_slug: Optional[str] = None
    role: str = "owner"
    # Provider-specific metadata can be added via extra fields
    extra: Dict[str, Any] = {}


# =============================================================================
# Provider Configuration Models
# =============================================================================

class ProviderConfig(BaseModel):
    """Base configuration for any auth provider."""
    provider_type: Literal["supertokens", "supabase", "mock"]


class SuperTokensConfig(ProviderConfig):
    """Configuration specific to SuperTokens."""
    provider_type: Literal["supertokens"] = "supertokens"
    api_domain: Optional[str] = None
    website_domain: Optional[str] = None


class SupabaseConfig(ProviderConfig):
    """Configuration specific to Supabase."""
    provider_type: Literal["supabase"] = "supabase"
    url: str
    anon_key: str
    jwt_secret: Optional[str] = None
    service_role_key: Optional[str] = None


# =============================================================================
# AuthProvider Protocol
# =============================================================================

class AuthProvider(ABC):
    """Protocol for authentication providers.

    Each provider implements a common interface for:
    - User authentication (login, signup)
    - Session management (create, validate, revoke)
    - User metadata management
    - Provider-specific operations

    The design allows seamless switching between providers without
    changing application code.

    Environment Variables:
        AUTH_PROVIDER: "supertokens" | "supabase" (default: "supertokens")
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name for logging/debugging."""
        pass

    @property
    @abstractmethod
    def provider_type(self) -> Literal["supertokens", "supabase"]:
        """Return the provider type identifier."""
        pass

    # -------------------------------------------------------------------------
    # Authentication Operations
    # -------------------------------------------------------------------------

    @abstractmethod
    async def login(
        self,
        credentials: LoginCredentials,
        request: Request,
        response: Response,
    ) -> SessionInfo:
        """Authenticate a user with email and password.

        Creates a new session and returns session information with tenant claims.
        Raises HTTPException for authentication failures.

        Args:
            credentials: Email and password
            request: FastAPI request object
            response: FastAPI response object for setting cookies

        Returns:
            SessionInfo with user ID and tenant claims

        Raises:
            HTTPException: 401 if credentials invalid, 429 if rate limited
        """
        pass

    @abstractmethod
    async def signup(
        self,
        credentials: SignupCredentials,
        request: Request,
        response: Response,
        metadata: Optional[UserMetadata] = None,
    ) -> SessionInfo:
        """Register a new user.

        Creates a user account, optionally provisions tenant resources,
        and creates a session with tenant claims.

        Args:
            credentials: Email and password
            request: FastAPI request object
            response: FastAPI response object for setting cookies
            metadata: Optional initial metadata (tenant info for signup)

        Returns:
            SessionInfo with newly created user ID and claims

        Raises:
            HTTPException: 409 if email exists, 400 if validation fails
        """
        pass

    # -------------------------------------------------------------------------
    # Session Management
    # -------------------------------------------------------------------------

    @abstractmethod
    async def validate_session(self, request: Request) -> Optional[SessionInfo]:
        """Validate the current session from the request.

        Extracts and validates the session from cookies or Authorization header.
        Returns None if session is invalid or missing.

        Args:
            request: FastAPI request object

        Returns:
            SessionInfo if session valid, None otherwise
        """
        pass

    @abstractmethod
    async def revoke_session(self, request: Request) -> None:
        """Revoke/terminate the current session.

        Invalidates the session token(s) and clears any cookies.

        Args:
            request: FastAPI request object

        Raises:
            HTTPException: 401 if no valid session to revoke
        """
        pass

    @abstractmethod
    async def refresh_session(self, request: Request) -> Optional[SessionInfo]:
        """Refresh an expired session if supported.

        Returns new SessionInfo if refresh succeeded, None otherwise.

        Args:
            request: FastAPI request object

        Returns:
            SessionInfo if refreshed, None if not refreshable
        """
        pass

    # -------------------------------------------------------------------------
    # User Metadata
    # -------------------------------------------------------------------------

    @abstractmethod
    async def get_user_metadata(self, user_id: str) -> UserMetadata:
        """Fetch user metadata including tenant claims.

        Returns the user's current metadata state. Provider should
        cache this appropriately.

        Args:
            user_id: Unique user identifier

        Returns:
            UserMetadata with tenant claims and any extra data

        Raises:
            HTTPException: 404 if user not found
        """
        pass

    @abstractmethod
    async def set_user_metadata(
        self,
        user_id: str,
        metadata: UserMetadata,
    ) -> None:
        """Update user metadata (tenant claims, etc.).

        Atomically updates the user's metadata. Provider should
        handle concurrency appropriately.

        Args:
            user_id: Unique user identifier
            metadata: New metadata to set

        Raises:
            HTTPException: 404 if user not found, 400 if validation fails
        """
        pass

    # -------------------------------------------------------------------------
    # User Management
    # -------------------------------------------------------------------------

    @abstractmethod
    async def delete_user(self, user_id: str) -> None:
        """Delete a user account.

        Permanently removes the user and all associated data.
        Should handle tenant cleanup if needed.

        Args:
            user_id: Unique user identifier

        Raises:
            HTTPException: 404 if user not found, 403 if forbidden
        """
        pass

    @abstractmethod
    async def user_exists(self, email: str) -> bool:
        """Check if a user exists by email.

        Args:
            email: Email address to check

        Returns:
            True if user exists, False otherwise
        """
        pass

    # -------------------------------------------------------------------------
    # Provider-Specific Operations
    # -------------------------------------------------------------------------

    @abstractmethod
    async def send_password_reset(
        self,
        email: str,
        reset_url: str,
    ) -> None:
        """Initiate a password reset flow.

        Sends a password reset email or generates a reset token.

        Args:
            email: User's email address
            reset_url: Base URL for reset link

        Raises:
            HTTPException: 404 if user not found
        """
        pass

    @abstractmethod
    async def reset_password(
        self,
        token: str,
        new_password: str,
    ) -> None:
        """Complete password reset with token.

        Args:
            token: Password reset token
            new_password: New password to set

        Raises:
            HTTPException: 400 if token invalid/expired
        """
        pass

    # -------------------------------------------------------------------------
    # Health/Status
    # -------------------------------------------------------------------------

    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        """Check provider health and configuration.

        Returns status information for monitoring.

        Returns:
            Dict with 'healthy' bool and optional 'details'
        """
        pass


# =============================================================================
# Provider Factory
# =============================================================================

class ProviderFactory:
    """Factory for creating auth provider instances.

    Usage:
        provider = ProviderFactory.get_provider()
        session_info = await provider.validate_session(request)
    """

    _instance: Optional[AuthProvider] = None
    _config: Optional[ProviderConfig] = None

    @classmethod
    def configure(cls, config: ProviderConfig) -> None:
        """Configure the provider factory with specific config.

        Args:
            config: Provider configuration
        """
        cls._config = config
        cls._instance = None  # Reset instance

    @classmethod
    def get_provider(cls) -> Optional[AuthProvider]:
        """Get the configured auth provider instance.

        Provider selection logic:
        1. If explicitly configured via configure(), use that
        2. Check AUTH_PROVIDER env var ("supertokens" | "supabase")
        3. Default to SuperTokens for cloud mode
        4. Return None for self-host mode (uses cookie auth)

        Returns:
            AuthProvider instance or None for self-host mode
        """
        if cls._instance:
            return cls._instance

        from app.config.edition import is_cloud
        if not is_cloud():
            # Self-host mode uses cookie auth, no provider needed
            return None

        import os

        # Determine provider type
        provider_type = os.getenv("AUTH_PROVIDER", "supertokens").lower()

        if provider_type == "supabase":
            from app.auth.providers.supabase import SupabaseProviderImpl
            cls._instance = SupabaseProviderImpl.from_env()

        elif provider_type == "supertokens":
            from app.auth.providers.supertokens import SuperTokensProviderImpl
            cls._instance = SuperTokensProviderImpl()

        else:
            raise ValueError(f"Unknown auth provider: {provider_type}")

        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Reset the provider instance (for testing)."""
        cls._instance = None
        cls._config = None
