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
        if self.layout_data:  # type: ignore[truthy-bool]
            return json.loads(str(self.layout_data))
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
        if self.seo_data:  # type: ignore[truthy-bool]
            return json.loads(str(self.seo_data))
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


class EdgeDatabase(Base):
    """Named edge database connection — credentials for edge deployment targets.
    
    Each row represents a configured edge-compatible database (Turso, Neon, etc.)
    that deployment targets can reference. Replaces the old global Turso settings
    in settings.json.
    """
    __tablename__ = 'edge_databases'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)          # "Production Turso", "Staging Neon"
    provider = Column(String(50), nullable=False)        # "turso", "neon", "planetscale"
    db_url = Column(String(500), nullable=False)         # "libsql://your-db.turso.io"
    db_token = Column(String(1000), nullable=True)       # auth token (encrypted at rest)
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)            # True = pre-seeded, cannot be deleted
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    # Relationship
    edge_engines = relationship("EdgeEngine", back_populates="edge_database")


class EdgeCache(Base):
    """Named edge cache connection — credentials for edge caching providers.
    
    Each row represents a configured edge-compatible cache (Upstash, Redis, etc.)
    that edge engines can reference. Replaces the old global Redis settings
    in settings.json.
    """
    __tablename__ = 'edge_caches'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)          # "Production Upstash", "Staging Redis"
    provider = Column(String(50), nullable=False)        # "upstash", "redis", "dragonfly"
    cache_url = Column(String(500), nullable=False)     # "https://xxx.upstash.io"
    cache_token = Column(String(1000), nullable=True)   # auth token (write-only to frontend)
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)      # System caches are undeletable
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    # Relationship
    edge_engines = relationship("EdgeEngine", back_populates="edge_cache")


class EdgeProviderAccount(Base):
    """Authenticated account for an edge provider (e.g., Cloudflare, Vercel).
    
    Stores credentials required to deploy and manage Edge Engines.
    Provides a ""Data Source"" like connection experience.
    """
    __tablename__ = 'edge_providers_accounts'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)          # "Personal Cloudflare", "My Docker Server"
    provider = Column(String(50), nullable=False)       # "cloudflare", "docker", "vercel", "fastapi"
    provider_credentials = Column(Text, nullable=True)  # JSON — e.g., {"api_token": "...", "account_id": "..."}
    is_active = Column(Boolean, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    # Relationship
    edge_engines = relationship("EdgeEngine", back_populates="edge_provider")


class EdgeEngine(Base):
    """Edge engine deployed instance — a registered edge provider endpoint.
    
    Each row represents a deployment of the Edge Engine (worker/container)
    on a specific provider account (Cloudflare, Vercel, Docker, etc.).
    """
    __tablename__ = 'edge_engines'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)         # "frontbase-edge", "staging-docker"
    edge_provider_id = Column(String, ForeignKey('edge_providers_accounts.id'), nullable=True)
    adapter_type = Column(String(20), nullable=False)   # "edge", "automations", "full"
    url = Column(String(500), nullable=False)           # "https://my-site.pages.dev"
    edge_db_id = Column(String, ForeignKey('edge_databases.id'), nullable=True)
    edge_cache_id = Column(String, ForeignKey('edge_caches.id'), nullable=True)
    engine_config = Column(Text, nullable=True)         # JSON — e.g., {"worker_name": "frontbase-edge"}
    is_active = Column(Boolean, default=True)
    is_system = Column(Boolean, default=False)           # True = pre-seeded, cannot be deleted
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    # Relationships
    edge_database = relationship("EdgeDatabase", back_populates="edge_engines")
    edge_cache = relationship("EdgeCache", back_populates="edge_engines")
    edge_provider = relationship("EdgeProviderAccount", back_populates="edge_engines")


# Import Actions models to register them with Base
from app.models.actions import AutomationDraft, AutomationExecution  # noqa