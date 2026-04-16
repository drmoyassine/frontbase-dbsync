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
