"""
Tenant Provisioning Protocol

Defines the tenant provisioning workflow for cloud-mode authentication.
This protocol is provider-agnostic and works with both SuperTokens and Supabase.

Tenant Provisioning Flow:
------------------------

1. USER SIGNUP
   ↓
2. AUTH PROVIDER CREATES USER (SuperTokens or Supabase)
   ↓
3. APPLICATION PROVISIONS TENANT RESOURCES:
   - Tenant record (slug, name, plan, owner)
   - TenantMember record (user-role link)
   - Project record (default project)
   - AgentCreditBalance (workspace agent quota)
   ↓
4. USER METADATA UPDATED (tenant claims stored)
   ↓
5. SESSION CREATED (with tenant_id, tenant_slug, role in access token)
   ↓
6. USER CAN ACCESS THEIR WORKSPACE

The provisioning is ATOMIC: all resources created in a single transaction.
Any failure rolls back all changes including the auth provider user.

Provider Differences:
--------------------

SUPERPROVIDERS:
- Stores user metadata in recipe_usermetadata table
- Session tokens include tenant claims in access_token_payload
- Tenant provisioning happens in /api/auth/signup endpoint
- User creation via: supertokens_python.recipe.emailpassword.asyncio.sign_up

SUPABASE:
- Stores user metadata in custom supabase_user_metadata table
- JWT tokens include tenant claims in app_metadata
- Tenant provisioning via /api/auth/provision-tenant endpoint (after Supabase auth)
- User creation happens client-side via Supabase JS SDK
- Backend validates JWT and provisions tenant resources

Shared Models:
--------------
All providers share the same database schema:
- tenants (Tenant)
- tenant_members (TenantMember)
- tenant_invites (TenantInvite)
- project (Project)
- supabase_user_metadata (SupabaseUserMetadata - Supabase only)
- agent_credit_balances (AgentCreditBalance)

Migration Strategy:
--------------------

Phase 1: ABSTRACTION (Current)
- Refactor existing SuperTokens implementation to use AuthProvider interface
- Create SupabaseProvider implementation
- Both providers coexist, selected via AUTH_PROVIDER env var

Phase 2: PARALLEL OPERATION
- Run both providers in parallel for testing
- Use feature flags to route subsets of users to each provider
- Compare metrics and gather feedback

Phase 3: MIGRATION
- Create migration tool to export SuperTokens users
- Import users to Supabase with tenant context preserved
- Update DNS, webhooks, and integrations
- Monitor for issues

Phase 4: CUTOVER
- Switch default provider to Supabase
- Deprecate SuperTokens endpoint
- Remove SuperTokens dependencies after grace period

Security Considerations:
-----------------------

1. JWT Validation
   - Supabase: Verify JWT signature with JWT_SECRET
   - SuperTokens: Verify session via backend recipe
   - Both: Extract tenant claims and validate against database

2. Tenant Isolation
   - All queries scoped by tenant_id
   - TenantContext middleware injects tenant_id into requests
   - Row-level security on shared tables

3. Rate Limiting
   - Signup rate limiting per IP/email
   - Provisioning rate limiting to prevent abuse
   - Lockout after failed attempts

4. Data Integrity
   - All provisioning in database transactions
   - Rollback on any failure
   - Audit logging of all tenant operations

"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from datetime import datetime, UTC
from pydantic import BaseModel
import uuid
import logging

from sqlalchemy.orm import Session as DBSession

logger = logging.getLogger(__name__)


# =============================================================================
# Tenant Provisioning Models
# =============================================================================

class TenantProvisionRequest(BaseModel):
    """Request to provision a new tenant."""
    user_id: str
    email: str
    workspace_name: str
    slug: str
    plan: str = "free"


class TenantProvisionResult(BaseModel):
    """Result of tenant provisioning."""
    success: bool
    tenant_id: Optional[str] = None
    tenant_slug: Optional[str] = None
    project_id: Optional[str] = None
    member_id: Optional[str] = None
    message: str


class TenantAttachRequest(BaseModel):
    """Request to attach a user to an existing tenant (invite accept)."""
    user_id: str
    email: str
    tenant_id: str
    role: str = "editor"
    project_ids: Optional[List[str]] = None


class TenantAttachResult(BaseModel):
    """Result of attaching user to tenant."""
    success: bool
    tenant_id: Optional[str] = None
    tenant_slug: Optional[str] = None
    role: Optional[str] = None
    message: str


# =============================================================================
# Validation Rules
# =============================================================================

import re

RESERVED_SLUGS = frozenset({
    "app", "api", "www", "admin", "auth", "login", "signup",
    "dashboard", "test", "demo", "staging", "dev", "mail",
    "smtp", "ftp", "ns1", "ns2", "cdn", "static", "assets",
    "docs", "help", "support", "status", "blog", "community",
    "account", "billing", "payments", "checkout", "webhook",
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
    from app.models.tenant import Tenant
    existing = db.query(Tenant).filter(Tenant.slug == slug).first()
    return existing is None


# =============================================================================
# Tenant Provisioning Protocol
# =============================================================================

class TenantProvisioner(ABC):
    """Protocol for tenant provisioning operations.

    Each auth provider implements this to handle tenant creation
    in a provider-specific way while maintaining a common interface.
    """

    @abstractmethod
    async def provision_tenant(
        self,
        db: DBSession,
        request: TenantProvisionRequest,
    ) -> TenantProvisionResult:
        """Provision a new tenant with all required resources.

        Creates in a single transaction:
        1. User record (if not exists)
        2. Tenant record
        3. TenantMember (owner role)
        4. Project (default)
        5. AgentCreditBalance
        6. Provider-specific metadata store

        Args:
            db: Database session
            request: Tenant provisioning request

        Returns:
            TenantProvisionResult with created resource IDs

        Raises:
            ValueError: If validation fails
            Exception: If database operation fails
        """
        pass

    @abstractmethod
    async def attach_user_to_tenant(
        self,
        db: DBSession,
        request: TenantAttachRequest,
    ) -> TenantAttachResult:
        """Attach a new user to an existing tenant.

        Used for invite acceptance flow. Creates:
        1. User record (if not exists)
        2. TenantMember
        3. ProjectMember (if project_ids provided)
        4. Provider-specific metadata

        Enforces plan limits before attaching.

        Args:
            db: Database session
            request: Tenant attachment request

        Returns:
            TenantAttachResult with tenant info

        Raises:
            ValueError: If tenant full or validation fails
        """
        pass

    @abstractmethod
    async def store_user_metadata(
        self,
        db: DBSession,
        user_id: str,
        tenant_id: str,
        tenant_slug: str,
        role: str = "owner",
    ) -> None:
        """Store tenant claims in provider-specific metadata store.

        SuperTokens: Uses recipe_usermetadata table
        Supabase: Uses supabase_user_metadata table

        Args:
            db: Database session
            user_id: User ID from auth provider
            tenant_id: Tenant ID
            tenant_slug: Tenant slug
            role: User role in tenant
        """
        pass

    @abstractmethod
    async def get_user_tenant_claims(
        self,
        db: DBSession,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get tenant claims for a user from metadata store.

        Args:
            db: Database session
            user_id: User ID from auth provider

        Returns:
            Dict with tenant_id, tenant_slug, role or None
        """
        pass


# =============================================================================
# Base Implementation (Shared Logic)
# =============================================================================

class BaseTenantProvisioner(TenantProvisioner):
    """Base implementation with shared provisioning logic.

    Handles the database operations that are common across providers.
    Subclasses implement provider-specific metadata storage.
    """

    async def provision_tenant(
        self,
        db: DBSession,
        request: TenantProvisionRequest,
    ) -> TenantProvisionResult:
        """Base implementation of tenant provisioning."""
        from app.models.tenant import Tenant, TenantMember
        from app.models.auth import User
        from app.models.models import Project
        from app.models.tenant import AgentCreditBalance

        slug = request.slug.lower().strip()

        # Validate slug
        slug_error = validate_slug(slug)
        if slug_error:
            return TenantProvisionResult(
                success=False,
                message=slug_error
            )

        # Check uniqueness
        if not check_slug_available(db, slug):
            return TenantProvisionResult(
                success=False,
                message=f"Slug '{slug}' is already taken"
            )

        now = datetime.now(UTC).isoformat()
        tenant_id = str(uuid.uuid4())
        project_id = str(uuid.uuid4())
        member_id = str(uuid.uuid4())

        try:
            # 1. Sync User to public.users
            user = db.query(User).filter(User.id == request.user_id).first()
            if not user:
                user = User(
                    id=request.user_id,
                    username=request.email.split("@")[0] + "_" + request.user_id[:8],
                    email=request.email,
                    password_hash="[managed_by_auth_provider]",
                    created_at=now,
                    updated_at=now,
                )
                db.add(user)

            # 2. Create Tenant
            tenant = Tenant(
                id=tenant_id,
                slug=slug,
                name=request.workspace_name,
                owner_id=request.user_id,
                plan=request.plan,
                status="active",
                created_at=now,
                updated_at=now,
            )
            db.add(tenant)

            # 3. Create TenantMember
            member = TenantMember(
                id=member_id,
                tenant_id=tenant_id,
                user_id=request.user_id,
                role="owner",
                created_at=now,
            )
            db.add(member)

            # 4. Create Project
            project = Project(
                id=project_id,
                name=f"{request.workspace_name} Project",
                description=f"Default project for {request.workspace_name}",
                tenant_id=tenant_id,
                is_default=True,
                created_at=now,
                updated_at=now,
            )
            db.add(project)

            # 5. Create AgentCreditBalance
            credit_balance = AgentCreditBalance(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                daily_credits_remaining=0,
                monthly_credits_remaining=0,
                bonus_daily=0,
                bonus_monthly=0,
                total_consumed=0,
                created_at=now,
                updated_at=now,
            )
            db.add(credit_balance)

            # 6. Store provider-specific metadata
            await self.store_user_metadata(
                db,
                request.user_id,
                tenant_id,
                slug,
                "owner",
            )

            db.commit()
            db.flush()

            logger.info(f"[TenantProvisioner] Provisioned tenant '{slug}' (id={tenant_id}) for user {request.user_id}")

            return TenantProvisionResult(
                success=True,
                tenant_id=tenant_id,
                tenant_slug=slug,
                project_id=project_id,
                member_id=member_id,
                message="Tenant provisioned successfully",
            )

        except Exception as e:
            db.rollback()
            logger.error(f"[TenantProvisioner] Provisioning failed: {e}")
            raise

    async def attach_user_to_tenant(
        self,
        db: DBSession,
        request: TenantAttachRequest,
    ) -> TenantAttachResult:
        """Base implementation of user attachment."""
        from app.models.tenant import Tenant, TenantMember
        from app.models.auth import User
        from app.models.models import ProjectMember
        from app.services.plan_limits import get_plan, plan_limits, UNLIMITED

        tenant = db.query(Tenant).filter(Tenant.id == request.tenant_id).first()
        if not tenant:
            return TenantAttachResult(
                success=False,
                message="Tenant not found"
            )

        # Enforce team_members limit
        member_count = db.query(TenantMember).filter(
            TenantMember.tenant_id == request.tenant_id
        ).count()
        limit = plan_limits(get_plan(db, str(tenant.plan))).get("team_members", 1)
        if isinstance(limit, int) and limit != UNLIMITED and member_count >= limit:
            return TenantAttachResult(
                success=False,
                message="This workspace has reached its team-member limit"
            )

        now = datetime.now(UTC).isoformat()

        try:
            # 1. Sync user
            user = db.query(User).filter(User.id == request.user_id).first()
            if not user:
                user = User(
                    id=request.user_id,
                    username=request.email.split("@")[0] + "_" + request.user_id[:8],
                    email=request.email,
                    password_hash="[managed_by_auth_provider]",
                    created_at=now,
                    updated_at=now,
                )
                db.add(user)

            # 2. Create TenantMember
            member = TenantMember(
                id=str(uuid.uuid4()),
                tenant_id=request.tenant_id,
                user_id=request.user_id,
                role=request.role,
                created_at=now,
            )
            db.add(member)

            # 3. Create ProjectMember for non-owners/admins
            if request.role not in ("owner", "admin") and request.project_ids:
                for pid in request.project_ids:
                    pm = ProjectMember(
                        id=str(uuid.uuid4()),
                        tenant_id=request.tenant_id,
                        project_id=str(pid),
                        user_id=request.user_id,
                        role=request.role,
                        created_at=now,
                    )
                    db.add(pm)

            # 4. Store provider-specific metadata
            await self.store_user_metadata(
                db,
                request.user_id,
                request.tenant_id,
                tenant.slug,
                request.role,
            )

            db.commit()
            db.flush()

            logger.info(f"[TenantProvisioner] Attached user {request.user_id} to tenant {request.tenant_id} as {request.role}")

            return TenantAttachResult(
                success=True,
                tenant_id=request.tenant_id,
                tenant_slug=tenant.slug,
                role=request.role,
                message="Joined workspace successfully",
            )

        except Exception as e:
            db.rollback()
            logger.error(f"[TenantProvisioner] Attachment failed: {e}")
            raise


# =============================================================================
# Provisioning Service (Unified Interface)
# =============================================================================

class TenantProvisioningService:
    """Service for tenant provisioning operations.

    Routes requests to the appropriate provider-specific provisioner.
    """

    @staticmethod
    async def provision_tenant(
        db: DBSession,
        user_id: str,
        email: str,
        workspace_name: str,
        slug: str,
        plan: str = "free",
    ) -> TenantProvisionResult:
        """Provision a new tenant using the configured provider.

        This is the main entry point for tenant provisioning.
        Automatically routes to the correct provider implementation.

        Args:
            db: Database session
            user_id: User ID from auth provider
            email: User's email
            workspace_name: Display name for tenant
            slug: URL slug for tenant
            plan: Plan type (free, pro, enterprise)

        Returns:
            TenantProvisionResult with created resource IDs
        """
        from app.auth.provider import get_auth_provider

        request = TenantProvisionRequest(
            user_id=user_id,
            email=email,
            workspace_name=workspace_name,
            slug=slug,
            plan=plan,
        )

        provider = get_auth_provider()
        if not provider:
            raise ValueError("No auth provider configured")

        # Get provider-specific provisioner
        if provider.provider_type == "supabase":
            from app.auth.providers.supabase import SupabaseTenantProvisioner
            provisioner = SupabaseTenantProvisioner()
        else:  # supertokens
            from app.auth.providers.supertokens import SuperTokensTenantProvisioner
            provisioner = SuperTokensTenantProvisioner()

        return await provisioner.provision_tenant(db, request)

    @staticmethod
    async def attach_user_to_tenant(
        db: DBSession,
        user_id: str,
        email: str,
        tenant_id: str,
        role: str = "editor",
        project_ids: Optional[List[str]] = None,
    ) -> TenantAttachResult:
        """Attach a user to an existing tenant.

        Used for invite acceptance flow.

        Args:
            db: Database session
            user_id: User ID from auth provider
            email: User's email
            tenant_id: Target tenant ID
            role: Role to assign
            project_ids: Optional project access list

        Returns:
            TenantAttachResult with tenant info
        """
        from app.auth.provider import get_auth_provider

        request = TenantAttachRequest(
            user_id=user_id,
            email=email,
            tenant_id=tenant_id,
            role=role,
            project_ids=project_ids,
        )

        provider = get_auth_provider()
        if not provider:
            raise ValueError("No auth provider configured")

        # Get provider-specific provisioner
        if provider.provider_type == "supabase":
            from app.auth.providers.supabase import SupabaseTenantProvisioner
            provisioner = SupabaseTenantProvisioner()
        else:  # supertokens
            from app.auth.providers.supertokens import SuperTokensTenantProvisioner
            provisioner = SuperTokensTenantProvisioner()

        return await provisioner.attach_user_to_tenant(db, request)
