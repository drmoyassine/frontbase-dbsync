"""
Sync job model - tracks async sync job execution.
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, Integer, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
import enum
import uuid

from app.services.sync.database import Base


class JobStatus(str, enum.Enum):
    """Sync job status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SyncJob(Base):
    """Sync job execution record."""
    
    __tablename__ = "sync_jobs"
    
    id: Mapped[str] = mapped_column(
        String(36), 
        primary_key=True, 
        default=lambda: str(uuid.uuid4())
    )
    sync_config_id: Mapped[str] = mapped_column(
        String(36), 
        ForeignKey("sync_configs.id"),
        nullable=False
    )
    
    # Job status
    status: Mapped[JobStatus] = mapped_column(
        SQLEnum(JobStatus, native_enum=False, length=30),
        default=JobStatus.PENDING
    )
    
    # Progress tracking
    total_records: Mapped[int] = mapped_column(Integer, default=0)
    processed_records: Mapped[int] = mapped_column(Integer, default=0)
    inserted_records: Mapped[int] = mapped_column(Integer, default=0)
    updated_records: Mapped[int] = mapped_column(Integer, default=0)
    deleted_records: Mapped[int] = mapped_column(Integer, default=0)
    conflict_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Error details
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    
    # Timing
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Trigger source
    triggered_by: Mapped[str] = mapped_column(String(50), default="manual")  # manual, schedule, webhook
    
    def __repr__(self) -> str:
        return f"<SyncJob {self.id[:8]} ({self.status.value})>"
    
    @property
    def progress_percent(self) -> float:
        """Calculate progress percentage."""
        if self.total_records == 0:
            return 0.0
        return (self.processed_records / self.total_records) * 100
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """Calculate job duration in seconds."""
        if not self.started_at:
            return None
        end_time = self.completed_at or datetime.utcnow()
        return (end_time - self.started_at).total_seconds()
