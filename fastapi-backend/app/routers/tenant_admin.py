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
from app.models.models import Tenant, TenantMember, User, Project
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

class TenantResponse(BaseModel):
    id: str
    slug: str
    name: str
    plan: str
    status: str
    member_count: int
    created_at: str

class TenantDetailResponse(TenantResponse):
    members: List[dict]
    project_id: Optional[str]


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
        result.append(TenantResponse(
            id=str(t.id),
            slug=str(t.slug),
            name=str(t.name),
            plan=str(t.plan) if getattr(t, 'plan', None) is not None else "free",
            status=str(t.status) if getattr(t, 'status', None) is not None else "active",
            member_count=member_count,
            created_at=str(t.created_at),
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

    # Find project
    project = db.query(Project).filter(
        Project.tenant_id == tenant_id
    ).first()

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

    # Check email uniqueness
    existing_user = db.query(User).filter(User.email == body.email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail=f"User with email '{body.email}' already exists")

    now = datetime.utcnow().isoformat()
    user_id = str(uuid.uuid4())
    member_id = str(uuid.uuid4())

    # Create user
    password_hash = hashlib.sha256(body.password.encode()).hexdigest()
    user = User(
        id=user_id,
        username=body.username or body.email.split("@")[0],
        email=body.email,
        password_hash=password_hash,
        tenant_id=tenant_id,
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
