"""
Edge Engines API Router — Thin Router.

CRUD endpoints for managing edge engines.
Each target represents an Edge Engine deployment on a specific provider
(Cloudflare Workers, Vercel Edge, Docker, etc.).

All business logic delegated to:
- services/engine_serializer.py (ORM → API dict, drift detection)
- services/engine_provisioner.py (one-click deploy with per-provider hooks)
- services/engine_deploy.py (redeploy)
- services/engine_test.py (connectivity testing, remote delete)
- services/engine_reconfigure.py (live-reconfigure bindings)
- services/engine_manifest.py (manifest sync + GPU model upsert)
- services/provider_registry.py (provider labels, URL builders)
- services/bundle.py (source hashing)
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Literal
from datetime import datetime
import asyncio
import json
import uuid

from ..database.config import get_db
from sqlalchemy.orm import Session
from sqlalchemy import or_
from ..models.models import EdgeEngine, EdgeProviderAccount

from ..middleware.tenant_context import TenantContext, get_tenant_context
from ..database.utils import get_project

from ..schemas.edge_engines import (
    EdgeEngineCreate, EdgeEngineUpdate, EdgeEngineResponse,
    TestConnectionResult, ReconfigureRequest,
    BatchRequest, BatchDeleteRequest, BatchToggleRequest, BatchResult,
    GenericDeployRequest,
)
from ..services import engine_deploy, engine_test, engine_reconfigure
from ..services.engine_manifest import sync_engine_manifest
from ..services.engine_serializer import serialize_engine, get_current_hashes
from ..services.engine_provisioner import provision_and_deploy
from ..services.edge_client import resolve_engine_url

router = APIRouter(prefix="/api/edge-engines", tags=["Edge Engines"])


# =============================================================================
# CRUD Endpoints
# =============================================================================

# --- Static routes MUST come before /{engine_id} routes ---

@router.get("/bundle-hashes/")
async def get_bundle_hashes():
    """Return current source hash for drift detection."""
    return get_current_hashes()


@router.post("/deploy")
async def deploy_engine(payload: GenericDeployRequest, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Provider-agnostic one-click deploy. Delegates to engine_provisioner."""
    return await provision_and_deploy(payload, db)


# =============================================================================
# Batch Operations
# =============================================================================

@router.post("/batch/redeploy", response_model=BatchResult)
async def batch_redeploy_engines(payload: BatchRequest, db: Session = Depends(get_db)):
    """Batch redeploy multiple edge engines.
    
    Uses asyncio.Semaphore(3) to limit concurrent redeploys and avoid provider rate limits.
    """
    result = BatchResult(total=len(payload.engine_ids))
    sem = asyncio.Semaphore(3)

    engines = []
    for eid in payload.engine_ids:
        engine = db.query(EdgeEngine).filter(EdgeEngine.id == eid).first()
        if not engine:
            result.failed.append({"id": eid, "error": "Not found"})
            continue
        engines.append(engine)

    async def _safe_redeploy(eng: EdgeEngine):
        async with sem:
            try:
                await engine_deploy.redeploy(eng, db)
                result.success.append(str(eng.id))
            except Exception as e:
                result.failed.append({"id": str(eng.id), "error": str(e)})

    # Execute with concurrency limit 3
    await asyncio.gather(*[_safe_redeploy(e) for e in engines])
    return result


@router.post("/batch/delete", response_model=BatchResult)
async def batch_delete_engines(
    payload: BatchDeleteRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Batch delete engine records. Optionally delete remote resources."""
    result = BatchResult(total=len(payload.engine_ids))
    
    # Phase 1: Check permissions/existence
    records_to_delete: list[EdgeEngine] = []
    for eid in payload.engine_ids:
        query = db.query(EdgeEngine).filter(EdgeEngine.id == eid)
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                query = query.filter(EdgeEngine.project_id == project.id)
            else:
                query = query.filter(EdgeEngine.id == "not-found")
                
        engine = query.first()
        if not engine:
            result.failed.append({"id": eid, "error": "Not found"})
            continue
        if engine.is_system:  # type: ignore[truthy-bool]
            result.failed.append({"id": eid, "error": "Cannot delete system engine"})
            continue
        records_to_delete.append(engine)

    # Phase 2: Delete remote resources in parallel (all providers)
    if payload.delete_remote:
        async def _safe_delete(eng: EdgeEngine):
            try:
                if str(eng.edge_provider_id or "") and str(eng.edge_provider_id) not in ("None", "null"):
                    await engine_test.delete_remote_resource(eng, db)
            except Exception as e:
                import logging
                logging.error(f"Remote delete failed for {eng.id}: {e} - Proceeding with local DB deletion anyway.")

        await asyncio.gather(*[_safe_delete(eng) for eng in records_to_delete])

    # Phase 3: Delete from DB
    for engine in records_to_delete:
        eid = str(engine.id)
        if any(f.get("id") == eid for f in result.failed):
            continue
        try:
            db.delete(engine)
            result.success.append(eid)
        except Exception as e:
            result.failed.append({"id": eid, "error": str(e)})

    db.commit()
    return result


@router.post("/batch/toggle", response_model=BatchResult)
async def batch_toggle_engines(
    payload: BatchToggleRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Batch activate/deactivate routing."""
    result = BatchResult(total=len(payload.engine_ids))
    for eid in payload.engine_ids:
        query = db.query(EdgeEngine).filter(EdgeEngine.id == eid)
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                query = query.filter(EdgeEngine.project_id == project.id)
            else:
                query = query.filter(EdgeEngine.id == "not-found")
                
        engine = query.first()
        if not engine:
            result.failed.append({"id": eid, "error": "Not found"})
            continue
        engine.is_active = payload.is_active  # type: ignore[assignment]
        engine.updated_at = datetime.utcnow().isoformat() + "Z"  # type: ignore[assignment]
        result.success.append(eid)
    
    db.commit()
    return result


@router.post("/batch/sync-check", response_model=BatchResult)
async def batch_sync_check(
    payload: BatchRequest, 
    db: Session = Depends(get_db), 
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Batch sync-check: verify engines are reachable and update last_synced_at."""
    result = BatchResult(total=len(payload.engine_ids))

    async def _check_engine(engine: EdgeEngine):
        eid = str(engine.id)
        url = resolve_engine_url(engine)
        provider_name = engine.edge_provider.provider if engine.edge_provider else "unknown"
        test_result = await engine_test.test_connection(url, str(provider_name))
        if test_result.success:
            engine.last_synced_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
            engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
            result.success.append(eid)
        else:
            result.failed.append({"id": eid, "error": test_result.message})

    engines = []
    for eid in payload.engine_ids:
        query = db.query(EdgeEngine).filter(EdgeEngine.id == eid)
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                query = query.filter(EdgeEngine.project_id == project.id)
            else:
                query = query.filter(EdgeEngine.id == "not-found")
                
        engine = query.first()
        if not engine:
            result.failed.append({"id": eid, "error": "Not found"})
            continue
        engines.append(engine)

    await asyncio.gather(*[_check_engine(e) for e in engines])
    db.commit()
    return result



@router.get("/", response_model=List[EdgeEngineResponse])
async def list_engines(
    detailed: bool = Query(True, description="If true, fetches live versions concurrently"),
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """List all edge engines with outdated detection."""
    current_hashes = get_current_hashes()    # DB load
    query = db.query(EdgeEngine)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(or_(EdgeEngine.project_id == project.id, EdgeEngine.is_shared == True))  # noqa: E712
        else:
            return []
            
    engines_db = query.order_by(EdgeEngine.created_at.desc()).all()
    
    # Fast path: skip live fetches
    if not detailed:
        return [serialize_engine(e, current_hashes) for e in engines_db]
    
    return [serialize_engine(e, current_hashes) for e in engines_db]


@router.get("/{engine_id}", response_model=EdgeEngineResponse)
async def get_engine(
    engine_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Get standalone engine by ID with live status."""
    current_hashes = get_current_hashes()
    query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(or_(EdgeEngine.project_id == project.id, EdgeEngine.is_shared == True))  # noqa: E712
        else:
            query = query.filter(EdgeEngine.is_shared == True)  # noqa: E712
            
    engine = query.first()
    if not engine:
        raise HTTPException(404, f"Engine '{engine_id}' not found")
    return serialize_engine(engine, current_hashes)


@router.post("/", response_model=EdgeEngineResponse, status_code=201)
async def create_engine(payload: EdgeEngineCreate, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Create a new engine record (manual mode - does not deploy code)."""
    if payload.edge_provider_id:
        provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == payload.edge_provider_id).first()
        if not provider:
            raise HTTPException(status_code=400, detail="Invalid edge_provider_id")

    now = datetime.utcnow().isoformat() + "Z"
    
    project_id = None
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            project_id = project.id

    # Inject system key into engine_config for M2M auth
    from ..services.edge_client import inject_system_key
    raw_config = json.dumps(payload.engine_config) if payload.engine_config else None
    config_with_key = inject_system_key(raw_config)

    engine = EdgeEngine(
        id=str(uuid.uuid4()),
        name=payload.name,
        edge_provider_id=payload.edge_provider_id,
        adapter_type=payload.adapter_type,
        url=payload.url,
        edge_db_id=payload.edge_db_id,
        edge_cache_id=payload.edge_cache_id,
        edge_queue_id=payload.edge_queue_id,
        engine_config=config_with_key,
        is_active=payload.is_active,
        is_imported=payload.is_imported,
        created_at=now,
        updated_at=now,
        project_id=project_id,
    )
    db.add(engine)
    db.commit()
    db.refresh(engine)
    return serialize_engine(engine)


@router.put("/{engine_id}", response_model=EdgeEngineResponse)
async def update_engine(
    engine_id: str,
    payload: EdgeEngineUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Update engine metadata (does not trigger redeploy)."""
    query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(EdgeEngine.project_id == project.id)
        else:
            raise HTTPException(404, f"Engine '{engine_id}' not found")
            
    engine = query.first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    if payload.edge_provider_id:
        provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == payload.edge_provider_id).first()
        if not provider:
            raise HTTPException(status_code=400, detail="Invalid edge_provider_id")

    update_data = payload.model_dump(exclude_unset=True)
    if 'engine_config' in update_data and update_data['engine_config'] is not None:
        update_data['engine_config'] = json.dumps(update_data['engine_config'])
        
    # Check if is_active is toggled
    toggled_is_active = None
    if 'is_active' in update_data and update_data['is_active'] != engine.is_active:
        toggled_is_active = update_data.pop('is_active')

    for key, value in update_data.items():
        setattr(engine, key, value)
        
    engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]

    if toggled_is_active is not None:
        await engine_reconfigure.toggle_engine(engine, toggled_is_active, db)
    else:
        db.commit()
    
    db.refresh(engine)
    return serialize_engine(engine)





# =============================================================================
# Reconfigure
# =============================================================================

@router.post("/{engine_id}/reconfigure")
async def reconfigure_engine(
    engine_id: str, 
    payload: ReconfigureRequest, 
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Live-reconfigure an engine's DB/cache/queue bindings.
    
    Delegates to engine_reconfigure service (CF Settings API PATCH).
    """
    query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(EdgeEngine.project_id == project.id)
        else:
            raise HTTPException(404, f"Engine '{engine_id}' not found")
            
    engine = query.first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    result = await engine_reconfigure.reconfigure(engine, payload, db)
    result["engine"] = serialize_engine(engine)
    return result


# =============================================================================
# Redeploy — delegates to engine_deploy service
# =============================================================================

@router.post("/{engine_id}/redeploy")
async def redeploy_engine(
    engine_id: str, 
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Redeploy an engine with the latest bundle code + current secrets."""
    query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(EdgeEngine.project_id == project.id)
        else:
            raise HTTPException(404, f"Engine '{engine_id}' not found")
            
    engine = query.first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    result = await engine_deploy.redeploy(engine, db)
    result["engine"] = serialize_engine(engine)
    return result


# =============================================================================
# Sync Manifest — read self-describing metadata from a running engine
# =============================================================================

@router.post("/{engine_id}/sync-manifest")
async def sync_manifest(
    engine_id: str, 
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Fetch /api/manifest from a running engine and sync GPU models + metadata.

    Delegates to services/engine_manifest.py.
    Silent on failure — engine might not be a Frontbase engine.
    """
    query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(EdgeEngine.project_id == project.id)
        else:
            raise HTTPException(404, f"Engine '{engine_id}' not found")
            
    engine = query.first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    return await sync_engine_manifest(engine, db)


# =============================================================================
# Delete
# =============================================================================

@router.delete("/{engine_id}")
async def delete_engine(
    engine_id: str,
    delete_remote: bool = Query(False, description="Also delete from provider"),
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Delete an engine record explicitly."""
    query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(EdgeEngine.project_id == project.id)
        else:
            raise HTTPException(404, f"Engine '{engine_id}' not found")
            
    engine = query.first()
    if not engine:
        raise HTTPException(404, f"Engine '{engine_id}' not found")

    if engine.is_system:  # type: ignore[truthy-bool]
        raise HTTPException(status_code=403, detail="Cannot delete a system edge engine")

    # Delete remote resource (works for all providers)
    if delete_remote and str(engine.edge_provider_id or "") and str(engine.edge_provider_id) not in ("None", "null"):
        try:
            await engine_test.delete_remote_resource(engine, db)
        except Exception as e:
            import logging
            logging.error(f"Remote delete failed for {engine.id}: {e} - Proceeding with local DB deletion anyway.")

    db.delete(engine)
    db.commit()


# =============================================================================
# Test Connection — delegates to engine_test service
# =============================================================================

@router.post("/{engine_id}/test", response_model=TestConnectionResult)
async def test_engine_connection(
    engine_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Hit the engine's /_health route to check code version and connection status."""
    query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(EdgeEngine.project_id == project.id)
        else:
            raise HTTPException(404, f"Engine '{engine_id}' not found")
            
    engine = query.first()
    if not engine:
        raise HTTPException(404, f"Engine '{engine_id}' not found")
        
    url = resolve_engine_url(engine)
    provider_name = engine.edge_provider.provider if engine.edge_provider else "unknown"

    return await engine_test.test_connection(str(url), str(provider_name))


# =============================================================================
# Source Snapshot — serves the pre-compilation source tree for the Inspector
# =============================================================================

@router.get("/{engine_id}/source")
async def get_engine_source(
    engine_id: str, 
    db: Session = Depends(get_db), 
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Return the TypeScript source snapshot captured at last deploy.

    Provider-agnostic — works for any engine that has been deployed.
    """
    query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(EdgeEngine.project_id == project.id)
        else:
            raise HTTPException(404, "Engine not found")
            
    engine = query.first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
    if not str(engine.source_snapshot or ""):
        raise HTTPException(
            status_code=404,
            detail="No source snapshot — engine may not have been deployed yet"
        )

    snapshot = json.loads(str(engine.source_snapshot))
    return {
        "success": True,
        "files": snapshot,
        "file_count": len(snapshot),
        "total_size": sum(len(v) for v in snapshot.values()),
    }


from ..services.bundle import write_source_files, CORE_PREFIX


@router.put("/{engine_id}/source")
async def update_engine_source(
    engine_id: str, 
    payload: dict, 
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Save modified source files to the engine's DB snapshot (per-engine isolation).

    Payload: { files: { "relative/path.ts": "content", ... } }
    Only updates the files provided — other snapshot files remain untouched.

    Core Zone Convention:
    - Files under frontbase-core/ are tracked in modified_core_files
    - Files outside frontbase-core/ set is_forked = True
    """
    query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(EdgeEngine.project_id == project.id)
        else:
            raise HTTPException(404, "Engine not found")
            
    engine = query.first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    files = payload.get("files", {})
    if not files:
        raise HTTPException(status_code=400, detail="No files to update")

    # Validate paths: .ts only, no path traversal, no absolute paths
    for path in files:
        if ".." in path or path.startswith("/") or path.startswith("\\"):
            raise HTTPException(status_code=400, detail=f"Invalid file path: {path}")
        if not (path.endswith(".ts") or path.endswith(".tsx") or path.endswith(".md")):
            raise HTTPException(status_code=400, detail=f"Only .ts/.tsx/.md files allowed: {path}")

    # Merge into existing snapshot (DB only — no filesystem writes)
    existing = json.loads(str(engine.source_snapshot)) if str(engine.source_snapshot or "") else {}
    existing.update(files)
    engine.source_snapshot = json.dumps(existing)  # type: ignore[assignment]

    # Track forked state and modified core files
    core_prefix = f"{CORE_PREFIX}/"
    modified_core = []
    has_user_files = False
    for path in files:
        if path.startswith(core_prefix):
            modified_core.append(path)
        elif not path.endswith("README.md"):
            has_user_files = True

    # Update forked flag if user added files outside frontbase-core/
    if has_user_files:
        engine.is_forked = True  # type: ignore[assignment]

    # Merge modified core files list
    existing_modified = json.loads(str(engine.modified_core_files)) if str(engine.modified_core_files or "") else []
    all_modified = list(set(existing_modified + modified_core))
    engine.modified_core_files = json.dumps(all_modified) if all_modified else None  # type: ignore[assignment]

    engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()

    return {
        "success": True,
        "files_saved": len(files),
        "file_count": len(existing),
        "is_forked": bool(engine.is_forked),
        "modified_core_files": all_modified,
    }


# =============================================================================
# Scope Query
# =============================================================================

@router.get("/active/by-scope/{scope}")
async def list_active_engines_by_scope(
    scope: Literal["pages", "automations", "full"], 
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """List active edge engines filtered by adapter scope.
    
    Used by the publish pipeline to determine where to push pages/automations.
    'full' scope targets match both 'pages' and 'automations' queries.
    """
    query = db.query(EdgeEngine).filter(EdgeEngine.is_active == True)  # noqa: E712
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(or_(EdgeEngine.project_id == project.id, EdgeEngine.is_shared == True))  # noqa: E712
        else:
            return []
            
    if scope == "full":
        query = query.filter(EdgeEngine.adapter_type.in_(["full", "pages", "automations"]))
    else:
        query = query.filter(EdgeEngine.adapter_type.in_([scope, "full"]))

    engines = query.all()
    return [
        {
            "id": str(e.id),
            "url": str(e.url),
            "name": str(e.name),
            "adapter_type": str(e.adapter_type),
            "edge_db_id": str(e.edge_db_id) if str(e.edge_db_id or "") else None,
            "is_active": bool(e.is_active),
        }
        for e in engines
    ]


# =============================================================================
# Edge Logs — runtime log fetching, persistence config, batch sync
# =============================================================================

@router.get("/{engine_id}/logs")
async def get_engine_logs(
    engine_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    cursor: str | None = Query(default=None),
    level: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Fetch runtime logs from the engine's provider.

    Returns normalized UnifiedLogEntry objects with cursor pagination.
    Results are cached L1 (60s in-memory) and L2 (5 min Redis).
    """
    from ..services.edge_logs import fetch_logs
    from ..core.credential_resolver import get_provider_context_by_id

    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")
    if not str(engine.edge_provider_id or ""):
        raise HTTPException(status_code=400, detail="Engine has no linked provider account")

    ctx = get_provider_context_by_id(db, str(engine.edge_provider_id))
    provider_type = ctx.get("provider_type", "")

    # Determine app name (slug) from engine_config — provider-specific key
    engine_cfg = _get_engine_config(engine)
    if provider_type == "deno":
        engine_name = engine_cfg.get("project_name", str(engine.name or ""))
    elif provider_type == "cloudflare":
        engine_name = engine_cfg.get("worker_name", str(engine.name or ""))
    elif provider_type == "vercel":
        engine_name = engine_cfg.get("project_name", str(engine.name or ""))
    elif provider_type == "netlify":
        engine_name = engine_cfg.get("site_name", str(engine.name or ""))
        ctx["site_id"] = engine_cfg.get("site_id", "")  # site_id is per-engine
    else:
        engine_name = str(engine.name or "")

    # Resolve Redis URL for L2 cache (from engine's connected cache)
    redis_url = _get_engine_redis_url(engine, db)

    result = await fetch_logs(
        provider_type=provider_type,
        creds=ctx,
        engine_name=engine_name,
        limit=limit,
        cursor=cursor,
        level=level,
        redis_url=redis_url,
        engine_id=engine_id,
    )

    return {
        "logs": result.logs,
        "next_cursor": result.next_cursor,
        "provider": result.provider,
        "cached": result.cached,
    }


@router.post("/{engine_id}/logs/sync")
async def sync_engine_logs(engine_id: str, db: Session = Depends(get_db)):
    """Batch-sync logs from provider to the edge state DB.

    Triggered by QStash cron. Fetches all logs since last sync,
    pushes them to the edge engine's POST /api/edge-logs endpoint.
    """
    import httpx
    from ..services.edge_logs import fetch_logs
    from ..core.credential_resolver import get_provider_context_by_id

    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")
    if not str(engine.edge_provider_id or ""):
        raise HTTPException(status_code=400, detail="Engine has no linked provider account")
    if not str(engine.url or ""):
        raise HTTPException(status_code=400, detail="Engine has no URL configured")

    # Check persistence is enabled
    config = _get_engine_config(engine)
    log_config = config.get("log_persistence", {})
    if not log_config.get("enabled"):
        return {"synced": 0, "detail": "Log persistence not enabled"}

    ctx = get_provider_context_by_id(db, str(engine.edge_provider_id))
    provider_type = ctx.get("provider_type", "")
    # Resolve provider-specific slug from engine_config
    engine_cfg = _get_engine_config(engine)
    if provider_type == "deno":
        engine_name = engine_cfg.get("project_name", str(engine.name or ""))
    elif provider_type == "cloudflare":
        engine_name = engine_cfg.get("worker_name", str(engine.name or ""))
    elif provider_type == "vercel":
        engine_name = engine_cfg.get("project_name", str(engine.name or ""))
    elif provider_type == "netlify":
        engine_name = engine_cfg.get("site_name", str(engine.name or ""))
        ctx["site_id"] = engine_cfg.get("site_id", "")  # site_id is per-engine
    else:
        engine_name = str(engine.name or "")

    # Fetch up to 1000 logs (max batch)
    result = await fetch_logs(
        provider_type=provider_type,
        creds=ctx,
        engine_name=engine_name,
        limit=500,
        redis_url=None,  # Skip cache for sync — we want fresh data
        engine_id=engine_id,
    )

    if not result.logs:
        return {"synced": 0, "detail": "No new logs from provider"}

    # Push to edge engine's /api/edge-logs
    engine_url = resolve_engine_url(engine).rstrip("/")
    try:
        from ..services.edge_client import get_edge_headers
        auth_headers = get_edge_headers(engine)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{engine_url}/api/edge-logs",
                json={"logs": result.logs},
                headers=auth_headers,
            )
            if resp.status_code not in (200, 201):
                return {"synced": 0, "detail": f"Edge push failed: {resp.status_code}"}
    except Exception as e:
        return {"synced": 0, "detail": f"Edge push error: {str(e)[:200]}"}

    # Update last_sync_at
    log_config["last_sync_at"] = datetime.utcnow().isoformat()
    config["log_persistence"] = log_config
    engine.engine_config = json.dumps(config)  # type: ignore[assignment]
    engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()

    return {"synced": len(result.logs), "detail": "Logs synced to edge DB"}


@router.patch("/{engine_id}/logs/config")
async def update_log_config(
    engine_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Enable/disable log persistence and configure sync interval.

    Payload: {
        "enabled": bool,
        "interval_hours": int,  # must be <= provider retention
    }

    Prerequisites: engine must have edge_db_id, edge_cache_id, edge_queue_id.
    """
    from ..services.edge_logs import get_retention_hours

    query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(EdgeEngine.project_id == project.id)
        else:
            raise HTTPException(404, f"Engine '{engine_id}' not found")
            
    engine = query.first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    enabled = payload.get("enabled")
    interval_hours = payload.get("interval_hours")

    # Validate prerequisites if enabling
    if enabled:
        missing = []
        if not str(engine.edge_db_id or ""):
            missing.append("Edge Database")
        if not str(engine.edge_cache_id or ""):
            missing.append("Edge Cache")
        if not str(engine.edge_queue_id or ""):
            missing.append("Edge Queue")
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Log persistence requires: {', '.join(missing)}. Connect them in engine settings.",
            )

    # Validate interval against retention
    if interval_hours is not None and str(engine.edge_provider_id or ""):
        from ..core.credential_resolver import get_provider_context_by_id
        provider_ctx = get_provider_context_by_id(db, str(engine.edge_provider_id))
        provider_type = provider_ctx.get("provider_type", "")
        plan_tier = provider_ctx.get("_metadata", {}).get("plan_tier", "free")
        retention = get_retention_hours(provider_type, plan_tier)
        if interval_hours > retention:
            raise HTTPException(
                status_code=400,
                detail=f"Interval ({interval_hours}h) exceeds provider log retention ({retention}h). "
                       f"Set a shorter interval.",
            )

    # Update config
    config = _get_engine_config(engine)
    log_config = config.get("log_persistence", {})
    if enabled is not None:
        log_config["enabled"] = enabled
    if interval_hours is not None:
        log_config["interval_hours"] = interval_hours
    config["log_persistence"] = log_config

    engine.engine_config = json.dumps(config)  # type: ignore[assignment]
    engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()

    # TODO: Register/deregister QStash schedule when toggling enabled
    # This will be wired up when QStash integration is added

    return {"log_persistence": log_config}


@router.get("/{engine_id}/logs/retention")
async def get_log_retention(
    engine_id: str, 
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Get the provider's log retention period and current plan tier."""
    from ..services.edge_logs import get_retention_hours

    query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(EdgeEngine.project_id == project.id)
        else:
            raise HTTPException(404, f"Engine '{engine_id}' not found")
            
    engine = query.first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")
    if not str(engine.edge_provider_id or ""):
        raise HTTPException(status_code=400, detail="Engine has no linked provider account")

    from ..core.credential_resolver import get_provider_context_by_id
    provider_ctx = get_provider_context_by_id(db, str(engine.edge_provider_id))
    provider_type = provider_ctx.get("provider_type", "")
    plan_tier = provider_ctx.get("_metadata", {}).get("plan_tier", "free")
    retention = get_retention_hours(provider_type, plan_tier)

    config = _get_engine_config(engine)
    log_config = config.get("log_persistence", {})

    return {
        "provider": provider_type,
        "plan_tier": plan_tier,
        "retention_hours": retention,
        "log_persistence": log_config,
        "prerequisites_met": bool(str(engine.edge_db_id or "") and str(engine.edge_cache_id or "") and str(engine.edge_queue_id or "")),  # type: ignore[redundant-expr]
    }


# ── Helpers ───────────────────────────────────────────────────────────

def _get_engine_config(engine: EdgeEngine) -> dict:
    """Parse engine_config JSON, returning empty dict on failure."""
    if not str(engine.engine_config or ""):
        return {}
    try:
        return json.loads(str(engine.engine_config))
    except (json.JSONDecodeError, TypeError):
        return {}


def _get_engine_redis_url(engine: EdgeEngine, db: Session) -> str | None:
    """Resolve Redis URL from engine's connected edge cache."""
    if not str(engine.edge_cache_id or ""):
        return None
    try:
        from ..models.models import EdgeCache
        cache = db.query(EdgeCache).filter(EdgeCache.id == str(engine.edge_cache_id)).first()
        if cache and cache.connection_url:
            return str(cache.connection_url)
    except Exception:
        pass
    return None
