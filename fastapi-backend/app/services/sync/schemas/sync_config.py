"""Pydantic schemas for SyncConfig API."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

from app.services.sync.models.sync_config import ConflictStrategy


class FieldMappingBase(BaseModel):
    """Base schema for field mapping."""
    master_column: str = Field(..., min_length=1, max_length=255)
    slave_column: str = Field(..., min_length=1, max_length=255)
    transform: Optional[str] = None
    is_key_field: bool = False
    skip_sync: bool = False


class FieldMappingCreate(FieldMappingBase):
    """Schema for creating a field mapping."""
    pass


class FieldMappingResponse(FieldMappingBase):
    """Schema for field mapping response."""
    id: str
    sync_config_id: str
    
    class Config:
        from_attributes = True


class SyncConfigBase(BaseModel):
    """Base schema for sync config."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    
    master_datasource_id: str
    slave_datasource_id: str
    
    master_table: str = Field(..., min_length=1, max_length=255)
    slave_table: str = Field(..., min_length=1, max_length=255)
    
    master_view_id: Optional[str] = None
    slave_view_id: Optional[str] = None
    
    master_pk_column: str = Field(default="id", max_length=255)
    slave_pk_column: str = Field(default="id", max_length=255)
    
    conflict_strategy: ConflictStrategy = ConflictStrategy.SOURCE_WINS
    webhook_url: Optional[str] = None
    
    sync_deletes: bool = False
    batch_size: int = Field(default=100, ge=1, le=10000)
    cron_schedule: Optional[str] = None


class SyncConfigCreate(SyncConfigBase):
    """Schema for creating a sync config."""
    field_mappings: List[FieldMappingCreate] = []


class SyncConfigUpdate(BaseModel):
    """Schema for updating a sync config."""
    name: Optional[str] = None
    description: Optional[str] = None
    master_table: Optional[str] = None
    slave_table: Optional[str] = None
    master_pk_column: Optional[str] = None
    slave_pk_column: Optional[str] = None
    conflict_strategy: Optional[ConflictStrategy] = None
    webhook_url: Optional[str] = None
    sync_deletes: Optional[bool] = None
    batch_size: Optional[int] = None
    cron_schedule: Optional[str] = None
    is_active: Optional[bool] = None
    master_view_id: Optional[str] = None
    slave_view_id: Optional[str] = None
    field_mappings: Optional[List[FieldMappingCreate]] = None


class SyncConfigResponse(SyncConfigBase):
    """Schema for sync config response."""
    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_sync_at: Optional[datetime] = None
    field_mappings: List[FieldMappingResponse] = []
    
    class Config:
        from_attributes = True
