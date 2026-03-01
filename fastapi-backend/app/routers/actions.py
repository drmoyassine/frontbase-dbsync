"""
Actions/Automations Router

Handles CRUD for workflow drafts and publishing to the Actions Runtime.
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import httpx
import json
import logging
import asyncio
import uuid

from app.database.utils import get_db
from app.database.config import SessionLocal
from app.models.actions import AutomationDraft, AutomationExecution
from app.models.models import EdgeEngine
from app.schemas.actions import (
    WorkflowDraftCreate,
    WorkflowDraftUpdate,
    WorkflowDraftResponse,
    WorkflowDraftListResponse,
    PublishRequest,
    PublishResponse,
    TargetToggleRequest,
    TestExecuteRequest,
    TestExecuteResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Edge Engine URL - configurable for production (Docker uses container name 'edge')
# Defaults to localhost:3002 for local development
import os
EDGE_URL = os.getenv("EDGE_URL", "http://localhost:3002")


def _build_deploy_payload(draft: AutomationDraft, name_prefix: str = "", override_is_active: Optional[bool] = None) -> dict:
    """Build the deploy payload for the Edge /api/deploy endpoint."""
    return {
        "id": str(draft.id),
        "name": f"{name_prefix}{draft.name}",
        "description": str(draft.description) if str(draft.description or "") else None,
        "triggerType": str(draft.trigger_type),
        "triggerConfig": draft.trigger_config or {},
        "nodes": draft.nodes,
        "edges": draft.edges,
        "isActive": override_is_active if override_is_active is not None else draft.is_active,
        "publishedBy": str(draft.created_by) if str(draft.created_by or "") else None,
    }


# ============ Draft CRUD ============

@router.get("/drafts", response_model=WorkflowDraftListResponse)
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


@router.post("/drafts", response_model=WorkflowDraftResponse, status_code=status.HTTP_201_CREATED)
async def create_draft(
    draft: WorkflowDraftCreate,
    db: Session = Depends(get_db)
):
    """Create a new workflow draft"""
    # Check for duplicate workflow name
    existing = db.execute(
        select(AutomationDraft).where(AutomationDraft.name == draft.name)
    ).scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A workflow with the name '{draft.name}' already exists"
        )
    
    def safe_dump(obj):
        if hasattr(obj, 'model_dump'):
            return obj.model_dump()
        if hasattr(obj, 'dict'):
            return obj.dict()
        return obj

    db_draft = AutomationDraft(
        name=draft.name,
        description=draft.description,
        trigger_type=draft.trigger_type,
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
    
    # Check for duplicate workflow name (if renaming)
    update_data = update.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] != draft.name:
        existing = db.execute(
            select(AutomationDraft).where(
                AutomationDraft.name == update_data["name"],
                AutomationDraft.id != draft_id
            )
        ).scalar_one_or_none()
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"A workflow with the name '{update_data['name']}' already exists"
            )
    
    # Check for duplicate node names within the workflow
    if "nodes" in update_data:
        node_names = [n.get("name") if isinstance(n, dict) else n.name for n in update_data["nodes"]]
        seen = set()
        for name in node_names:
            if name in seen:
                raise HTTPException(
                    status_code=400,
                    detail=f"Duplicate node name '{name}' in workflow. Each node must have a unique name."
                )
            seen.add(name)
        update_data["nodes"] = [n.model_dump() if hasattr(n, 'model_dump') else n for n in update_data["nodes"]]
    
    if "edges" in update_data:
        update_data["edges"] = [e.model_dump() if hasattr(e, 'model_dump') else e for e in update_data["edges"]]
    
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


class BulkDeleteRequest(BaseModel):
    ids: List[str]


@router.post("/drafts/bulk-delete", status_code=status.HTTP_200_OK)
async def bulk_delete_drafts(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple workflow drafts at once"""
    if not request.ids:
        return {"deleted": 0}
    
    result = db.execute(
        select(AutomationDraft).where(AutomationDraft.id.in_(request.ids))
    )
    drafts = result.scalars().all()
    
    deleted_count = 0
    for draft in drafts:
        db.delete(draft)
        deleted_count += 1
    
    db.commit()
    return {"deleted": deleted_count}


class ToggleActiveRequest(BaseModel):
    is_active: bool


@router.patch("/drafts/{draft_id}/active")
async def toggle_draft_active(
    draft_id: str,
    request: ToggleActiveRequest,
    db: Session = Depends(get_db)
):
    """Toggle a workflow draft's is_active status."""
    draft = db.query(AutomationDraft).filter(AutomationDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    draft.is_active = request.is_active  # type: ignore[assignment]
    db.commit()
    db.refresh(draft)
    return {"id": str(draft.id), "is_active": bool(draft.is_active)}


# ============ Publishing ============

@router.post("/drafts/{draft_id}/publish", response_model=PublishResponse)
async def publish_draft(
    draft_id: str,
    db: Session = Depends(get_db)
):
    """
    Publish a workflow draft to the local Edge Engine.
    Kept for backward compatibility (no engine_id = local dev edge).
    """
    result = db.execute(
        select(AutomationDraft).where(AutomationDraft.id == draft_id)
    )
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    deploy_payload = _build_deploy_payload(draft)
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{EDGE_URL}/api/deploy",
                json=deploy_payload,
                timeout=30.0
            )
            
            if response.status_code != 200:
                error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to deploy to Edge service: {error_detail}"
                )
            
            result_data = response.json()
            
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Edge service is not running. Start it with: cd services/edge && npm run dev"
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Edge service timeout"
        )
    
    # Update draft with published status
    draft.is_published = True  # type: ignore[assignment]
    draft.published_version = result_data.get("version", 1)
    draft.published_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    db.commit()
    
    return PublishResponse(
        success=True,
        message="Workflow published successfully",
        workflow_id=str(draft.id),
        version=result_data.get("version", 1)
    )


@router.post("/drafts/{draft_id}/publish/{engine_id}/", response_model=PublishResponse)
async def publish_draft_to_engine(
    draft_id: str,
    engine_id: str,
    db: Session = Depends(get_db)
):
    """
    Publish a workflow draft to a specific Edge Engine target.
    Mirrors the page publish_to_target() pattern.
    Uses Release-Before-IO (AGENTS.md §4.3).
    """
    # 1. FETCH DATA — fast DB interaction
    result = db.execute(
        select(AutomationDraft).where(AutomationDraft.id == draft_id)
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail=f"Engine not found: {engine_id}")
    
    engine_url = getattr(engine, 'url', None)
    engine_name = getattr(engine, 'name', f'Engine {engine_id}')
    if not engine_url:
        raise HTTPException(status_code=400, detail="Engine URL is missing")
    
    # Force-load attributes before detaching
    deploy_payload = _build_deploy_payload(draft)
    draft_id_str = str(draft.id)
    
    # Release connection before slow I/O
    db.expunge(draft)
    db.close()
    
    # 2. SLOW I/O — no DB connection held
    try:
        async with httpx.AsyncClient() as client:
            # Pre-flight health check
            try:
                health_resp = await client.get(
                    f"{engine_url.rstrip('/')}/api/health",
                    timeout=5.0
                )
                if health_resp.status_code != 200:
                    raise HTTPException(
                        status_code=503,
                        detail=f"Engine '{engine_name}' health check failed: HTTP {health_resp.status_code}"
                    )
            except httpx.ConnectError:
                raise HTTPException(
                    status_code=503,
                    detail=f"Engine '{engine_name}' is unreachable at {engine_url}"
                )
            
            # Deploy workflow
            response = await client.post(
                f"{engine_url.rstrip('/')}/api/deploy",
                json=deploy_payload,
                timeout=30.0
            )
            
            if response.status_code != 200:
                error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to deploy to '{engine_name}': {error_detail}"
                )
            
            result_data = response.json()
            
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"Engine '{engine_name}' timed out"
        )
    
    # 3. UPDATE DB — new connection for post-deploy status update
    update_db = SessionLocal()
    try:
        draft_record = update_db.query(AutomationDraft).filter(
            AutomationDraft.id == draft_id_str
        ).first()
        if draft_record:
            draft_record.is_published = True  # type: ignore[assignment]
            draft_record.published_version = result_data.get("version", 1)
            draft_record.published_at = datetime.now(timezone.utc)  # type: ignore[assignment]
            # Accumulate deployed engine record
            engines = dict(draft_record.deployed_engines or {})
            engines[engine_id] = {
                "name": engine_name,
                "url": engine_url,
                "deployed_at": datetime.now(timezone.utc).isoformat(),
                "is_active": draft_record.is_active  # Inherit global active state on fresh publish
            }
            draft_record.deployed_engines = engines  # type: ignore[assignment]
            update_db.commit()
    finally:
        update_db.close()
    
    return PublishResponse(
        success=True,
        message=f"Workflow published to '{engine_name}'",
        workflow_id=draft_id_str,
        version=result_data.get("version", 1)
    )

@router.post("/drafts/{draft_id}/publish/{engine_id}/toggle")
async def toggle_target_active(
    draft_id: str,
    engine_id: str,
    request: TargetToggleRequest,
    db: Session = Depends(get_db)
):
    """
    Toggle a workflow's active status on a specific target engine by republishing it with the new active state.
    """
    import uuid
    from app.models.engines import EdgeEngine
    from sqlalchemy.orm import Session
    from app.database.config import SessionLocal

    try:
        draft_uuid = uuid.UUID(draft_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid draft ID format")
        
    draft = db.query(AutomationDraft).filter(AutomationDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Workflow draft not found")

    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Deployment target not found")
        
    engine_name = str(engine.name)
    engine_url = str(engine.url)

    # Re-build payload but override isActive
    deploy_payload = _build_deploy_payload(draft, override_is_active=request.is_active)
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{engine_url.rstrip('/')}/api/deploy",
                json=deploy_payload,
                timeout=30.0
            )
            
            if response.status_code != 200:
                error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to update target '{engine_name}': {error_detail}"
                )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"Engine '{engine_name}' timed out"
        )
        
    # UPDATE DB with new is_active state for this engine
    update_db = SessionLocal()
    try:
        draft_record = update_db.query(AutomationDraft).filter(
            AutomationDraft.id == draft_id
        ).first()
        if draft_record:
            engines = dict(draft_record.deployed_engines or {})
            if engine_id in engines:
                engines[engine_id]["is_active"] = request.is_active
            else:
                engines[engine_id] = {
                    "name": engine_name,
                    "url": engine_url,
                    "deployed_at": datetime.now(timezone.utc).isoformat(),
                    "is_active": request.is_active
                }
            draft_record.deployed_engines = engines  # type: ignore[assignment]
            update_db.commit()
    finally:
        update_db.close()
        
    return {"success": True, "message": f"Workflow {'enabled' if request.is_active else 'disabled'} on '{engine_name}'"}


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
    
    # Always deploy before test (ensures latest version is used)
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
            deploy_response = await client.post(
                f"{EDGE_URL}/api/deploy",
                json=deploy_payload,
                timeout=30.0
            )
            if deploy_response.status_code not in [200, 201]:
                error_detail = "Failed to deploy workflow to Edge Engine"
                try:
                    error_json = deploy_response.json()
                    logger.error(f"Deploy error response: {error_json}")
                    # Try multiple fields to extract error message
                    if "details" in error_json:
                        error_detail = f"Deploy failed: {error_json['details']}"
                    elif "message" in error_json:
                        error_detail = f"Deploy failed: {error_json['message']}"
                    elif "error" in error_json:
                        error_detail = f"Deploy failed: {error_json['error']}"
                except Exception as e:
                    logger.error(f"Could not parse error response: {e}")
                raise HTTPException(status_code=502, detail=error_detail)
                
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Edge Engine is not running. Start it with: cd services/edge && npm run dev"
        )
    
    # Trigger execution
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{EDGE_URL}/api/execute/{draft.id}",
                json={"parameters": request.parameters or {}},
                timeout=30.0
            )
            
            if response.status_code not in [200, 201]:
                error_detail = "Workflow execution failed"
                try:
                    error_json = response.json()
                    if "message" in error_json:
                        error_detail = error_json["message"]
                    elif "error" in error_json:
                        error_detail = error_json["error"]
                except Exception:
                    if response.status_code == 404:
                        error_detail = "Workflow not found in Edge Engine. Try deploying first."
                raise HTTPException(
                    status_code=502,
                    detail=error_detail
                )
            
            result_data = response.json()
            
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Edge Engine connection lost during execution"
        )
    
    # Write test execution to backend DB
    execution_id = result_data.get("executionId", str(uuid.uuid4()))
    _save_test_execution(
        execution_id=execution_id,
        draft_id=str(draft.id),
        trigger_type="manual",
        input_params=request.parameters,
    )
    
    return TestExecuteResponse(
        execution_id=execution_id,
        status=result_data.get("status", "started"),
        message=result_data.get("message")
    )


@router.post("/drafts/{draft_id}/test-node/{node_id}", response_model=TestExecuteResponse)
async def test_node(
    draft_id: str,
    node_id: str,
    request: TestExecuteRequest = TestExecuteRequest(),
    db: Session = Depends(get_db)
):
    """
    Test-execute a single node within a workflow draft.
    
    This deploys the draft and executes only the specified node
    (and its upstream dependencies).
    """
    result = db.execute(
        select(AutomationDraft).where(AutomationDraft.id == draft_id)
    )
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    # Deploy before test (ensures latest version is used)
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
            # Deploy first
            deploy_response = await client.post(
                f"{EDGE_URL}/api/deploy",
                json=deploy_payload,
                timeout=30.0
            )
            if deploy_response.status_code not in [200, 201]:
                raise HTTPException(
                    status_code=502,
                    detail="Failed to deploy workflow for node testing"
                )
            
            # Execute single node
            response = await client.post(
                f"{EDGE_URL}/api/execute/{draft.id}/node/{node_id}",
                json={"parameters": request.parameters or {}},
                timeout=30.0
            )
            
            if response.status_code not in [200, 201]:
                error_detail = "Node execution failed"
                try:
                    error_json = response.json()
                    if "message" in error_json:
                        error_detail = error_json["message"]
                except Exception:
                    pass
                raise HTTPException(status_code=502, detail=error_detail)
            
            result_data = response.json()
            
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Edge Engine connection lost during node execution"
        )
    
    # Write test execution to backend DB
    execution_id = result_data.get("executionId", str(uuid.uuid4()))
    _save_test_execution(
        execution_id=execution_id,
        draft_id=str(draft.id),
        trigger_type="node_test",
        input_params={"nodeId": node_id, **(request.parameters or {})},
    )
    
    return TestExecuteResponse(
        execution_id=execution_id,
        status=result_data.get("status", "started"),
        message=result_data.get("message")
    )


# ============ Execution Result ============

@router.get("/execution/{execution_id}")
async def get_execution_result(execution_id: str):
    """Get detailed execution result from Edge Engine"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{EDGE_URL}/api/executions/{execution_id}",
                timeout=10.0
            )
            
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Execution not found")
            
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to get execution from Edge Engine")
            
            return response.json()
            
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Edge Engine is not running"
        )


# ============ Execution Log Writeback ============

def _save_test_execution(
    execution_id: str,
    draft_id: str,
    trigger_type: str,
    input_params: Optional[dict] = None,
):
    """Save a test execution record to the backend DB."""
    db = SessionLocal()
    try:
        record = AutomationExecution(
            id=execution_id,
            draft_id=draft_id,
            status="started",
            trigger_type=trigger_type,
            trigger_payload=input_params,
            started_at=datetime.now(timezone.utc),
        )
        db.add(record)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save test execution: {e}")
        db.rollback()
    finally:
        db.close()


async def _poll_and_update_execution(execution_id: str, max_attempts: int = 30):
    """
    Poll the edge engine for execution result and update the backend DB.
    Called as background task after test execution starts.
    """
    for attempt in range(max_attempts):
        await asyncio.sleep(1)
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{EDGE_URL}/api/executions/{execution_id}",
                    timeout=5.0
                )
                if resp.status_code != 200:
                    continue
                data = resp.json()
                status = data.get("status", "started")
                if status in ("completed", "error"):
                    db = SessionLocal()
                    try:
                        record = db.query(AutomationExecution).filter(
                            AutomationExecution.id == execution_id
                        ).first()
                        if record:
                            record.status = status  # type: ignore[assignment]
                            record.node_executions = data.get("nodeExecutions")  # type: ignore[assignment]
                            record.result = data.get("result")  # type: ignore[assignment]
                            record.error = data.get("error")  # type: ignore[assignment]
                            record.ended_at = datetime.now(timezone.utc)  # type: ignore[assignment]
                            db.commit()
                    finally:
                        db.close()
                    return
        except Exception as e:
            logger.error(f"Poll execution {execution_id} attempt {attempt}: {e}")


# ============ Execution History ============

@router.get("/executions/{draft_id}")
async def get_draft_executions(
    draft_id: str,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """Get execution history for a draft — merges backend test logs + local edge production logs."""
    # 1. Test logs from backend DB
    test_records = db.execute(
        select(AutomationExecution)
        .where(AutomationExecution.draft_id == draft_id)
        .order_by(AutomationExecution.started_at.desc())
        .limit(limit)
    ).scalars().all()
    
    test_logs = []
    for r in test_records:
        test_logs.append({
            "id": str(r.id),
            "workflowId": str(r.draft_id),
            "status": str(r.status),
            "triggerType": str(r.trigger_type),
            "triggerPayload": r.trigger_payload,
            "nodeExecutions": r.node_executions,
            "result": r.result,
            "error": str(r.error) if str(r.error or "") else None,
            "startedAt": r.started_at.isoformat() if r.started_at is not None else None,  # type: ignore[union-attr]
            "endedAt": r.ended_at.isoformat() if r.ended_at is not None else None,  # type: ignore[union-attr]
            "source": "test",
        })
    
    # 2. Production logs from local edge
    edge_logs = []
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{EDGE_URL}/api/executions/workflow/{draft_id}",
                params={"limit": str(limit)},
                timeout=10.0
            )
            if response.status_code == 200:
                data = response.json()
                for e in data.get("executions", []):
                    e["source"] = "local_edge"
                    edge_logs.append(e)
    except httpx.ConnectError:
        pass  # Edge not available, skip production logs
    
    # 3. Merge and sort by startedAt desc
    all_logs = test_logs + edge_logs
    all_logs.sort(key=lambda x: x.get("startedAt", ""), reverse=True)
    
    return {"executions": all_logs[:limit], "total": len(all_logs)}


@router.get("/executions/{draft_id}/production/{engine_id}")
async def get_production_executions(
    draft_id: str,
    engine_id: str,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """Get production execution history from a specific edge engine."""
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail=f"Engine not found: {engine_id}")
    
    engine_url = getattr(engine, 'url', None)
    engine_name = getattr(engine, 'name', f'Engine {engine_id}')
    if not engine_url:
        return {"executions": [], "total": 0, "error": "Engine URL is missing"}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{engine_url.rstrip('/')}/api/executions/workflow/{draft_id}",
                params={"limit": str(limit)},
                timeout=10.0
            )
            if response.status_code == 200:
                data = response.json()
                for e in data.get("executions", []):
                    e["source"] = str(engine_name)
                return data
            return {"executions": [], "total": 0}
    except httpx.ConnectError:
        return {"executions": [], "total": 0, "error": f"Engine '{engine_name}' not reachable"}


@router.get("/execution-stats")
async def get_execution_stats():
    """Get execution run counts for all workflows"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{EDGE_URL}/api/executions/stats",
                timeout=10.0
            )
            
            if response.status_code == 200:
                return response.json()
            return {"stats": []}
            
    except httpx.ConnectError:
        return {"stats": [], "error": "Actions Engine not available"}
