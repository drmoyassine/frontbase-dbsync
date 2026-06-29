"""
Supabase Tenant Provisioning

Handles tenant provisioning for Supabase-authenticated users.
Provides /api/auth/provision-tenant endpoint for creating tenants from JWT.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import uuid
import logging
from datetime import datetime, UTC

from app.config.edition import is_cloud
from app.database.config import SessionLocal
from app.models.tenant import Tenant, TenantMember
from app.models.auth import SupabaseUserMetadata, User
from app.models.models import Project

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Supabase Auth"])


class ProvisionTenantRequest(BaseModel):
    """Request to provision a tenant for Supabase user."""
    workspace_name: str
    slug: str


class ProvisionTenantResponse(BaseModel):
    """Response after tenant provisioning."""
    success: bool
    tenant_id: Optional[str] = None
    tenant_slug: Optional[str] = None
    project_id: Optional[str] = None
    message: str


def validate_slug(slug: str) -> Optional[str]:
    """Validate a tenant slug. Returns error message or None if valid."""
    import re
    from app.auth.supertokens_overrides import RESERVED_SLUGS, SLUG_REGEX

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


def check_slug_available(db: SessionLocal, slug: str) -> bool:
    """Check if a slug is available in the database."""
    existing = db.query(Tenant).filter(Tenant.slug == slug).first()
    return existing is None


@router.post("/provision-tenant", response_model=ProvisionTenantResponse)
async def provision_tenant(request: Request, body: ProvisionTenantRequest):
    """Provision a tenant for the authenticated Supabase user.

    This endpoint is called after Supabase authentication to create:
    1. Tenant record
    2. TenantMember record (owner role)
    3. Default Project
    4. SupabaseUserMetadata (stores tenant claims)

    Idempotent: safe to call multiple times for the same user.

    Headers:
        Authorization: Bearer <supabase_jwt_token>

    The JWT must be valid and signed by the configured Supabase instance.
    """
    # Cloud mode only
    if not is_cloud():
        raise HTTPException(
            status_code=400,
            detail="Tenant provisioning only available in cloud mode"
        )

    # Verify Supabase JWT
    from app.auth.provider import get_auth_provider
    provider = get_auth_provider()
    if not provider or provider.provider_name != "supabase":
        raise HTTPException(
            status_code=400,
            detail="Supabase provider not configured"
        )

    # Get user from JWT
    user_id = await provider.get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or missing authentication")

    # Validate slug
    slug = body.slug.lower().strip()
    slug_error = validate_slug(slug)
    if slug_error:
        raise HTTPException(status_code=400, detail=slug_error)

    # Get email from token
    session_data = await provider.validate_session(request)
    email = session_data.get("email") if session_data else None
    if not email:
        raise HTTPException(status_code=400, detail="Email not found in token")

    db = SessionLocal()
    try:
        # Check if user already has metadata (idempotent)
        existing_metadata = db.query(SupabaseUserMetadata).filter(
            SupabaseUserMetadata.user_id == user_id
        ).first()

        if existing_metadata and existing_metadata.tenant_id:
            # User already has a tenant - return existing info
            tenant = db.query(Tenant).filter(Tenant.id == existing_metadata.tenant_id).first()
            if tenant:
                return ProvisionTenantResponse(
                    success=True,
                    tenant_id=tenant.id,
                    tenant_slug=tenant.slug,
                    project_id=None,  # Could query project if needed
                    message="Tenant already provisioned",
                )

        # Check slug availability
        if not check_slug_available(db, slug):
            raise HTTPException(status_code=409, detail=f"Slug '{slug}' is already taken")

        now = datetime.now(UTC).isoformat()
        tenant_id = str(uuid.uuid4())
        project_id = str(uuid.uuid4())
        member_id = str(uuid.uuid4())

        # 1. Sync User to public.users
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            user = User(
                id=user_id,
                username=email.split("@")[0] + "_" + user_id[:8],
                email=email,
                password_hash="[managed_by_supabase]",
                created_at=now,
                updated_at=now,
            )
            db.add(user)

        # 2. Create Tenant
        tenant = Tenant(
            id=tenant_id,
            slug=slug,
            name=body.workspace_name,
            owner_id=user_id,
            plan="free",
            status="active",
            created_at=now,
            updated_at=now,
        )
        db.add(tenant)

        # 3. Create TenantMember
        member = TenantMember(
            id=member_id,
            tenant_id=tenant_id,
            user_id=user_id,
            role="owner",
            created_at=now,
        )
        db.add(member)

        # 4. Create Project
        project = Project(
            id=project_id,
            name=f"{body.workspace_name} Project",
            description=f"Default project for {body.workspace_name}",
            tenant_id=tenant_id,
            created_at=now,
            updated_at=now,
        )
        project.is_default = True  # type: ignore
        db.add(project)

        # 5. Create SupabaseUserMetadata
        metadata = SupabaseUserMetadata(
            user_id=user_id,
            tenant_id=tenant_id,
            tenant_slug=slug,
            role="owner",
            created_at=now,
            updated_at=now,
        )
        db.add(metadata)

        db.commit()
        logger.info(f"[Supabase] Provisioned tenant '{slug}' (id={tenant_id}) for user {user_id}")

        return ProvisionTenantResponse(
            success=True,
            tenant_id=tenant_id,
            tenant_slug=slug,
            project_id=project_id,
            message="Tenant provisioned successfully",
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[Supabase] Tenant provisioning failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to provision tenant")
    finally:
        db.close()


@router.get("/provision-status")
async def get_provision_status(request: Request):
    """Check if the authenticated user has a provisioned tenant.

    Returns tenant info if provisioned, null otherwise.
    """
    if not is_cloud():
        raise HTTPException(
            status_code=400,
            detail="Cloud mode only"
        )

    from app.auth.provider import get_auth_provider
    provider = get_auth_provider()
    if not provider or provider.provider_name != "supabase":
        raise HTTPException(
            status_code=400,
            detail="Supabase provider not configured"
        )

    user_id = await provider.get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication")

    db = SessionLocal()
    try:
        metadata = db.query(SupabaseUserMetadata).filter(
            SupabaseUserMetadata.user_id == user_id
        ).first()

        if not metadata or not metadata.tenant_id:
            return {"provisioned": False, "tenant": None}

        tenant = db.query(Tenant).filter(Tenant.id == metadata.tenant_id).first()
        if not tenant:
            return {"provisioned": False, "tenant": None}

        return {
            "provisioned": True,
            "tenant": {
                "id": tenant.id,
                "slug": tenant.slug,
                "name": tenant.name,
                "role": metadata.role,
            }
        }
    finally:
        db.close()
