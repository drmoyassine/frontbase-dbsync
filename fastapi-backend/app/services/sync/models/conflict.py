"""
Conflict model - stores unresolved data conflicts for manual review.
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
import enum
import uuid

from app.services.sync.database import Base


class ConflictStatus(str, enum.Enum):
    """Conflict resolution status."""
    PENDING = "pending"
    RESOLVED_MASTER = "resolved_master"     # Used master value
    RESOLVED_SLAVE = "resolved_slave"       # Used slave value  
    RESOLVED_MERGED = "resolved_merged"     # Custom merged value
    RESOLVED_WEBHOOK = "resolved_webhook"   # Resolved via webhook
    SKIPPED = "skipped"                     # Ignored/skipped


class Conflict(Base):
    """Data conflict requiring resolution."""
    
    __tablename__ = "conflicts"
    
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
    job_id: Mapped[str] = mapped_column(
        String(36), 
        ForeignKey("sync_jobs.id"),
        nullable=False
    )
    
    # Record identification
    record_key: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Conflicting data (JSON)
    master_data: Mapped[str] = mapped_column(Text, nullable=False)  # JSON
    slave_data: Mapped[str] = mapped_column(Text, nullable=False)   # JSON
    
    # Which fields conflict (JSON array)
    conflicting_fields: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array
    
    # Resolution
    status: Mapped[ConflictStatus] = mapped_column(
        SQLEnum(ConflictStatus, native_enum=False, length=30),
        default=ConflictStatus.PENDING
    )
    resolved_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    resolved_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    def __repr__(self) -> str:
        return f"<Conflict {self.record_key} ({self.status.value})>"
