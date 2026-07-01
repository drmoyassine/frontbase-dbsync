"""Tenant domain models — Tenant, TenantMember.

Cloud-mode only: these tables are created by migration 0043 but only
populated when DEPLOYMENT_MODE=cloud.  In self-host mode the tables
exist (harmless) but remain empty.
"""

from sqlalchemy import Column, String, Text, Integer, ForeignKey, UniqueConstraint
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

    __table_args__ = (
        UniqueConstraint('project_id', 'datasource_id', name='uq_project_datasources_project_id_datasource_id'),
    )


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

    __table_args__ = (
        UniqueConstraint('project_id', 'account_id', name='uq_project_connected_accounts_project_id_account_id'),
    )


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


# ---------------------------------------------------------------------------
# Workspace Agent — per-tenant credit quota (cloud mode only)
#
# These tables back the Workspace Agent credit quota system. Workspace Agent
# turns (backend PydanticAI, cloud mode) draw from a per-tenant credit pool
# driven by the plan's agent_credits_daily / agent_credits_monthly limits.
# Edge Agents are NOT affected — they run on the tenant's own providers.
# See docs/plans/[FEATURE] Multi-Tenant Agent Credit Quota System.md.
# ---------------------------------------------------------------------------

class AgentCreditBalance(Base):
    """Per-tenant Workspace Agent credit balance.

    One row per tenant. ``*_credits_remaining`` are refilled to the plan's limit
    on the daily (UTC midnight) / monthly (1st-of-month UTC) reset by the quota
    service. UNLIMITED (-1) is stored verbatim when the plan grants unlimited
    credits so the check/consume paths can treat it specially without a sentinel.

    ``bonus_*`` accumulate manual grants from the master admin (Usage tab) and
    are added on top of the plan limit at each reset so a grant survives resets.
    """
    __tablename__ = 'agent_credit_balances'

    id = Column(String, primary_key=True)
    tenant_id = Column(String, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, unique=True, index=True)

    # Daily pool (reset at UTC midnight)
    daily_credits_remaining = Column(Integer, nullable=False, default=0)
    daily_credits_last_reset_at = Column(String(50), nullable=True)

    # Monthly pool (reset on the 1st of the month, UTC)
    monthly_credits_remaining = Column(Integer, nullable=False, default=0)
    monthly_credits_last_reset_at = Column(String(50), nullable=True)

    # Manual bonus credits layered on top of the plan limit at reset time
    bonus_daily = Column(Integer, nullable=False, default=0)
    bonus_monthly = Column(Integer, nullable=False, default=0)

    # Lifetime consumption (analytics)
    total_consumed = Column(Integer, nullable=False, default=0)

    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class AgentCreditUsageLog(Base):
    """Per-turn Workspace Agent usage record (analytics + auditing).

    One row per agent turn. ``pool_type`` records which pool the credit was
    drawn from; ``use_type`` records workspace (quota-consuming) vs support
    (free). ``status`` distinguishes success / error / quota_exceeded.
    """
    __tablename__ = 'agent_credit_usage_log'

    id = Column(String, primary_key=True)
    tenant_id = Column(String, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(String, nullable=False)

    pool_type = Column(String(20), nullable=False)    # daily | monthly | unlimited | none
    use_type = Column(String(20), nullable=False)     # workspace | support

    agent_profile = Column(String(50), nullable=True)
    provider_id = Column(String, nullable=True)
    model_id = Column(String(100), nullable=True)

    tokens_input = Column(Integer, nullable=True)
    tokens_output = Column(Integer, nullable=True)
    tool_calls_count = Column(Integer, nullable=False, default=0)
    duration_ms = Column(Integer, nullable=True)

    status = Column(String(20), nullable=False)       # success | error | quota_exceeded
    error_message = Column(Text, nullable=True)

    created_at = Column(String, nullable=False, index=True)
