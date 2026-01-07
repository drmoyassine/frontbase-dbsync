"""
Actions/Automations Router

Handles CRUD for workflow drafts and publishing to the Actions Runtime.
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List, Optional
import httpx
import json
import logging

from app.database.utils import get_db
from app.models.actions import AutomationDraft, AutomationExecution
from app.schemas.actions import (
    WorkflowDraftCreate,
    WorkflowDraftUpdate,
    WorkflowDraftResponse,
    WorkflowDraftListResponse,
    PublishRequest,
    PublishResponse,
    TestExecuteRequest,
    TestExecuteResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Actions Engine URL (Hono service)
ACTIONS_ENGINE_URL = "http://localhost:3002"


# ============ Draft CRUD ============

@router.get("/drafts/", response_model=WorkflowDraftListResponse)
async def list_drafts(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """List all workflow drafts"""
    result = db.execute(
        select(AutomationDraft)
        .order_by(AutomationDraft.updated_at.desc())
        .offset(skip)
        .limit(limit)
    )
    drafts = result.scalars().all()
    
    return WorkflowDraftListResponse(
        drafts=[WorkflowDraftResponse.model_validate(d) for d in drafts],
        total=len(drafts)
    )


@router.post("/drafts/", response_model=WorkflowDraftResponse, status_code=status.HTTP_201_CREATED)
async def create_draft(
    draft: WorkflowDraftCreate,
    db: Session = Depends(get_db)
):
    """Create a new workflow draft"""
    def safe_dump(obj):
        if hasattr(obj, 'model_dump'):
            return obj.model_dump()
        if hasattr(obj, 'dict'):
            return obj.dict()
        return obj

    db_draft = AutomationDraft(
        name=draft.name,
        description=draft.description,
        trigger_type=draft.trigger_type.value if hasattr(draft.trigger_type, 'value') else draft.trigger_type,
        trigger_config=draft.trigger_config,
        nodes=[safe_dump(node) for node in draft.nodes],
        edges=[safe_dump(edge) for edge in draft.edges],
    )
    
    db.add(db_draft)
    db.commit()
    db.refresh(db_draft)
    
    return WorkflowDraftResponse.model_validate(db_draft)


@router.get("/drafts/{draft_id}", response_model=WorkflowDraftResponse)
async def get_draft(
    draft_id: str,
    db: Session = Depends(get_db)
):
    """Get a specific workflow draft"""
    result = db.execute(
        select(AutomationDraft).where(AutomationDraft.id == draft_id)
    )
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    return WorkflowDraftResponse.model_validate(draft)


@router.patch("/drafts/{draft_id}", response_model=WorkflowDraftResponse)
async def update_draft(
    draft_id: str,
    update: WorkflowDraftUpdate,
    db: Session = Depends(get_db)
):
    """Update a workflow draft"""
    result = db.execute(
        select(AutomationDraft).where(AutomationDraft.id == draft_id)
    )
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    # Apply updates
    update_data = update.model_dump(exclude_unset=True)
    
    if "nodes" in update_data:
        update_data["nodes"] = [n.model_dump() if hasattr(n, 'model_dump') else n for n in update_data["nodes"]]
    if "edges" in update_data:
        update_data["edges"] = [e.model_dump() if hasattr(e, 'model_dump') else e for e in update_data["edges"]]
    if "trigger_type" in update_data:
        update_data["trigger_type"] = update_data["trigger_type"].value
    
    for key, value in update_data.items():
        setattr(draft, key, value)
    
    db.commit()
    db.refresh(draft)
    
    return WorkflowDraftResponse.model_validate(draft)


@router.delete("/drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_draft(
    draft_id: str,
    db: Session = Depends(get_db)
):
    """Delete a workflow draft"""
    result = db.execute(
        select(AutomationDraft).where(AutomationDraft.id == draft_id)
    )
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    db.delete(draft)
    db.commit()
    return None


# ============ Publishing ============

@router.post("/drafts/{draft_id}/publish", response_model=PublishResponse)
async def publish_draft(
    draft_id: str,
    db: Session = Depends(get_db)
):
    """
    Publish a workflow draft to the Actions Runtime (Hono).
    
    This deploys the workflow so it can be executed via the runtime API.
    """
    result = db.execute(
        select(AutomationDraft).where(AutomationDraft.id == draft_id)
    )
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    # Prepare payload for Hono /deploy endpoint
    # This must match the DeployWorkflowSchema in Hono
    deploy_payload = {
        "id": draft.id,
        "name": draft.name,
        "description": draft.description,
        "triggerType": draft.trigger_type,
        "triggerConfig": draft.trigger_config or {},
        "nodes": draft.nodes,
        "edges": draft.edges,
        "publishedBy": draft.created_by,
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{ACTIONS_ENGINE_URL}/deploy",
                json=deploy_payload,
                timeout=30.0
            )
            
            if response.status_code != 200:
                error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to deploy to Actions Engine: {error_detail}"
                )
            
            result_data = response.json()
            
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Actions Engine is not running. Start it with: cd services/actions && npm run dev"
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Actions Engine timeout"
        )
    
    # Update draft with published status
    draft.is_published = True
    draft.published_version = result_data.get("version", 1)
    
    from datetime import datetime, timezone
    draft.published_at = datetime.now(timezone.utc)
    
    db.commit()
    
    return PublishResponse(
        success=True,
        message="Workflow published successfully",
        workflow_id=draft.id,
        version=result_data.get("version", 1)
    )


# ============ Test Execution ============

@router.post("/drafts/{draft_id}/test", response_model=TestExecuteResponse)
async def test_draft(
    draft_id: str,
    request: TestExecuteRequest,
    db: Session = Depends(get_db)
):
    """
    Test-execute a workflow draft.
    
    This publishes the draft temporarily (if not already published)
    and triggers an execution.
    """
    result = db.execute(
        select(AutomationDraft).where(AutomationDraft.id == draft_id)
    )
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    # If not published, publish first (temporary deploy)
    if not draft.is_published:
        # Deploy temporarily
        deploy_payload = {
            "id": draft.id,
            "name": f"[TEST] {draft.name}",
            "description": draft.description,
            "triggerType": draft.trigger_type,
            "triggerConfig": draft.trigger_config or {},
            "nodes": draft.nodes,
            "edges": draft.edges,
        }
        
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{ACTIONS_ENGINE_URL}/deploy",
                    json=deploy_payload,
                    timeout=30.0
                )
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail="Actions Engine is not running"
            )
    
    # Trigger execution
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{ACTIONS_ENGINE_URL}/execute/{draft.id}",
                json={"parameters": request.parameters or {}},
                timeout=30.0
            )
            
            if response.status_code not in [200, 201]:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Failed to execute workflow"
                )
            
            result_data = response.json()
            
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Actions Engine is not running"
        )
    
    return TestExecuteResponse(
        execution_id=result_data.get("executionId"),
        status=result_data.get("status", "started"),
        message=result_data.get("message")
    )


# ============ Execution History ============

@router.get("/executions/{draft_id}")
async def get_draft_executions(
    draft_id: str,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """Get execution history for a draft from the Actions Engine"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{ACTIONS_ENGINE_URL}/executions/workflow/{draft_id}",
                params={"limit": str(limit)},
                timeout=10.0
            )
            
            if response.status_code == 200:
                return response.json()
            return {"executions": [], "total": 0}
            
    except httpx.ConnectError:
        return {"executions": [], "total": 0, "error": "Actions Engine not available"}
