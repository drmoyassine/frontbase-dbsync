"""
SQLAlchemy Models for Actions/Automations

Stores workflow drafts and published versions.
"""

from sqlalchemy import Column, String, Text, Boolean, Integer, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
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
    project_id = Column(String, ForeignKey('project.id'), nullable=True)
    
    # Trigger configuration
    trigger_type = Column(String(50), nullable=False, default="manual")
    trigger_config = Column(JSON, nullable=True)
    
    # Workflow graph (stored as JSON)
    nodes = Column(JSON, nullable=False, default=list)
    edges = Column(JSON, nullable=False, default=list)
    
    # Publishing status
    is_published = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    published_version = Column(Integer, nullable=True)
    deployed_engines = Column(JSON, nullable=True, default=dict)  # {engine_id: {name, url, deployed_at, deployed_version_hash}}
    settings = Column(JSON, nullable=True, default=dict)  # Per-workflow config: rate_limit, debounce, timeout, queue options
    content_hash = Column(String(64), nullable=True)  # Hash of nodes+edges+settings for staleness detection
    published_at = Column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(String(255), nullable=True)

    # Relationships
    versions = relationship(
        "AutomationVersion",
        back_populates="automation",
        cascade="all, delete-orphan",
        order_by="AutomationVersion.version_number.desc()"
    )
    
    def __repr__(self):
        return f"<AutomationDraft {self.name} (id={self.id})>"


class AutomationExecution(Base):
    """Execution history for debugging/monitoring in the builder UI"""
    __tablename__ = "automation_executions"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    draft_id = Column(String(36), nullable=True)  # If test execution
    workflow_id = Column(String(36), nullable=True)  # If published execution
    project_id = Column(String, ForeignKey('project.id'), nullable=True)
    
    status = Column(String(50), nullable=False)  # started, executing, completed, error
    trigger_type = Column(String(50), nullable=False)
    trigger_payload = Column(JSON, nullable=True)
    
    # Edge target tracking
    engine_id = Column(String(36), nullable=True)   # FK to EdgeEngine (null for test runs)
    engine_name = Column(String(100), nullable=True) # Denormalized: "Test", "Local Edge", etc.
    
    node_executions = Column(JSON, nullable=True)
    result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<AutomationExecution {self.id} status={self.status}>"


class AutomationVersion(Base):
    """Immutable snapshot of an automation draft. Created on save/publish."""
    __tablename__ = "automation_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    automation_id = Column(String(36), ForeignKey('automation_drafts.id', ondelete='CASCADE'), nullable=False)
    version_number = Column(Integer, nullable=False)          # Auto-incremented per workflow
    
    # Snapshot of workflow definition fields
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    trigger_type = Column(String(50), nullable=False)
    trigger_config = Column(JSON, nullable=True)
    nodes = Column(JSON, nullable=False)
    edges = Column(JSON, nullable=False)
    settings = Column(JSON, nullable=True)
    content_hash = Column(String(64), nullable=True)
    
    # Metadata
    label = Column(String(200), nullable=True)                 # Human label ("v1.0 Release")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(String(255), nullable=True)

    # Relationships
    automation = relationship("AutomationDraft", back_populates="versions")
