"""Pydantic schemas for SyncJob API."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.services.sync.models.job import JobStatus


class SyncJobCreate(BaseModel):
    """Schema for creating a sync job."""
    triggered_by: str = "manual"


class SyncJobResponse(BaseModel):
    """Schema for sync job response."""
    id: str
    sync_config_id: str
    status: JobStatus
    
    total_records: int
    processed_records: int
    inserted_records: int
    updated_records: int
    deleted_records: int
    conflict_count: int
    error_count: int
    
    progress_percent: float
    
    error_message: Optional[str] = None
    
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    created_at: datetime
    
    triggered_by: str
    
    class Config:
        from_attributes = True
