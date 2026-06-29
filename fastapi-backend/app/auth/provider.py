"""
Authentication Provider Abstraction

Factory for creating auth provider instances. This module provides
a unified interface for authentication across different providers
(SuperTokens, Supabase, etc.).

Usage:
    from app.auth.provider import get_auth_provider
    provider = get_auth_provider()
    session_info = await provider.validate_session(request)
"""

from __future__ import annotations

from typing import Optional
from app.auth.provider_protocol import ProviderFactory

# Re-export the factory for convenience
get_auth_provider = ProviderFactory.get_provider
configure_provider = ProviderFactory.configure
reset_provider = ProviderFactory.reset

__all__ = [
    "get_auth_provider",
    "configure_provider",
    "reset_provider",
]
