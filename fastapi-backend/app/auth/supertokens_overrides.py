"""
SuperTokens Override Functions — Cloud mode only.

Hooks into SuperTokens emailpassword recipe to:
- Disable the built-in /api/auth/signup (we use our own custom endpoint)
- Disable the built-in /api/auth/signin (we use /api/auth/login)

Tenant provisioning (Tenant + TenantMember + Project) is handled in the
custom `/api/auth/signup` endpoint in auth.py, NOT in an override.
This keeps the logic explicit and testable.
"""

from __future__ import annotations

import re
import uuid
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session as DBSession

from app.models.models import Tenant, TenantMember, Project
from app.models.auth import User

logger = logging.getLogger(__name__)

# Reserved slugs that cannot be used as tenant subdomains
RESERVED_SLUGS = frozenset({
    "app", "api", "www", "admin", "auth", "login", "signup",
    "dashboard", "test", "demo", "staging", "dev", "mail",
    "smtp", "ftp", "ns1", "ns2", "cdn", "static", "assets",
    "docs", "help", "support", "status", "blog", "community",
})

SLUG_REGEX = re.compile(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")


def validate_slug(slug: str) -> Optional[str]:
    """Validate a tenant slug. Returns error message or None if valid."""
    slug = slug.lower().strip()
    if len(slug) < 3:
        return "Slug must be at least 3 characters"
    if len(slug) > 50:
        return "Slug must be at most 50 characters"
    if not SLUG_REGEX.match(slug):
        return "Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen"
    if slug in RESERVED_SLUGS:
        return f"'{slug}' is a reserved name"
    return None


def check_slug_available(db: DBSession, slug: str) -> bool:
    """Check if a slug is available in the database."""
    existing = db.query(Tenant).filter(Tenant.slug == slug).first()
    return existing is None


def provision_tenant(
    db: DBSession,
    *,
    st_user_id: str,
    email: str,
    slug: str,
    workspace_name: str,
) -> dict:
    """Create Tenant + TenantMember + Project in one transaction.

    Returns a dict with tenant info for session claims.
    Raises ValueError on validation failure.
    """
    slug = slug.lower().strip()

    # Validate slug
    slug_error = validate_slug(slug)
    if slug_error:
        raise ValueError(slug_error)

    # Check uniqueness
    if not check_slug_available(db, slug):
        raise ValueError(f"Slug '{slug}' is already taken")

    now = datetime.utcnow().isoformat()
    tenant_id = str(uuid.uuid4())
    project_id = str(uuid.uuid4())
    member_id = str(uuid.uuid4())

    # 0. Sync User to public.users to satisfy Foreign Keys
    user = User(
        id=st_user_id,
        username=email.split("@")[0] + "_" + st_user_id[:8],
        email=email,
        password_hash="[managed_by_supertokens]",
        created_at=now,
        updated_at=now,
    )
    db.add(user)

    # 1. Create Tenant
    tenant = Tenant(
        id=tenant_id,
        slug=slug,
        name=workspace_name,
        owner_id=st_user_id,
        plan="free",
        status="active",
        created_at=now,
        updated_at=now,
    )
    db.add(tenant)

    # 2. Create TenantMember
    member = TenantMember(
        id=member_id,
        tenant_id=tenant_id,
        user_id=st_user_id,
        role="owner",
        created_at=now,
    )
    db.add(member)

    # 3. Create Project (every tenant needs a default project)
    project = Project(
        id=project_id,
        name=f"{workspace_name} Project",
        description=f"Default project for {workspace_name}",
        tenant_id=tenant_id,
        created_at=now,
        updated_at=now,
    )
    db.add(project)

    db.flush()  # Validate FK constraints before commit
    logger.info(f"[Signup] Provisioned tenant '{slug}' (id={tenant_id}) for user {st_user_id}")

    return {
        "tenant_id": tenant_id,
        "tenant_slug": slug,
        "workspace_name": workspace_name,
        "project_id": project_id,
        "role": "owner",
    }
