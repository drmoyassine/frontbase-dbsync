"""
Table schema cache model - stores fetched schemas to avoid repeated API calls.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List
from sqlalchemy import String, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
import uuid

from app.services.sync.database import Base


class TableSchemaCache(Base):
    """Cached schema for a table in a datasource."""
    
    __tablename__ = "table_schema_cache"
    
    id: Mapped[str] = mapped_column(
        String(36), 
        primary_key=True, 
        default=lambda: str(uuid.uuid4())
    )
    
    datasource_id: Mapped[str] = mapped_column(
        String(36), 
        ForeignKey("datasources.id", ondelete="CASCADE"),
        nullable=False
    )
    
    table_name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Schema stored as JSON list of column definitions
    columns: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False)
    
    # Foreign keys stored as JSON list
    foreign_keys: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    
    # Timestamp when schema was fetched
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=lambda: datetime.now(timezone.utc)
    )
    
    # Unique constraint: one schema per datasource+table
    __table_args__ = (
        UniqueConstraint('datasource_id', 'table_name', name='uq_datasource_table'),
    )
    
    def __repr__(self) -> str:
        return f"<TableSchemaCache {self.table_name} ({len(self.columns)} columns)>"
