"""Tenant domain models — Tenant, TenantMember.

Cloud-mode only: these tables are created by migration 0043 but only
populated when DEPLOYMENT_MODE=cloud.  In self-host mode the tables
exist (harmless) but remain empty.
"""

from sqlalchemy import Column, String, Text, ForeignKey
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
