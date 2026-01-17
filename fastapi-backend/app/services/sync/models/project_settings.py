"""
Project settings model - stores user-configurable application settings.
"""

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Text, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column
import uuid

from app.services.sync.database import Base


class ProjectSettings(Base):
    """User-configurable project settings stored in SQLite."""
    
    __tablename__ = "project_settings"
    
    id: Mapped[str] = mapped_column(
        String(36), 
        primary_key=True, 
        default=lambda: str(uuid.uuid4())
    )
    
    # Redis Configuration
    redis_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    redis_token: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    redis_type: Mapped[str] = mapped_column(String(32), default="upstash")  # "upstash" | "self-hosted"
    redis_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    cache_ttl_data: Mapped[int] = mapped_column(default=60)  # seconds
    cache_ttl_count: Mapped[int] = mapped_column(default=300)  # seconds
    
    # Metadata
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=lambda: datetime.now(timezone.utc), 
        onupdate=lambda: datetime.now(timezone.utc)
    )
    
    def __repr__(self) -> str:
        return f"<ProjectSettings redis_enabled={self.redis_enabled}>"
