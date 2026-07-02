"""
Centralized edition / deployment-mode detection.

DEPLOYMENT_MODE controls whether Frontbase runs as:
  - "self-host" (default) — single-tenant, env-var admin, session cookies
  - "cloud"               — multi-tenant SaaS, DB-backed users, JWT auth

All edition checks throughout the codebase should import from this module
instead of reading the env var directly.
"""

import os

DEPLOYMENT_MODE: str = os.getenv("DEPLOYMENT_MODE", "self-host")


def is_cloud() -> bool:
    """True when running as the multi-tenant cloud SaaS."""
    return DEPLOYMENT_MODE == "cloud"


def is_self_host() -> bool:
    """True when running as a self-hosted single-tenant instance."""
    return DEPLOYMENT_MODE != "cloud"


def auth_provider() -> str:
    """Configured platform auth provider.

    'supertokens' (default) or 'supabase'. Read live from the env (not cached)
    and normalized (trimmed + lowercased) so 'Supabase' / ' supabase ' resolve
    the same way.
    """
    return (os.getenv("AUTH_PROVIDER") or "supertokens").strip().lower()


def is_supertokens_enabled() -> bool:
    """Whether the SuperTokens SDK (init + middleware) should be wired up.

    SuperTokens is cloud-only, and is skipped when Supabase is the chosen
    provider. Centralizing this here keeps main.py's init/middleware gates in
    lockstep and makes the decision unit-testable without importing the app.
    """
    return is_cloud() and auth_provider() != "supabase"
