"""DB-Sync domain models — SyncConfig, FieldMapping, SyncJob, Conflict, DatasourceView, TableSchemaCache."""

from sqlalchemy import Column, String, Text, Boolean, Integer, ForeignKey
from sqlalchemy.orm import relationship

from ..database.config import Base


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
