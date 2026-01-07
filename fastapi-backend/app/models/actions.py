"""
SQLAlchemy Models for Actions/Automations

Stores workflow drafts and published versions.
"""

from sqlalchemy import Column, String, Text, Boolean, Integer, DateTime, JSON
from sqlalchemy.sql import func
from ..database.config import Base
import uuid


def generate_uuid():
    return str(uuid.uuid4())


class AutomationDraft(Base):
    """Workflow drafts being designed in the builder"""
    __tablename__ = "automation_drafts"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Trigger configuration
    trigger_type = Column(String(50), nullable=False, default="manual")
    trigger_config = Column(JSON, nullable=True)
    
    # Workflow graph (stored as JSON)
    nodes = Column(JSON, nullable=False, default=list)
    edges = Column(JSON, nullable=False, default=list)
    
    # Publishing status
    is_published = Column(Boolean, default=False)
    published_version = Column(Integer, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(String(255), nullable=True)
    
    def __repr__(self):
        return f"<AutomationDraft {self.name} (id={self.id})>"


class AutomationExecution(Base):
    """Execution history for debugging/monitoring in the builder UI"""
    __tablename__ = "automation_executions"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    draft_id = Column(String(36), nullable=True)  # If test execution
    workflow_id = Column(String(36), nullable=True)  # If published execution
    
    status = Column(String(50), nullable=False)  # started, executing, completed, error
    trigger_type = Column(String(50), nullable=False)
    trigger_payload = Column(JSON, nullable=True)
    
    node_executions = Column(JSON, nullable=True)
    result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<AutomationExecution {self.id} status={self.status}>"
