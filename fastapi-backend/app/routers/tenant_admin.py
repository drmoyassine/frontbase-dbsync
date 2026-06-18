"""
Tenant Admin Router — Master admin endpoints for tenant management.

Registered only in cloud mode.  All endpoints require master admin
authentication (ADMIN_EMAIL cookie session).
"""

import uuid
import hashlib
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database.utils import get_db
from app.models.models import Tenant, TenantMember, User, Project, Page, AutomationDraft, AutomationExecution
from app.routers.auth import get_current_user, ADMIN_USERS


router = APIRouter()


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------

def require_master_admin(request: Request) -> dict:
    """Dependency — ensures only the master admin can call these endpoints."""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    # Master admin is anyone in the env-var ADMIN_USERS dict
    if user["email"] not in ADMIN_USERS:
        raise HTTPException(status_code=403, detail="Master admin required")
    return user


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateTenantRequest(BaseModel):
    slug: str          # "acme" → acme.frontbase.dev
    name: str          # Display name
    plan: str = "free" # free | pro | enterprise

class CreateTenantUserRequest(BaseModel):
    email: EmailStr
    password: str
    username: Optional[str] = None
    role: str = "owner"  # owner | admin | editor | viewer
    override_limit: bool = False  # master may deliberately exceed the tenant's team_members cap

class UpdateTenantRequest(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    status: Optional[str] = None

class ActiveResources(BaseModel):
    pages: int
    workflows: int
    app_users: int

class UsageStats(BaseModel):
    executions_current: int
    executions_limit: int
    executions_percentage: float

class TenantResponse(BaseModel):
    id: str
    slug: str
    name: str
    plan: str
    status: str
    member_count: int
    created_at: str
    owner_last_login_at: Optional[str] = None
    owner_email: Optional[str] = None
    project_count: int = 1
    active_resources: Optional[ActiveResources] = None
    usage_stats: Optional[UsageStats] = None

class TenantDetailResponse(TenantResponse):
    members: List[dict]
    project_id: Optional[str]


import logging
logger = logging.getLogger(__name__)

from app.services.plan_limits import get_plan, plan_limits


def _executions_limit_for(db: Session, plan_slug: Optional[str]) -> int:
    """Resolve the monthly shared-worker execution limit for a plan slug.

    Only managed/shared tiers meter runtime (it's Frontbase's infra); BYO tiers
    resolve to UNLIMITED (-1), which the usage bar renders as ∞.
    """
    return int(plan_limits(get_plan(db, plan_slug)).get("shared_worker_executions_monthly", -1))


def _usage_stats(executions_current: int, executions_limit: int) -> "UsageStats":
    pct = min(100.0, (executions_current / executions_limit) * 100.0) if executions_limit > 0 else 0.0
    return UsageStats(
        executions_current=executions_current,
        executions_limit=executions_limit,
        executions_percentage=pct,
    )

async def get_tenant_supabase_user_count(db: Session, tenant_id: str) -> int:
    """Fetch the number of users registered in the tenant's Supabase connection."""
    from app.models.models import Project, EdgeProviderAccount
    from app.core.security import decrypt_credentials
    from app.database.utils import decrypt_data
    import httpx
    import json
    
    project = db.query(Project).filter(Project.tenant_id == tenant_id).first()
    if not project:
        return 0
        
    url = None
    service_key = None
    
    # 1. Try connected accounts first
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.provider == "supabase",
        EdgeProviderAccount.project_id == project.id,
        EdgeProviderAccount.is_active == True
    ).first()
    
    if provider:
        try:
            metadata = json.loads(str(provider.provider_metadata or "{}"))
            creds = decrypt_credentials(str(provider.provider_credentials or "{}"))
            url = metadata.get("api_url")
            service_key = creds.get("service_role_key")
        except Exception:
            pass
            
    # 2. Fallback to project legacy settings
    if not url or not service_key:
        proj_url = str(project.supabase_url) if project.supabase_url is not None else ""
        proj_key_enc = str(project.supabase_service_key_encrypted) if project.supabase_service_key_encrypted is not None else ""
        if proj_url:
            url = proj_url
            if proj_key_enc:
                try:
                    decrypted = decrypt_data(proj_key_enc)
                    if decrypted and decrypted != proj_key_enc:
                        service_key = decrypted
                except Exception:
                    pass
                    
    if not url or not service_key:
        return 0
        
    # Call Supabase Auth Admin API to get user count
    try:
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}"
        }
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{url}/auth/v1/admin/users", headers=headers)
            if res.status_code == 200:
                users = res.json()
                if isinstance(users, list):
                    return len(users)
                elif isinstance(users, dict) and "users" in users:
                    return len(users["users"])
    except Exception as e:
        logger.warning(f"[Tenant Stats] Failed to fetch Supabase user count for tenant {tenant_id}: {e}")
        
    return 0

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/")
async def list_tenants(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """List all tenants with member counts."""
    tenants = db.query(Tenant).all()
    result = []
    for t in tenants:
        member_count = db.query(TenantMember).filter(
            TenantMember.tenant_id == t.id
        ).count()
        
        # Resolve owner details
        owner_id = str(t.owner_id) if t.owner_id is not None else None
        owner_last_login_at = None
        owner_email = None
        if owner_id and owner_id != "pending":
            owner = db.query(User).filter(User.id == owner_id).first()
            if owner:
                if owner.last_login_at is not None:
                    owner_last_login_at = str(owner.last_login_at)
                owner_email = str(owner.email)

        # Resolve projects count
        project_count = db.query(Project).filter(Project.tenant_id == t.id).count()

        # Resolve active resources
        pages_count = db.query(Page).join(Project).filter(Project.tenant_id == t.id).count()
        workflows_count = db.query(AutomationDraft).join(Project).filter(Project.tenant_id == t.id).count()
        app_users_count = await get_tenant_supabase_user_count(db, str(t.id))
        
        active_resources = ActiveResources(
            pages=pages_count,
            workflows=workflows_count,
            app_users=app_users_count
        )
        
        # Resolve usage stats (current month executions vs plan limits)
        from datetime import datetime, timezone
        now_dt = datetime.now(timezone.utc)
        start_of_month = datetime(now_dt.year, now_dt.month, 1, tzinfo=timezone.utc)
        executions_current = db.query(AutomationExecution).join(Project).filter(
            Project.tenant_id == t.id,
            AutomationExecution.started_at >= start_of_month
        ).count()

        plan = str(t.plan).lower() if getattr(t, 'plan', None) is not None else "free"
        usage_stats = _usage_stats(executions_current, _executions_limit_for(db, plan))

        result.append(TenantResponse(
            id=str(t.id),
            slug=str(t.slug),
            name=str(t.name),
            plan=str(t.plan) if getattr(t, 'plan', None) is not None else "free",
            status=str(t.status) if getattr(t, 'status', None) is not None else "active",
            member_count=member_count,
            created_at=str(t.created_at),
            owner_last_login_at=owner_last_login_at,
            owner_email=owner_email,
            project_count=project_count,
            active_resources=active_resources,
            usage_stats=usage_stats,
        ))
    return {"tenants": [r.model_dump() for r in result]}


@router.get("/{tenant_id}")
async def get_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """Get tenant details with members."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    members = db.query(TenantMember).filter(
        TenantMember.tenant_id == tenant_id
    ).all()

    member_list = []
    for m in members:
        user = db.query(User).filter(User.id == m.user_id).first()
        member_list.append({
            "id": str(m.id),
            "user_id": str(m.user_id),
            "email": str(user.email) if user else "unknown",
            "role": str(m.role),
            "created_at": str(m.created_at),
        })

    # Find project and stats
    project = db.query(Project).filter(
        Project.tenant_id == tenant_id
    ).first()

    owner_id = str(tenant.owner_id) if tenant.owner_id is not None else None
    owner_last_login_at = None
    owner_email = None
    if owner_id and owner_id != "pending":
        owner = db.query(User).filter(User.id == owner_id).first()
        if owner:
            if owner.last_login_at is not None:
                owner_last_login_at = str(owner.last_login_at)
            owner_email = str(owner.email)

    project_count = db.query(Project).filter(Project.tenant_id == tenant_id).count()

    # Resolve active resources
    pages_count = db.query(Page).join(Project).filter(Project.tenant_id == tenant_id).count()
    workflows_count = db.query(AutomationDraft).join(Project).filter(Project.tenant_id == tenant_id).count()
    app_users_count = await get_tenant_supabase_user_count(db, tenant_id)
    
    active_resources = ActiveResources(
        pages=pages_count,
        workflows=workflows_count,
        app_users=app_users_count
    )
    
    # Resolve usage stats (current month executions vs plan limits)
    from datetime import datetime, timezone
    now_dt = datetime.now(timezone.utc)
    start_of_month = datetime(now_dt.year, now_dt.month, 1, tzinfo=timezone.utc)
    executions_current = db.query(AutomationExecution).join(Project).filter(
        Project.tenant_id == tenant_id,
        AutomationExecution.started_at >= start_of_month
    ).count()

    plan = str(tenant.plan).lower() if getattr(tenant, 'plan', None) is not None else "free"
    usage_stats = _usage_stats(executions_current, _executions_limit_for(db, plan))

    return {
        "tenant": {
            "id": str(tenant.id),
            "slug": str(tenant.slug),
            "name": str(tenant.name),
            "plan": str(tenant.plan) if getattr(tenant, 'plan', None) is not None else "free",
            "status": str(tenant.status) if getattr(tenant, 'status', None) is not None else "active",
            "member_count": len(member_list),
            "created_at": str(tenant.created_at),
            "members": member_list,
            "project_id": str(project.id) if project else None,
            "owner_last_login_at": owner_last_login_at,
            "owner_email": owner_email,
            "project_count": project_count,
            "active_resources": active_resources.model_dump(),
            "usage_stats": usage_stats.model_dump(),
        }
    }


@router.post("/", status_code=201)
async def create_tenant(
    body: CreateTenantRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """Create a new tenant with auto-provisioned project."""
    # Validate slug
    slug = body.slug.lower().strip()
    if len(slug) < 3 or len(slug) > 50:
        raise HTTPException(status_code=400, detail="Slug must be 3-50 characters")

    import re
    if not re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$', slug):
        raise HTTPException(
            status_code=400,
            detail="Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen"
        )

    # Check uniqueness
    existing = db.query(Tenant).filter(Tenant.slug == slug).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Slug '{slug}' is already taken")

    now = datetime.utcnow().isoformat()
    tenant_id = str(uuid.uuid4())
    project_id = str(uuid.uuid4())

    # Create tenant
    tenant = Tenant(
        id=tenant_id,
        slug=slug,
        name=body.name,
        owner_id="pending",  # Updated when first user is added
        plan=body.plan,
        status="active",
        created_at=now,
        updated_at=now,
    )
    db.add(tenant)

    # Auto-create project for this tenant
    project = Project(
        id=project_id,
        name=f"{body.name} Project",
        description=f"Default project for {body.name}",
        tenant_id=tenant_id,
        created_at=now,
        updated_at=now,
    )
    db.add(project)

    db.commit()

    return {
        "tenant": {
            "id": tenant_id,
            "slug": slug,
            "name": body.name,
            "plan": body.plan,
            "status": "active",
            "project_id": project_id,
        }
    }


@router.post("/{tenant_id}/users", status_code=201)
async def create_tenant_user(
    tenant_id: str,
    body: CreateTenantUserRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """Create a user inside a tenant."""
    # Verify tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Enforce the tenant's team_members cap (F1). This master endpoint is currently
    # the ONLY path that adds a 2nd+ member to a tenant (new-tenant owners are
    # created at signup; there is no tenant self-service "add teammate" yet), so the
    # cap is enforced here rather than bypassed. The master operator may deliberately
    # exceed it with override_limit=true (e.g. a comped seat).
    # NOTE: when a tenant self-service teammate flow is added, also gate it there and
    # at the membership-creation chokepoint (supertokens signup-into-existing-tenant).
    if not body.override_limit:
        from app.services.plan_limits import get_plan, plan_limits, UNLIMITED
        member_count = db.query(TenantMember).filter(
            TenantMember.tenant_id == tenant_id
        ).count()
        team_limit = plan_limits(get_plan(db, str(tenant.plan))).get("team_members", 1)
        if isinstance(team_limit, int) and team_limit != UNLIMITED and member_count >= team_limit:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Tenant '{tenant.slug}' is on plan '{tenant.plan}', which allows "
                    f"{team_limit} team member(s). Upgrade the plan or pass override_limit=true."
                ),
            )

    # Check email uniqueness
    existing_user = db.query(User).filter(User.email == body.email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail=f"User with email '{body.email}' already exists")

    now = datetime.utcnow().isoformat()
    user_id = str(uuid.uuid4())
    member_id = str(uuid.uuid4())

    # Create user
    password_hash = hashlib.sha256(body.password.encode()).hexdigest()
    # Note: tenant linkage is via the TenantMember row below, not User
    # (the User model has no tenant_id column — mirrors provision_tenant).
    user = User(
        id=user_id,
        username=body.username or body.email.split("@")[0],
        email=body.email,
        password_hash=password_hash,
        created_at=now,
        updated_at=now,
    )
    db.add(user)

    # Create membership
    member = TenantMember(
        id=member_id,
        tenant_id=tenant_id,
        user_id=user_id,
        role=body.role,
        created_at=now,
    )
    db.add(member)

    # Update tenant owner if this is the first owner
    if body.role == "owner" and str(tenant.owner_id) == "pending":
        tenant.owner_id = user_id  # type: ignore[assignment]
        tenant.updated_at = now  # type: ignore[assignment]

    db.commit()

    return {
        "user": {
            "id": user_id,
            "email": body.email,
            "username": body.username or body.email.split("@")[0],
            "tenant_id": tenant_id,
            "role": body.role,
        }
    }


@router.put("/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    body: UpdateTenantRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """Update a tenant's plan, status, or name."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
        
    now = datetime.utcnow().isoformat()
    if body.name is not None:
        tenant.name = body.name  # type: ignore[assignment]
    if body.plan is not None:
        tenant.plan = body.plan  # type: ignore[assignment]
    if body.status is not None:
        tenant.status = body.status  # type: ignore[assignment]
        
    tenant.updated_at = now  # type: ignore[assignment]
    db.commit()
    
    return {"success": True, "tenant": {
        "id": str(tenant.id),
        "name": str(tenant.name),
        "plan": str(tenant.plan),
        "status": str(tenant.status),
    }}


@router.delete("/{tenant_id}")

async def delete_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_master_admin),
):
    """Soft-delete a tenant (set status to 'suspended')."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant.status = "suspended"  # type: ignore[assignment]
    tenant.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()

    return {"success": True, "message": f"Tenant '{tenant.slug}' suspended"}
