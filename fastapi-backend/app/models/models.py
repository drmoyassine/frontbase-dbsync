from sqlalchemy import Column, String, Text, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
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
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class Page(Base):
    __tablename__ = 'pages'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    title = Column(String(200))
    description = Column(Text)
    keywords = Column(String(500))
    is_public = Column(Boolean, default=False)
    is_homepage = Column(Boolean, default=False)
    layout_data = Column(Text, nullable=False)
    seo_data = Column(Text)
    deleted_at = Column(String)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    @property
    def layout_data_dict(self):
        """Get layout_data as a dictionary"""
        import json
        if self.layout_data:
            return json.loads(self.layout_data)
        return {}
    
    @layout_data_dict.setter
    def layout_data_dict(self, value):
        """Set layout_data from a dictionary"""
        import json
        self.layout_data = json.dumps(value)
    
    @property
    def seo_data_dict(self):
        """Get seo_data as a dictionary"""
        import json
        if self.seo_data:
            return json.loads(self.seo_data)
        return {}
    
    @seo_data_dict.setter
    def seo_data_dict(self, value):
        """Set seo_data from a dictionary"""
        import json
        self.seo_data = json.dumps(value)

class AppVariable(Base):
    __tablename__ = 'app_variables'
    
    id = Column(String, primary_key=True)
    name = Column(String(50), unique=True, nullable=False)
    type = Column(String(20), nullable=False)  # 'variable' or 'calculated'
    value = Column(String)
    formula = Column(String)
    description = Column(Text)
    created_at = Column(String, nullable=False)

# DB-Sync specific models
class SyncConfig(Base):
    __tablename__ = 'sync_configs'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)
    source_datasource_id = Column(String, nullable=False)
    target_datasource_id = Column(String, nullable=False)
    config_data = Column(Text, nullable=False)  # JSON
    sync_frequency = Column(String, default='manual')
    is_active = Column(Boolean, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class FieldMapping(Base):
    __tablename__ = 'field_mappings'
    
    id = Column(String, primary_key=True)
    sync_config_id = Column(String, ForeignKey('sync_configs.id'), nullable=False)
    source_table = Column(String, nullable=False)
    source_field = Column(String, nullable=False)
    target_table = Column(String, nullable=False)
    target_field = Column(String, nullable=False)
    transformation_rules = Column(Text)  # JSON
    data_type = Column(String)
    created_at = Column(String, nullable=False)
    
    # Relationships
    sync_config = relationship("SyncConfig")

class SyncJob(Base):
    __tablename__ = 'sync_jobs'
    
    id = Column(String, primary_key=True)
    sync_config_id = Column(String, ForeignKey('sync_configs.id'), nullable=False)
    status = Column(String, default='pending')  # pending, running, completed, failed
    records_processed = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    error_message = Column(Text)
    started_at = Column(String)
    completed_at = Column(String)
    created_at = Column(String, nullable=False)
    
    # Relationships
    sync_config = relationship("SyncConfig")

class Conflict(Base):
    __tablename__ = 'conflicts'
    
    id = Column(String, primary_key=True)
    sync_job_id = Column(String, ForeignKey('sync_jobs.id'), nullable=False)
    record_id = Column(String, nullable=False)
    conflict_type = Column(String, nullable=False)
    conflict_data = Column(Text, nullable=False)  # JSON
    resolution_status = Column(String, default='pending')  # pending, resolved, ignored
    resolution_data = Column(Text)  # JSON
    created_at = Column(String, nullable=False)
    
    # Relationships
    sync_job = relationship("SyncJob")

class DatasourceView(Base):
    __tablename__ = 'datasource_views'
    
    id = Column(String, primary_key=True)
    datasource_id = Column(String, nullable=False)
    name = Column(String(100), nullable=False)
    view_definition = Column(Text, nullable=False)  # JSON
    is_shared = Column(Boolean, default=False)
    created_by = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class TableSchemaCache(Base):
    __tablename__ = 'table_schema_cache'
    
    id = Column(String, primary_key=True)
    datasource_id = Column(String, nullable=False)
    table_name = Column(String, nullable=False)
    schema_data = Column(Text, nullable=False)  # JSON
    columns = Column(Text)  # JSON - added for caching efficiency
    foreign_keys = Column(Text)  # JSON - added for caching efficiency
    last_updated = Column(String, nullable=False)
    is_valid = Column(Boolean, default=True)


# Import Actions models to register them with Base
from app.models.actions import AutomationDraft, AutomationExecution  # noqa