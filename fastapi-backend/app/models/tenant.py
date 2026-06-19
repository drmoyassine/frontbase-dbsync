"""Tenant domain models — Tenant, TenantMember.

Cloud-mode only: these tables are created by migration 0043 but only
populated when DEPLOYMENT_MODE=cloud.  In self-host mode the tables
exist (harmless) but remain empty.
"""

from sqlalchemy import Column, String, Text, Integer, ForeignKey
from sqlalchemy.orm import relationship

from ..database.config import Base


class Tenant(Base):
    """A billable workspace / organisation.

    In cloud mode every user signs up into a tenant.  The tenant's ``slug``
    becomes the subdomain for published pages (e.g. ``acme.frontbase.dev``).
    """
    __tablename__ = 'tenants'

    id = Column(String, primary_key=True)
    slug = Column(String(50), unique=True, nullable=False)   # "acme" → acme.frontbase.dev
    name = Column(String(100), nullable=False)                # Display name
    owner_id = Column(String, ForeignKey('users.id'), nullable=False)
    plan = Column(String(20), default='free')                 # free | pro | enterprise
    status = Column(String(20), default='active')             # active | suspended | banned
    settings = Column(Text, nullable=True)                    # JSON — branding, limits
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # Relationships
    members = relationship("TenantMember", back_populates="tenant", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="tenant")


class TenantMember(Base):
    """Membership link between a user and a tenant with a role."""
    __tablename__ = 'tenant_members'

    id = Column(String, primary_key=True)
    tenant_id = Column(String, ForeignKey('tenants.id'), nullable=False)
    user_id = Column(String, ForeignKey('users.id'), nullable=False)
    role = Column(String(20), default='owner')   # owner | admin | editor | viewer
    created_at = Column(String, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="members")
    user = relationship("User")


class TenantInvite(Base):
    """A pending invitation for someone to join a tenant as a team member.

    Backs the tenant self-service "invite teammate" flow: an owner/admin creates
    an invite (gated by the plan's ``team_members`` limit), the invitee accepts
    via an emailed token link and is attached to this tenant on signup.
    """
    __tablename__ = 'tenant_invites'

    id = Column(String, primary_key=True)
    tenant_id = Column(String, ForeignKey('tenants.id'), nullable=False)
    email = Column(String(255), nullable=False)
    role = Column(String(20), default='editor')   # admin | editor | viewer (never owner)
    token = Column(String(64), unique=True, nullable=False)
    status = Column(String(20), default='pending')  # pending | accepted | revoked
    invited_by = Column(String, nullable=False)     # user id of inviter
    created_at = Column(String, nullable=False)
    expires_at = Column(String, nullable=False)
    accepted_at = Column(String, nullable=True)
    project_ids = Column(Text, nullable=True)        # JSON — projects granted to the invitee on accept


class ProjectMember(Base):
    """Per-project access + role for a tenant member (multi-project).

    Owners/admins (account role on TenantMember) are implicit members of ALL their
    tenant's projects (no rows needed). ``member`` accounts need an explicit row to
    access a project. ``role`` is the per-project role (admin | editor | viewer).
    """
    __tablename__ = 'project_members'

    id = Column(String, primary_key=True)
    tenant_id = Column(String, ForeignKey('tenants.id'), nullable=False)
    project_id = Column(String, ForeignKey('project.id'), nullable=False)
    user_id = Column(String, ForeignKey('users.id'), nullable=False)
    role = Column(String(20), default='viewer')   # admin | editor | viewer (per-project)
    created_at = Column(String, nullable=False)


class ProjectDatasource(Base):
    """Grant of a tenant-owned datasource to a project (shareable, per-project-capped)."""
    __tablename__ = 'project_datasources'
    id = Column(String, primary_key=True)
    tenant_id = Column(String, nullable=False)
    project_id = Column(String, ForeignKey('project.id'), nullable=False)
    datasource_id = Column(String, nullable=False)
    created_at = Column(String, nullable=False)


class ProjectStorage(Base):
    """Grant of a tenant-owned storage bucket to a project (shareable, per-project-capped)."""
    __tablename__ = 'project_storage'
    id = Column(String, primary_key=True)
    tenant_id = Column(String, nullable=False)
    project_id = Column(String, ForeignKey('project.id'), nullable=False)
    storage_id = Column(String, ForeignKey('storage_providers.id'), nullable=False)
    created_at = Column(String, nullable=False)


class ProjectConnectedAccount(Base):
    """Grant of a tenant-owned connected account to a project (shareable, per-tenant-counted)."""
    __tablename__ = 'project_connected_accounts'
    id = Column(String, primary_key=True)
    tenant_id = Column(String, nullable=False)
    project_id = Column(String, ForeignKey('project.id'), nullable=False)
    account_id = Column(String, ForeignKey('edge_providers_accounts.id'), nullable=False)
    created_at = Column(String, nullable=False)


class TenantAddon(Base):
    """À-la-carte managed-infra entitlement (managed tiers only).

    A managed tier may only PROVISION a managed cache/queue/domain/edge if the
    matching add-on is active here. request→approve today; billing later.
    """
    __tablename__ = 'tenant_addons'
    id = Column(String, primary_key=True)
    tenant_id = Column(String, ForeignKey('tenants.id'), nullable=False)
    addon_type = Column(String(40), nullable=False)   # managed_edge_db | managed_cache | managed_queue | managed_domain
    quantity = Column(Integer, default=1)
    status = Column(String(20), default='pending')    # pending | active | revoked
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
