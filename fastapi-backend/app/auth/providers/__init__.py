"""
Auth Provider Implementations

This package contains concrete implementations of the AuthProvider protocol
for different authentication backends.

Available Providers:
    - supertokens: SuperTokens emailpassword authentication
    - supabase: Supabase JWT authentication

Usage:
    from app.auth.provider import get_auth_provider
    provider = get_auth_provider()
    session = await provider.validate_session(request)
"""

from app.auth.providers.supertokens import SuperTokensProviderImpl
from app.auth.providers.supabase import SupabaseProviderImpl

__all__ = [
    "SuperTokensProviderImpl",
    "SupabaseProviderImpl",
]
