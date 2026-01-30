"""
Sync configuration model - defines how data syncs between master and slave.
"""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
import uuid

from app.services.sync.database import Base


class ConflictStrategy(str, enum.Enum):
    """Conflict resolution strategies."""
    SOURCE_WINS = "source_wins"      # Master data overwrites slave
    TARGET_WINS = "target_wins"      # Keep slave data, ignore master changes
    MANUAL = "manual"                # Store for admin review
    MERGE = "merge"                  # Combine non-conflicting fields
    WEBHOOK = "webhook"              # Call external URL for resolution


class SyncConfig(Base):
    """Sync configuration between master and slave datasources."""
    
    __tablename__ = "sync_configs"
    
    id: Mapped[str] = mapped_column(
        String(36), 
        primary_key=True, 
        default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Master/Slave relationship
    master_datasource_id: Mapped[str] = mapped_column(
        String(36), 
        ForeignKey("datasources.id"),
        nullable=False
    )
    slave_datasource_id: Mapped[str] = mapped_column(
        String(36), 
        ForeignKey("datasources.id"),
        nullable=False
    )
    
    # Optional Views (if null, sync uses master_table/slave_table directly)
    master_view_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("datasource_views.id"),
        nullable=True
    )
    slave_view_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("datasource_views.id"),
        nullable=True
    )
    
    # Table specifications
    master_table: Mapped[str] = mapped_column(String(255), nullable=False)
    slave_table: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Primary key column for record matching
    master_pk_column: Mapped[str] = mapped_column(String(255), default="id")
    slave_pk_column: Mapped[str] = mapped_column(String(255), default="id")
    
    # Conflict resolution
    conflict_strategy: Mapped[ConflictStrategy] = mapped_column(
        SQLEnum(ConflictStrategy, native_enum=False, length=30),
        default=ConflictStrategy.SOURCE_WINS
    )
    webhook_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    
    # Sync settings
    is_active: Mapped[bool] = mapped_column(default=True)
    sync_deletes: Mapped[bool] = mapped_column(default=False)  # Sync deletions?
    batch_size: Mapped[int] = mapped_column(default=100)
    
    # Scheduling (null = manual only)
    cron_schedule: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow, 
        onupdate=datetime.utcnow
    )
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Relationships
    field_mappings: Mapped[List["FieldMapping"]] = relationship(
        "FieldMapping",
        back_populates="sync_config",
        cascade="all, delete-orphan"
    )
    
    master_view: Mapped[Optional["DatasourceView"]] = relationship(
        "DatasourceView",
        foreign_keys=[master_view_id]
    )
    slave_view: Mapped[Optional["DatasourceView"]] = relationship(
        "DatasourceView",
        foreign_keys=[slave_view_id]
    )
    
    def __repr__(self) -> str:
        return f"<SyncConfig {self.name}>"


class FieldMapping(Base):
    """Field mapping between master and slave columns."""
    
    __tablename__ = "field_mappings"
    
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
    
    # Column mapping
    master_column: Mapped[str] = mapped_column(String(255), nullable=False)
    slave_column: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Type handling
    transform: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Optional transformation expression
    
    # Is this the key field for matching records?
    is_key_field: Mapped[bool] = mapped_column(default=False)
    
    # Skip this field during sync (read-only mapping for display)
    skip_sync: Mapped[bool] = mapped_column(default=False)
    
    # Relationship
    sync_config: Mapped["SyncConfig"] = relationship(
        "SyncConfig",
        back_populates="field_mappings"
    )
    
    def __repr__(self) -> str:
        return f"<FieldMapping {self.master_column} -> {self.slave_column}>"
