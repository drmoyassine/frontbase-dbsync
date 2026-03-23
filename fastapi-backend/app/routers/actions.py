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
from app.services.edge_client import get_edge_headers
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


def _compute_content_hash(draft: AutomationDraft) -> str:
    """Compute a deterministic hash of the workflow content for staleness detection."""
    import hashlib
    content = json.dumps({
        "nodes": draft.nodes or [],
        "edges": draft.edges or [],
        "settings": draft.settings or {},
        "trigger_config": draft.trigger_config or {},
        "trigger_type": str(draft.trigger_type or "manual"),
        "name": str(draft.name or ""),
    }, sort_keys=True, default=str)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def _build_deploy_payload(draft: AutomationDraft, name_prefix: str = "", override_is_active: Optional[bool] = None) -> dict:
    """Build the deploy payload for the Edge /api/deploy endpoint."""
    import json
    return {
        "id": str(draft.id),
        "name": f"{name_prefix}{draft.name}",
        "description": str(draft.description) if str(draft.description or "") else None,
        "triggerType": str(draft.trigger_type),
        "triggerConfig": draft.trigger_config or {},
        "nodes": draft.nodes,
        "edges": draft.edges,
        "settings": json.dumps(draft.settings) if draft.settings else None,  # type: ignore[truthy-bool]
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
    
    # Recompute content hash for staleness detection
    draft.content_hash = _compute_content_hash(draft)  # type: ignore[assignment]
    
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
    
    # Pre-flight: check if workflow settings require infrastructure the engine doesn't have
    wf_settings = draft.settings if isinstance(draft.settings, dict) else {}
    needs_queue = wf_settings.get('queue_enabled') or wf_settings.get('dlq_enabled')
    engine_queue_id = getattr(engine, 'edge_queue_id', None)
    if needs_queue and not engine_queue_id:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Workflow uses queue features (Durable Execution / DLQ) but engine "
                f"'{engine_name}' has no Queue provider configured. "
                f"Configure a Queue in Settings → Edge Engines → Reconfigure."
            )
        )
    
    # Force-load attributes before detaching
    deploy_payload = _build_deploy_payload(draft)
    draft_id_str = str(draft.id)
    
    # Release connection before slow I/O
    db.expunge(draft)
    db.close()
    
    # 2. SLOW I/O — no DB connection held
    try:
        async with httpx.AsyncClient() as client:
            # Get auth headers for this engine
            auth_headers = get_edge_headers(engine)
            
            # Pre-flight health check
            try:
                health_resp = await client.get(
                    f"{engine_url.rstrip('/')}/api/health",
                    headers=auth_headers,
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
                headers=auth_headers,
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
            engines: dict = dict(draft_record.deployed_engines or {})  # type: ignore[arg-type]
            engines[engine_id] = {
                "name": engine_name,
                "url": engine_url,
                "deployed_at": datetime.now(timezone.utc).isoformat(),
                "is_active": bool(draft_record.is_active),  # Inherit global active state on fresh publish
                "deployed_version_hash": str(draft_record.content_hash or ""),
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

class WorkflowBatchPublishRequest(BaseModel):
    engine_ids: List[str]


@router.post("/drafts/{draft_id}/publish-batch/")
async def publish_draft_batch(
    draft_id: str,
    request: WorkflowBatchPublishRequest,
    db: Session = Depends(get_db)
):
    """
    Batch-publish a workflow draft to multiple Edge Engines.
    Builds the deploy payload ONCE, fans out to all engines in parallel.
    """
    from sqlalchemy.orm.attributes import flag_modified

    draft = db.query(AutomationDraft).filter(AutomationDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    # Recompute content hash before publishing
    draft.content_hash = _compute_content_hash(draft)  # type: ignore[assignment]
    db.commit()
    db.refresh(draft)

    # Resolve engines
    engines = db.query(EdgeEngine).filter(EdgeEngine.id.in_(request.engine_ids)).all()
    if not engines:
        raise HTTPException(status_code=404, detail="No engines found")

    engine_map = {str(e.id): e for e in engines}

    # Build deploy payload ONCE
    deploy_payload = _build_deploy_payload(draft)
    draft_id_str = str(draft.id)
    content_hash = str(draft.content_hash or "")
    is_active_global = bool(draft.is_active)

    # Release connection before slow I/O
    db.expunge(draft)
    for e in engines:
        db.expunge(e)
    db.close()

    # Fan out to all engines in parallel
    async def _deploy_to_engine(engine: EdgeEngine):
        engine_url = str(getattr(engine, 'url', ''))
        engine_name = str(getattr(engine, 'name', f'Engine {engine.id}'))
        engine_id = str(engine.id)
        if not engine_url:
            return {"engineId": engine_id, "name": engine_name, "success": False, "error": "No URL"}

        # Pre-flight: check queue requirement
        wf_settings = deploy_payload.get('settings') or '{}'
        try:
            parsed_settings = json.loads(wf_settings) if isinstance(wf_settings, str) else wf_settings
        except Exception:
            parsed_settings = {}
        needs_queue = parsed_settings.get('queue_enabled') or parsed_settings.get('dlq_enabled')
        engine_queue_id = getattr(engine, 'edge_queue_id', None)
        if needs_queue and not engine_queue_id:
            return {"engineId": engine_id, "name": engine_name, "success": False,
                    "error": f"Engine '{engine_name}' has no Queue provider configured"}

        try:
            async with httpx.AsyncClient() as client:
                batch_auth = get_edge_headers(engine)
                resp = await client.post(
                    f"{engine_url.rstrip('/')}/api/deploy",
                    json=deploy_payload,
                    headers=batch_auth,
                    timeout=30.0
                )
                if resp.status_code != 200:
                    return {"engineId": engine_id, "name": engine_name, "success": False,
                            "error": f"HTTP {resp.status_code}"}
                return {"engineId": engine_id, "name": engine_name, "success": True,
                        "version": resp.json().get("version", 1)}
        except Exception as exc:
            return {"engineId": engine_id, "name": engine_name, "success": False, "error": str(exc)}

    results = await asyncio.gather(*[_deploy_to_engine(engine_map[eid]) for eid in request.engine_ids if eid in engine_map])

    # Update DB with deployment records
    update_db = SessionLocal()
    try:
        draft_record = update_db.query(AutomationDraft).filter(AutomationDraft.id == draft_id_str).first()
        if draft_record:
            deployed: dict = dict(draft_record.deployed_engines or {})  # type: ignore[arg-type]
            for r in results:
                if r["success"]:
                    deployed[r["engineId"]] = {
                        "name": r["name"],
                        "url": str(getattr(engine_map.get(r["engineId"]), 'url', '')),
                        "deployed_at": datetime.now(timezone.utc).isoformat(),
                        "is_active": bool(is_active_global),
                        "deployed_version_hash": content_hash,
                    }
            draft_record.deployed_engines = deployed  # type: ignore[assignment]
            flag_modified(draft_record, "deployed_engines")
            draft_record.is_published = True  # type: ignore[assignment]
            draft_record.published_at = datetime.now(timezone.utc)  # type: ignore[assignment]
            update_db.commit()
    finally:
        update_db.close()

    succeeded = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]
    return {
        "success": len(failed) == 0,
        "message": f"Published to {len(succeeded)}/{len(results)} engine(s)",
        "results": results,
    }


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
    from app.models.models import EdgeEngine
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
            toggle_auth = get_edge_headers(engine)
            response = await client.post(
                f"{engine_url.rstrip('/')}/api/deploy",
                json=deploy_payload,
                headers=toggle_auth,
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
    from sqlalchemy.orm.attributes import flag_modified
    engines: dict = dict(draft.deployed_engines or {})  # type: ignore[arg-type]
    if engine_id in engines:
        engines[engine_id]["is_active"] = request.is_active
    else:
        engines[engine_id] = {
            "name": engine_name,
            "url": engine_url,
            "deployed_at": datetime.now(timezone.utc).isoformat(),
            "is_active": request.is_active
        }
    draft.deployed_engines = engines  # type: ignore[assignment]
    flag_modified(draft, "deployed_engines")
    db.commit()
        
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
            engine_name="Test",
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


def _serialize_execution(r):
    """Shared serializer for AutomationExecution records."""
    return {
        "id": str(r.id),
        "workflowId": str(r.draft_id or r.workflow_id or ""),
        "status": str(r.status),
        "triggerType": str(r.trigger_type),
        "triggerPayload": r.trigger_payload,
        "nodeExecutions": r.node_executions,
        "result": r.result,
        "error": str(r.error) if str(r.error or "") else None,
        "engineId": r.engine_id,
        "engineName": r.engine_name or "Test",
        "startedAt": r.started_at.isoformat() if r.started_at is not None else None,
        "endedAt": r.ended_at.isoformat() if r.ended_at is not None else None,
    }


# ── Execution Log: Edge Fan-Out + Redis Cache ────────────────────────────────

EXEC_CACHE_TTL = 1200  # 20 minutes

async def _collect_edge_urls(db: Session) -> dict:
    """Gather unique edge URLs from the EdgeEngine registry table.
    Returns {url: engine_name} mapping — only engines that have
    workflows deployed to them (matching deployed_engines keys)."""
    # Get all engine IDs that have at least one workflow deployed
    drafts = db.execute(
        select(AutomationDraft).where(AutomationDraft.deployed_engines.isnot(None))
    ).scalars().all()

    deployed_engine_ids = set()
    for draft in drafts:
        engines = draft.deployed_engines or {}
        deployed_engine_ids.update(engines.keys())

    if not deployed_engine_ids:
        return {}

    # Fetch the canonical URLs from the EdgeEngine table
    all_engines = db.execute(select(EdgeEngine)).scalars().all()
    edge_map = {}
    for engine in all_engines:
        if str(engine.id) in deployed_engine_ids:
            url = str(engine.url).rstrip("/")
            if url:
                edge_map[url] = engine.name
    return edge_map


async def _fetch_from_edge(client: httpx.AsyncClient, url: str, engine_name: str, params: dict) -> list:
    """Fetch executions from a single edge engine."""
    try:
        resp = await client.get(f"{url}/api/executions/all", params=params, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            executions = data.get("executions", [])
            for e in executions:
                e["engineName"] = engine_name
                e["engineUrl"] = url
            return executions
    except Exception as exc:
        logging.warning(f"[Exec-Log] Failed to reach edge '{engine_name}' ({url}): {exc}")
    return []


async def _pull_from_edges(db: Session, params: dict) -> list:
    """Fan out to all edges with deployed workflows and collect executions."""
    edge_map = await _collect_edge_urls(db)
    if not edge_map:
        return []

    async with httpx.AsyncClient() as client:
        tasks = [
            _fetch_from_edge(client, url, name, params)
            for url, name in edge_map.items()
        ]
        results = await asyncio.gather(*tasks)

    all_executions = []
    for batch in results:
        all_executions.extend(batch)

    # Sort merged results by startedAt descending
    all_executions.sort(key=lambda e: e.get("startedAt", ""), reverse=True)
    return all_executions


@router.get("/executions")
async def list_all_executions(
    limit: int = 100,
    status: Optional[str] = None,
    engine_name: Optional[str] = None,
    trigger_type: Optional[str] = None,
    fresh: bool = False,
    db: Session = Depends(get_db),
):
    """Global execution log — pulls from all edges with deployed workflows.
    Caches in Redis for 20 minutes. Pass ?fresh=true to bypass cache."""
    from app.services.sync.redis_client import cache_get, cache_set, get_configured_redis_settings

    # Build cache key from filters
    cache_key = f"exec_log:{limit}:{status}:{engine_name}:{trigger_type}"

    # L2: Redis Cache Check (unless fresh=true)
    redis_settings = await get_configured_redis_settings()
    redis_url = redis_settings.get("url") if redis_settings and redis_settings.get("enabled") else None

    if not fresh and redis_url:
        cached = await cache_get(redis_url, cache_key)
        if cached:
            logging.info(f"[Exec-Log] L2 Redis cache hit: {cache_key}")
            return cached

    # Pull from edges
    edge_params = {"limit": str(limit)}
    if status:
        edge_params["status"] = status
    edge_executions = await _pull_from_edges(db, edge_params)

    # Also get test runs from PostgreSQL
    test_query = (
        select(AutomationExecution)
        .order_by(AutomationExecution.started_at.desc())
        .limit(limit)
    )
    if status:
        test_query = test_query.where(AutomationExecution.status == status)
    if trigger_type:
        test_query = test_query.where(AutomationExecution.trigger_type == trigger_type)
    test_records = db.execute(test_query).scalars().all()

    # Resolve workflow names
    all_draft_ids = set()
    for e in edge_executions:
        wf_id = e.get("workflowId", "")
        if wf_id:
            all_draft_ids.add(wf_id)
    for r in test_records:
        if str(r.draft_id or ""):
            all_draft_ids.add(str(r.draft_id))

    drafts_map = {}
    if all_draft_ids:
        drafts = db.execute(
            select(AutomationDraft.id, AutomationDraft.name)
            .where(AutomationDraft.id.in_(list(all_draft_ids)))
        ).all()
        drafts_map = {str(d.id): d.name for d in drafts}

    # Enrich edge executions with workflow names
    for e in edge_executions:
        e["workflowName"] = drafts_map.get(e.get("workflowId", ""), "Unknown")

    # Serialize test runs
    test_executions = []
    for r in test_records:
        data = _serialize_execution(r)
        data["workflowName"] = drafts_map.get(str(r.draft_id), "Unknown")
        test_executions.append(data)

    # Merge and sort by startedAt
    all_executions = edge_executions + test_executions
    all_executions.sort(key=lambda e: e.get("startedAt", ""), reverse=True)

    # Apply engine_name filter post-merge
    if engine_name:
        all_executions = [e for e in all_executions if e.get("engineName") == engine_name]

    all_executions = all_executions[:limit]

    result = {"executions": all_executions, "total": len(all_executions)}

    # Cache in Redis
    if redis_url:
        await cache_set(redis_url, cache_key, result, ttl=EXEC_CACHE_TTL)

    return result


# ── Execution Detail (lazy-load on row expand) ────────────────────────────────

@router.get("/executions/detail/{execution_id}")
async def get_execution_detail(execution_id: str, engine_url: Optional[str] = None):
    """Fetch full execution detail (nodeExecutions, triggerPayload) from the
    correct Edge engine.  The global log strips these fields for payload size;
    the frontend calls this endpoint when a user expands a row.

    - engine_url provided → proxy to that remote edge
    - engine_url absent   → fall back to local EDGE_URL
    """
    target_url = engine_url.rstrip("/") if engine_url else EDGE_URL
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{target_url}/api/executions/{execution_id}",
                timeout=10.0,
            )
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Execution not found")
            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Edge returned {response.status_code}",
                )
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Edge engine at {target_url} is not reachable",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"Edge engine at {target_url} timed out",
        )


# ── CSV Export ────────────────────────────────────────────────────────────────

@router.get("/executions/export")
async def export_executions_csv(
    engine_ids: Optional[str] = None,
    workflow_ids: Optional[str] = None,
    statuses: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Export execution logs as CSV. Always pulls fresh from selected edges.
    Also updates the Redis cache with fresh data."""
    from fastapi.responses import StreamingResponse
    from app.services.sync.redis_client import cache_set, get_configured_redis_settings
    import io
    import csv

    # Determine which edges to query
    edge_map = await _collect_edge_urls(db)

    # Filter by engine_ids if specified
    if engine_ids:
        requested_ids = set(engine_ids.split(","))
        # Resolve engine IDs to URLs
        engines = db.execute(
            select(EdgeEngine).where(EdgeEngine.id.in_(list(requested_ids)))
        ).scalars().all()
        allowed_urls = {str(e.url).rstrip("/") for e in engines}
        edge_map = {url: name for url, name in edge_map.items() if url in allowed_urls}

    # Build query params
    params: dict = {"limit": "500"}
    if statuses:
        params["status"] = statuses
    if workflow_ids:
        params["workflowId"] = workflow_ids.split(",")[0]  # Edge filter supports single workflow
    if date_from:
        params["since"] = date_from
    if date_to:
        params["until"] = date_to

    # Pull fresh from edges
    all_executions = []
    async with httpx.AsyncClient() as client:
        tasks = [
            _fetch_from_edge(client, url, name, params)
            for url, name in edge_map.items()
        ]
        results = await asyncio.gather(*tasks)
        for batch in results:
            all_executions.extend(batch)

    # Also get test runs if no engine filter or "Test" is included
    if not engine_ids:
        test_query = select(AutomationExecution).order_by(AutomationExecution.started_at.desc()).limit(500)
        if statuses:
            test_query = test_query.where(AutomationExecution.status.in_(statuses.split(",")))
        test_records = db.execute(test_query).scalars().all()
        for r in test_records:
            data = _serialize_execution(r)
            all_executions.append(data)

    # Filter by workflow_ids post-merge
    if workflow_ids:
        wf_set = set(workflow_ids.split(","))
        all_executions = [e for e in all_executions if e.get("workflowId") in wf_set]

    # Resolve workflow names
    all_draft_ids = {e.get("workflowId", "") for e in all_executions if e.get("workflowId")}
    drafts_map = {}
    if all_draft_ids:
        drafts = db.execute(
            select(AutomationDraft.id, AutomationDraft.name)
            .where(AutomationDraft.id.in_(list(all_draft_ids)))
        ).all()
        drafts_map = {str(d.id): d.name for d in drafts}

    for e in all_executions:
        e["workflowName"] = drafts_map.get(e.get("workflowId", ""), "Unknown")

    # Sort by date
    all_executions.sort(key=lambda e: e.get("startedAt", ""), reverse=True)

    # Also update Redis cache with the fresh data
    redis_settings = await get_configured_redis_settings()
    redis_url = redis_settings.get("url") if redis_settings and redis_settings.get("enabled") else None
    if redis_url:
        cache_key = f"exec_log:100:None:None:None"
        await cache_set(redis_url, cache_key, {
            "executions": all_executions[:100],
            "total": min(len(all_executions), 100),
        }, ttl=EXEC_CACHE_TTL)

    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Execution ID", "Workflow Name", "Workflow ID", "Trigger", "Status",
                      "Edge Name", "Started", "Ended", "Duration (s)", "Error"])
    for e in all_executions:
        started = e.get("startedAt", "")
        ended = e.get("endedAt", "")
        duration = ""
        if started and ended:
            try:
                from dateutil.parser import parse as parse_dt
                dur = (parse_dt(ended) - parse_dt(started)).total_seconds()
                duration = f"{dur:.1f}"
            except Exception:
                pass
        writer.writerow([
            e.get("id", ""),
            e.get("workflowName", "Unknown"),
            e.get("workflowId", ""),
            e.get("triggerType", ""),
            e.get("status", ""),
            e.get("engineName", "Test"),
            started,
            ended,
            duration,
            e.get("error", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=execution_log.csv"},
    )


@router.get("/executions/{draft_id}")
async def get_draft_executions(
    draft_id: str,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """Get execution history for a draft — merges backend test logs + production
    logs from ALL edges where this workflow is deployed (fan-out)."""
    # 1. Test logs from backend DB
    test_records = db.execute(
        select(AutomationExecution)
        .where(AutomationExecution.draft_id == draft_id)
        .order_by(AutomationExecution.started_at.desc())
        .limit(limit)
    ).scalars().all()
    
    test_logs = [_serialize_execution(r) for r in test_records]
    
    # 2. Production logs from ALL deployed edges (fan-out)
    edge_logs: list = []
    draft = db.execute(
        select(AutomationDraft).where(AutomationDraft.id == draft_id)
    ).scalar_one_or_none()

    deployed_engine_ids = set((draft.deployed_engines or {}).keys()) if draft else set()

    if deployed_engine_ids:
        # Resolve canonical URLs from EdgeEngine table
        all_engines = db.execute(select(EdgeEngine)).scalars().all()
        engine_map = {}
        for engine in all_engines:
            if str(engine.id) in deployed_engine_ids:
                url = str(engine.url).rstrip("/")
                if url:
                    engine_map[url] = str(engine.name)

        async def _fetch_workflow_logs(client: httpx.AsyncClient, url: str, name: str):
            try:
                resp = await client.get(
                    f"{url}/api/executions/workflow/{draft_id}",
                    params={"limit": str(limit)},
                    timeout=5.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    executions = data.get("executions", [])
                    for e in executions:
                        e["engineName"] = name
                        e["engineUrl"] = url
                    return executions
            except Exception as exc:
                logging.warning(f"[Draft-Exec] Failed to reach edge '{name}' ({url}): {exc}")
            return []

        if engine_map:
            async with httpx.AsyncClient() as client:
                tasks = [
                    _fetch_workflow_logs(client, url, name)
                    for url, name in engine_map.items()
                ]
                results = await asyncio.gather(*tasks)
                for batch in results:
                    edge_logs.extend(batch)
    
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
