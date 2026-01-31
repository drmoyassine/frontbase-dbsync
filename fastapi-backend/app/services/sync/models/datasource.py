"""
Datasource model - represents a database connection configuration.
"""

from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
import uuid

from app.services.sync.database import Base


class DatasourceType(str, enum.Enum):
    """Supported datasource types."""
    SUPABASE = "supabase"
    POSTGRES = "postgres"
    WORDPRESS = "wordpress"
    WORDPRESS_REST = "wordpress_rest"
    WORDPRESS_GRAPHQL = "wordpress_graphql"
    NEON = "neon"
    MYSQL = "mysql"


class Datasource(Base):
    """Datasource model for storing database connection configurations."""
    
    __tablename__ = "datasources"
    
    id: Mapped[str] = mapped_column(
        String(36), 
        primary_key=True, 
        default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    type: Mapped[DatasourceType] = mapped_column(
        SQLEnum(DatasourceType, native_enum=False, length=50), 
        nullable=False
    )
    
    # Connection details (encrypted in production)
    # Connection details (optional for some types like REST)
    host: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    port: Mapped[Optional[int]] = mapped_column(nullable=True, default=5432)
    database: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    password_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Additional config (JSON string for flexibility)
    extra_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # For Supabase/Neon-specific fields
    api_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Service role key
    anon_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Anon key
    
    # For WordPress
    table_prefix: Mapped[str] = mapped_column(String(50), default="wp_")
    
    # Metadata
    is_active: Mapped[bool] = mapped_column(default=True)
    last_tested_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_test_success: Mapped[Optional[bool]] = mapped_column(nullable=True)
    
    # Note: Use naive datetime for PostgreSQL TIMESTAMP WITHOUT TIME ZONE columns
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow, 
        onupdate=datetime.utcnow
    )
    
    # Relationships
    views: Mapped[List["DatasourceView"]] = relationship(
        "DatasourceView",
        back_populates="datasource",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Datasource {self.name} ({self.type.value})>"
