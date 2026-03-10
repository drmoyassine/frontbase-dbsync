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
from ..models.models import EdgeEngine

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
async def deploy_engine(payload: GenericDeployRequest, db: Session = Depends(get_db)):
    """Provider-agnostic one-click deploy. Delegates to engine_provisioner."""
    return await provision_and_deploy(payload, db)


@router.get("/", response_model=List[EdgeEngineResponse])
async def list_edge_engines(db: Session = Depends(get_db)):
    """List all edge engines with outdated detection."""
    current_hashes = get_current_hashes()
    engines = db.query(EdgeEngine).order_by(EdgeEngine.created_at.desc()).all()
    return [serialize_engine(e, current_hashes) for e in engines]


@router.get("/{engine_id}", response_model=EdgeEngineResponse)
async def get_edge_engine(engine_id: str, db: Session = Depends(get_db)):
    """Get a single edge engine by ID."""
    current_hashes = get_current_hashes()
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")
    return serialize_engine(engine, current_hashes)


@router.post("/", response_model=EdgeEngineResponse, status_code=201)
async def create_edge_engine(payload: EdgeEngineCreate, db: Session = Depends(get_db)):
    """Create a new edge engine."""
    if payload.edge_provider_id:
        provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == payload.edge_provider_id).first()
        if not provider:
            raise HTTPException(status_code=400, detail="Invalid edge_provider_id")

    now = datetime.utcnow().isoformat()
    engine = EdgeEngine(
        id=str(uuid.uuid4()),
        name=payload.name,
        edge_provider_id=payload.edge_provider_id,
        adapter_type=payload.adapter_type,
        url=payload.url,
        edge_db_id=payload.edge_db_id,
        edge_cache_id=payload.edge_cache_id,
        edge_queue_id=payload.edge_queue_id,
        engine_config=json.dumps(payload.engine_config) if payload.engine_config else None,
        is_active=payload.is_active,
        created_at=now,
        updated_at=now,
    )
    db.add(engine)
    db.commit()
    db.refresh(engine)
    return serialize_engine(engine)


@router.put("/{engine_id}", response_model=EdgeEngineResponse)
async def update_edge_engine(engine_id: str, payload: EdgeEngineUpdate, db: Session = Depends(get_db)):
    """Update an existing edge engine."""
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    if payload.edge_provider_id:
        provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == payload.edge_provider_id).first()
        if not provider:
            raise HTTPException(status_code=400, detail="Invalid edge_provider_id")

    update_data = payload.model_dump(exclude_unset=True)
    if 'engine_config' in update_data and update_data['engine_config'] is not None:
        update_data['engine_config'] = json.dumps(update_data['engine_config'])
        
    for key, value in update_data.items():
        setattr(engine, key, value)
        
    engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]

    db.commit()
    db.refresh(engine)
    return serialize_engine(engine)


# =============================================================================
# Reconfigure
# =============================================================================

@router.post("/{engine_id}/reconfigure")
async def reconfigure_engine(engine_id: str, payload: ReconfigureRequest, db: Session = Depends(get_db)):
    """Live-reconfigure an engine's DB/cache/queue bindings.
    
    Delegates to engine_reconfigure service (CF Settings API PATCH).
    """
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    result = await engine_reconfigure.reconfigure(engine, payload, db)
    result["engine"] = serialize_engine(engine)
    return result


# =============================================================================
# Redeploy — delegates to engine_deploy service
# =============================================================================

@router.post("/{engine_id}/redeploy")
async def redeploy_engine(engine_id: str, db: Session = Depends(get_db)):
    """Redeploy an engine with the latest bundle code + current secrets."""
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    result = await engine_deploy.redeploy(engine, db)
    result["engine"] = serialize_engine(engine)
    return result


# =============================================================================
# Sync Manifest — read self-describing metadata from a running engine
# =============================================================================

@router.post("/{engine_id}/sync-manifest")
async def sync_manifest(engine_id: str, db: Session = Depends(get_db)):
    """Fetch /api/manifest from a running engine and sync GPU models + metadata.

    Delegates to services/engine_manifest.py.
    Silent on failure — engine might not be a Frontbase engine.
    """
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    return await sync_engine_manifest(engine, db)


# =============================================================================
# Delete
# =============================================================================

@router.delete("/{engine_id}", status_code=204)
async def delete_edge_engine(
    engine_id: str,
    delete_remote: bool = Query(False, description="Also delete the remote resource"),
    db: Session = Depends(get_db)
):
    """Delete an edge engine. Optionally delete the remote resource too."""
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    if engine.is_system:  # type: ignore[truthy-bool]
        raise HTTPException(status_code=403, detail="Cannot delete a system edge engine")

    # Delete remote resource (works for all providers)
    if delete_remote and engine.edge_provider_id:
        await engine_test.delete_remote_resource(engine, db)

    db.delete(engine)
    db.commit()


# =============================================================================
# Test Connection — delegates to engine_test service
# =============================================================================

@router.post("/{engine_id}/test", response_model=TestConnectionResult)
async def test_edge_engine(engine_id: str, db: Session = Depends(get_db)):
    """Test connectivity to an edge engine by hitting its /api/health endpoint."""
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")
        
    url = engine.url
    provider_name = engine.edge_provider.provider if engine.edge_provider else "unknown"

    return await engine_test.test_connection(str(url), str(provider_name))


# =============================================================================
# Source Snapshot — serves the pre-compilation source tree for the Inspector
# =============================================================================

@router.get("/{engine_id}/source")
async def get_engine_source(engine_id: str, db: Session = Depends(get_db)):
    """Return the TypeScript source snapshot captured at last deploy.

    Provider-agnostic — works for any engine that has been deployed.
    """
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
    if not engine.source_snapshot:
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
async def update_engine_source(engine_id: str, payload: dict, db: Session = Depends(get_db)):
    """Save modified source files to the engine's DB snapshot (per-engine isolation).

    Payload: { files: { "relative/path.ts": "content", ... } }
    Only updates the files provided — other snapshot files remain untouched.

    Core Zone Convention:
    - Files under frontbase-core/ are tracked in modified_core_files
    - Files outside frontbase-core/ set is_forked = True
    """
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
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
    existing = json.loads(str(engine.source_snapshot)) if engine.source_snapshot else {}
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
    existing_modified = json.loads(str(engine.modified_core_files)) if engine.modified_core_files else []
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
# Batch Operations
# =============================================================================

@router.post("/batch/delete", response_model=BatchResult)
async def batch_delete_engines(payload: BatchDeleteRequest, db: Session = Depends(get_db)):
    """Batch delete engines. Optionally delete remote resources in parallel via asyncio.gather."""
    result = BatchResult(total=len(payload.engine_ids))

    # Phase 1: collect engines to delete
    engines_to_delete: list[EdgeEngine] = []
    for eid in payload.engine_ids:
        engine = db.query(EdgeEngine).filter(EdgeEngine.id == eid).first()
        if not engine:
            result.failed.append({"id": eid, "error": "Not found"})
            continue
        if engine.is_system:  # type: ignore[truthy-bool]
            result.failed.append({"id": eid, "error": "Cannot delete system engine"})
            continue
        engines_to_delete.append(engine)

    # Phase 2: Delete remote resources in parallel (all providers)
    if payload.delete_remote:
        async def _safe_delete(eng: EdgeEngine):
            try:
                if eng.edge_provider_id:
                    await engine_test.delete_remote_resource(eng, db)
            except Exception as e:
                result.failed.append({"id": str(eng.id), "error": f"Remote delete failed: {e}"})

        await asyncio.gather(*[_safe_delete(eng) for eng in engines_to_delete])

    # Phase 3: Delete from DB
    for engine in engines_to_delete:
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
async def batch_toggle_engines(payload: BatchToggleRequest, db: Session = Depends(get_db)):
    """Batch toggle active status for multiple engines. Single SQL update."""
    result = BatchResult(total=len(payload.engine_ids))
    for eid in payload.engine_ids:
        engine = db.query(EdgeEngine).filter(EdgeEngine.id == eid).first()
        if not engine:
            result.failed.append({"id": eid, "error": "Not found"})
            continue
        engine.is_active = payload.is_active  # type: ignore[assignment]
        engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
        result.success.append(eid)
    db.commit()
    return result


@router.post("/batch/sync-check", response_model=BatchResult)
async def batch_sync_check(payload: BatchRequest, db: Session = Depends(get_db)):
    """Batch sync-check: verify engines are reachable and update last_synced_at."""
    result = BatchResult(total=len(payload.engine_ids))

    async def _check_engine(engine: EdgeEngine):
        eid = str(engine.id)
        url = str(engine.url)
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
        engine = db.query(EdgeEngine).filter(EdgeEngine.id == eid).first()
        if not engine:
            result.failed.append({"id": eid, "error": "Not found"})
            continue
        engines.append(engine)

    await asyncio.gather(*[_check_engine(e) for e in engines])
    db.commit()
    return result


# =============================================================================
# Scope Query
# =============================================================================

@router.get("/active/by-scope/{scope}")
async def list_active_engines_by_scope(scope: Literal["pages", "automations", "full"], db: Session = Depends(get_db)):
    """List active edge engines filtered by adapter scope.
    
    Used by the publish pipeline to determine where to push pages/automations.
    'full' scope targets match both 'pages' and 'automations' queries.
    """
    query = db.query(EdgeEngine).filter(EdgeEngine.is_active == True)  # noqa: E712
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
            "edge_db_id": str(e.edge_db_id) if e.edge_db_id else None,
            "is_active": bool(e.is_active),
        }
        for e in engines
    ]
