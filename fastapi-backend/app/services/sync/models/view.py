"""
DatasourceView model - represents a filtered view of a datasource resource.
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy import String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid

from app.services.sync.database import Base


class DatasourceView(Base):
    """A saved filtered view of a datasource table or resource."""
    
    __tablename__ = "datasource_views"
    
    id: Mapped[str] = mapped_column(
        String(36), 
        primary_key=True, 
        default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    datasource_id: Mapped[str] = mapped_column(
        String(36), 
        ForeignKey("datasources.id"),
        nullable=False
    )
    
    # The actual table or resource name (e.g., 'wp_posts' or 'job_listing')
    target_table: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # The filters stored as JSON
    # Format: [{"field": "post_type", "operator": "==", "value": "institution"}]
    filters: Mapped[Dict[str, Any]] = mapped_column(JSON, default=list)
    
    # Field mappings / transformations
    # Format: {"target_field": "{{ source_field }} or @jinja"}
    field_mappings: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    
    # Linked views for cross-source data
    # Format: {"meta": {"view_id": "uuid", "join_on": "id"}}
    linked_views: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    
    # Visible columns configuration
    # Format: ["id", "name", "date"]
    visible_columns: Mapped[list[str]] = mapped_column(JSON, default=list)
    
    # Pinned columns / fields (frozen at the start/top)
    pinned_columns: Mapped[list[str]] = mapped_column(JSON, default=list)
    
    # Custom column / field order
    column_order: Mapped[list[str]] = mapped_column(JSON, default=list)
    
    # Webhooks for event-driven logic
    # Format: [{"url": "...", "event": "...", "method": "..."}]
    webhooks: Mapped[list[Dict[str, Any]]] = mapped_column(JSON, default=list)
    
    # Metadata
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
    datasource: Mapped["Datasource"] = relationship("Datasource", back_populates="views")

    def __repr__(self) -> str:
        return f"<DatasourceView {self.name} on {self.target_table}>"
