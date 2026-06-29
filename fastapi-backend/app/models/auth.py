"""Auth & settings domain models — User, UserSession, UserSetting, Project, AppVariable."""

from sqlalchemy import Column, String, Text, Boolean, ForeignKey, Integer
from sqlalchemy.orm import relationship

from ..database.config import Base


class SupabaseUserMetadata(Base):
    """User metadata for Supabase authentication.

    Stores tenant claims for Supabase-authenticated users.
    Supabase's built-in user_metadata is limited, so we use this table.
    """
    __tablename__ = 'supabase_user_metadata'

    user_id = Column(String, primary_key=True)  # Supabase user ID (sub from JWT)
    tenant_id = Column(String, nullable=True)
    tenant_slug = Column(String, nullable=True)
    role = Column(String(20), default='owner')  # owner | admin | editor | viewer
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class User(Base):
    __tablename__ = 'users'
    
    id = Column(String, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    last_login_at = Column(String, nullable=True)
    reset_token = Column(String, nullable=True)
    reset_token_expires_at = Column(String, nullable=True)
    
    # Relationships
    sessions = relationship("UserSession", back_populates="user")
    settings = relationship("UserSetting", back_populates="user")


class UserSession(Base):
    __tablename__ = 'user_sessions'
    
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey('users.id'), nullable=False)
    session_token = Column(String, unique=True, nullable=False)
    expires_at = Column(String, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="sessions")


class UserSetting(Base):
    __tablename__ = 'user_settings'
    
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey('users.id'), nullable=False)
    supabase_url = Column(String)
    supabase_anon_key = Column(String)
    settings_data = Column(Text)
    
    # Relationships
    user = relationship("User", back_populates="settings")


class Project(Base):
    __tablename__ = 'project'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    app_url = Column(String)  # Public URL for publish/preview
    favicon_url = Column(String)  # Custom favicon URL (uploaded to storage)
    logo_url = Column(String)  # Custom logo URL (uploaded to storage)
    supabase_url = Column(String)
    supabase_anon_key = Column(String)
    supabase_service_key_encrypted = Column(String)
    users_config = Column(Text)
    tenant_id = Column(String, ForeignKey('tenants.id'), nullable=True)  # null = self-host
    # Multi-project (plan-gated): the auto-created "Free" project hosts the community
    # engine; status locks over-cap projects read-only on downgrade. See
    # [FEATURE] multi-project-plan-gated.md.
    is_default = Column(Boolean, default=False)
    status = Column(String(20), default='active')   # active | locked
    created_by = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="projects")
    pages = relationship("Page", back_populates="project")


class AppVariable(Base):
    __tablename__ = 'app_variables'
    
    id = Column(String, primary_key=True)
    name = Column(String(50), unique=True, nullable=False)
    type = Column(String(20), nullable=False)  # 'variable' or 'calculated'
    value = Column(String)
    formula = Column(String)
    description = Column(Text)
    project_id = Column(String, ForeignKey('project.id'), nullable=True)
    created_at = Column(String, nullable=False)


class IPBlocklist(Base):
    __tablename__ = 'ip_blocklist'
    
    id = Column(String, primary_key=True)
    ip_or_range = Column(String(100), nullable=False)
    reason = Column(String(255), nullable=True)
    tenant_id = Column(String(50), nullable=True)
    tenant_slug = Column(String(100), nullable=True)
    created_at = Column(String, nullable=False)


class AuditLog(Base):
    __tablename__ = 'audit_logs'
    
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    action = Column(String(100), nullable=False)
    ip_address = Column(String(50), nullable=True)
    # Post-sprint 2.1: dual-field IP storage for configurable GDPR retention.
    # `ip_address` holds the FULL IP (needed for new-IP login alerts — legitimate
    # interest) only until `ip_full_until`; after that it is purged to NULL by
    # purge_expired_security_ips(). `ip_address_anonymized` (IPv4 /24, IPv6 /48)
    # is retained long-term for analytics/forensics without identifying the user.
    ip_address_anonymized = Column(String(50), nullable=True)
    ip_full_until = Column(String, nullable=True)  # isoformat UTC string, matches created_at style
    user_agent = Column(String(255), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(String, nullable=False)

