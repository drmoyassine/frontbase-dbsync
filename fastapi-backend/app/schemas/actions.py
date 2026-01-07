"""
Pydantic Schemas for Actions/Automations

These schemas define the contract for workflow drafts and publishing.
They mirror the Zod schemas in the Hono service for consistency.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime
import uuid


class TriggerType(str, Enum):
    """Workflow trigger types"""
    MANUAL = "manual"
    WEBHOOK = "http_webhook"
    SCHEDULED = "scheduled"
    DATA_CHANGE = "data_change"


class ExecutionStatus(str, Enum):
    """Workflow execution statuses"""
    STARTED = "started"
    EXECUTING = "executing"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"


# ============ Node Types ============

class NodePosition(BaseModel):
    """Position of a node on the canvas"""
    x: float
    y: float


class Parameter(BaseModel):
    """Node parameter definition"""
    name: str
    type: str
    value: Optional[Any] = None
    description: Optional[str] = None
    required: Optional[bool] = False


class WorkflowNode(BaseModel):
    """A single node in the workflow graph"""
    id: str
    name: str
    type: str
    position: NodePosition
    inputs: List[Parameter] = Field(default_factory=list)
    outputs: List[Parameter] = Field(default_factory=list)
    error: Optional[str] = None


class WorkflowEdge(BaseModel):
    """Connection between two nodes"""
    source: str
    target: str
    sourceOutput: str
    targetInput: str


# ============ Workflow Drafts ============

class WorkflowDraftBase(BaseModel):
    """Base fields for workflow drafts"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    trigger_type: TriggerType = TriggerType.MANUAL
    trigger_config: Optional[Dict[str, Any]] = None
    nodes: List[WorkflowNode] = Field(default_factory=list)
    edges: List[WorkflowEdge] = Field(default_factory=list)


class WorkflowDraftCreate(WorkflowDraftBase):
    """Schema for creating a new workflow draft"""
    pass


class WorkflowDraftUpdate(BaseModel):
    """Schema for updating an existing workflow draft (partial)"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    trigger_type: Optional[TriggerType] = None
    trigger_config: Optional[Dict[str, Any]] = None
    nodes: Optional[List[WorkflowNode]] = None
    edges: Optional[List[WorkflowEdge]] = None


class WorkflowDraftResponse(WorkflowDraftBase):
    """Response schema for workflow drafts"""
    id: str
    is_published: bool = False
    published_version: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    
    class Config:
        from_attributes = True


class WorkflowDraftListResponse(BaseModel):
    """Response for listing workflow drafts"""
    drafts: List[WorkflowDraftResponse]
    total: int


# ============ Publishing ============

class PublishRequest(BaseModel):
    """Request to publish a workflow draft"""
    draft_id: str


class PublishResponse(BaseModel):
    """Response from publishing a workflow"""
    success: bool
    message: str
    workflow_id: str
    version: int


# ============ Test Execution ============

class TestExecuteRequest(BaseModel):
    """Request to test-execute a workflow draft"""
    parameters: Optional[Dict[str, Any]] = None


class TestExecuteResponse(BaseModel):
    """Response from test execution"""
    execution_id: str
    status: ExecutionStatus
    message: Optional[str] = None
