"""Auth & settings domain models — User, UserSession, UserSetting, Project, AppVariable."""

from sqlalchemy import Column, String, Text, Boolean, ForeignKey, Integer
from sqlalchemy.orm import relationship

from ..database.config import Base


class User(Base):
    __tablename__ = 'users'
    
    id = Column(String, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
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
    created_at = Column(String, nullable=False)
