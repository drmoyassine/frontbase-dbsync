"""Pydantic schemas for Conflict API."""

from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

from app.services.sync.models.conflict import ConflictStatus


class ConflictResponse(BaseModel):
    """Schema for conflict response."""
    id: str
    sync_config_id: str
    job_id: str
    record_key: str
    
    master_data: Dict[str, Any]
    slave_data: Dict[str, Any]
    conflicting_fields: List[str]
    
    status: ConflictStatus
    resolved_data: Optional[Dict[str, Any]] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    
    created_at: datetime
    
    class Config:
        from_attributes = True


class ConflictResolve(BaseModel):
    """Schema for resolving a conflict."""
    resolution: str  # "master", "slave", "merge", "skip"
    merged_data: Optional[Dict[str, Any]] = None
    resolved_by: Optional[str] = None
    notes: Optional[str] = None
