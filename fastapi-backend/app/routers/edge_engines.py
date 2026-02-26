"""
Edge Engines API Router

CRUD endpoints for managing edge engines.
Each target represents an Edge Engine deployment on a specific provider
(Cloudflare Workers, Vercel Edge, Docker, etc.).

The publish pipeline uses active engines to push pages to each endpoint.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime
import asyncio
import json
import uuid

from ..database.config import get_db
from sqlalchemy.orm import Session
from ..models.models import EdgeEngine, EdgeProviderAccount

router = APIRouter(prefix="/api/edge-engines", tags=["Edge Engines"])


# =============================================================================
# Pydantic Schemas
# =============================================================================

class EdgeEngineCreate(BaseModel):
    """Create a new edge engine."""
    name: str = Field(..., min_length=1, max_length=100)
    edge_provider_id: Optional[str] = None
    adapter_type: Literal["edge", "pages", "automations", "full"] = Field(default="full")
    url: str = Field(..., min_length=1, max_length=500)
    edge_db_id: Optional[str] = None
    edge_cache_id: Optional[str] = None
    engine_config: Optional[dict] = None  # Engine-specific metadata (e.g. worker_name)
    is_active: bool = Field(default=True)


class EdgeEngineUpdate(BaseModel):
    """Update an existing edge engine."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    edge_provider_id: Optional[str] = None
    adapter_type: Optional[Literal["edge", "pages", "automations", "full"]] = None
    url: Optional[str] = Field(None, min_length=1, max_length=500)
    edge_db_id: Optional[str] = None
    edge_cache_id: Optional[str] = None
    engine_config: Optional[dict] = None
    is_active: Optional[bool] = None


class EdgeEngineResponse(BaseModel):
    """Edge engine response."""
    id: str
    name: str
    edge_provider_id: Optional[str] = None
    provider: Optional[str] = None  # From the joined provider account
    adapter_type: str
    url: str
    edge_db_id: Optional[str] = None
    edge_db_name: Optional[str] = None
    edge_cache_id: Optional[str] = None
    edge_cache_name: Optional[str] = None
    engine_config: Optional[dict] = None
    is_active: bool
    is_system: bool = False
    bundle_checksum: Optional[str] = None
    config_checksum: Optional[str] = None
    last_deployed_at: Optional[str] = None
    last_synced_at: Optional[str] = None
    sync_status: Optional[str] = None  # "synced" | "stale" | "unknown"
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class TestConnectionResult(BaseModel):
    """Result of testing an engine connection."""
    success: bool
    message: str
    latency_ms: Optional[float] = None


class BatchRequest(BaseModel):
    """Base batch request with engine IDs."""
    engine_ids: List[str] = Field(..., min_length=1)


class BatchDeleteRequest(BatchRequest):
    """Batch delete with optional remote teardown."""
    delete_remote: bool = False


class BatchToggleRequest(BatchRequest):
    """Batch toggle active status."""
    is_active: bool


class BatchResult(BaseModel):
    """Result of a batch operation."""
    success: List[str] = []  # IDs that succeeded
    failed: List[dict] = []  # [{ id, error }]
    total: int = 0


# =============================================================================
# Helpers
# =============================================================================

def _serialize_engine(engine: EdgeEngine) -> dict:
    """Serialize an EdgeEngine ORM object, parsing engine_config JSON."""
    config = None
    if engine.engine_config:
        try:
            config = json.loads(str(engine.engine_config))
        except (json.JSONDecodeError, TypeError):
            config = None

    edge_db_name = None
    if engine.edge_database:
        edge_db_name = str(engine.edge_database.name)

    edge_cache_name = None
    if engine.edge_cache:
        edge_cache_name = str(engine.edge_cache.name)

    provider_name = None
    if engine.edge_provider:
        provider_name = str(engine.edge_provider.provider)

    # Drift detection fields
    bundle_checksum_val = str(engine.bundle_checksum) if engine.bundle_checksum else None
    config_checksum_val = str(engine.config_checksum) if engine.config_checksum else None
    last_deployed_at_val = str(engine.last_deployed_at) if engine.last_deployed_at else None
    last_synced_at_val = str(engine.last_synced_at) if engine.last_synced_at else None

    # Compute sync_status
    sync_status = "unknown"
    if bundle_checksum_val and last_deployed_at_val:
        sync_status = "synced"  # Assume synced until proven otherwise

    return {
        "id": str(engine.id),
        "name": str(engine.name),
        "edge_provider_id": str(engine.edge_provider_id) if engine.edge_provider_id else None,
        "provider": provider_name,
        "adapter_type": str(engine.adapter_type),
        "url": str(engine.url),
        "edge_db_id": str(engine.edge_db_id) if engine.edge_db_id else None,
        "edge_db_name": edge_db_name,
        "edge_cache_id": str(engine.edge_cache_id) if engine.edge_cache_id else None,
        "edge_cache_name": edge_cache_name,
        "engine_config": config,
        "is_active": bool(engine.is_active),
        "is_system": bool(engine.is_system),
        "bundle_checksum": bundle_checksum_val,
        "config_checksum": config_checksum_val,
        "last_deployed_at": last_deployed_at_val,
        "last_synced_at": last_synced_at_val,
        "sync_status": sync_status,
        "created_at": str(engine.created_at),
        "updated_at": str(engine.updated_at),
    }


# =============================================================================
# CRUD Endpoints
# =============================================================================

@router.get("/", response_model=List[EdgeEngineResponse])
async def list_edge_engines(db: Session = Depends(get_db)):
    """List all edge engines."""
    engines = db.query(EdgeEngine).order_by(EdgeEngine.created_at.desc()).all()
    return [_serialize_engine(e) for e in engines]


@router.get("/{engine_id}", response_model=EdgeEngineResponse)
async def get_edge_engine(engine_id: str, db: Session = Depends(get_db)):
    """Get a single edge engine by ID."""
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")
    return _serialize_engine(engine)


@router.post("/", response_model=EdgeEngineResponse, status_code=201)
async def create_edge_engine(payload: EdgeEngineCreate, db: Session = Depends(get_db)):
    """Create a new edge engine."""
    # Verify provider if given
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
        engine_config=json.dumps(payload.engine_config) if payload.engine_config else None,
        is_active=payload.is_active,
        created_at=now,
        updated_at=now,
    )
    db.add(engine)
    db.commit()
    db.refresh(engine)
    return _serialize_engine(engine)


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
    return _serialize_engine(engine)


@router.delete("/{engine_id}", status_code=204)
async def delete_edge_engine(
    engine_id: str,
    delete_remote: bool = Query(False, description="Also delete the remote resource (e.g. CF Worker)"),
    db: Session = Depends(get_db)
):
    """Delete an edge engine. Optionally delete the remote resource too."""
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    if engine.is_system:  # type: ignore[truthy-bool]
        raise HTTPException(status_code=403, detail="Cannot delete a system edge engine")

    # Release-Before-IO: extract creds BEFORE slow HTTP call (AGENTS.md §4.3)
    cf_creds = None
    if delete_remote and engine.edge_provider and str(engine.edge_provider.provider) == "cloudflare":
        cf_creds = _extract_cf_creds(engine)

    if cf_creds:
        # DB session is released by FastAPI's Depends(get_db) generator at request end,
        # but we call the slow I/O here BEFORE any further DB writes.
        await _delete_cloudflare_worker_from_creds(cf_creds)

    db.delete(engine)
    db.commit()


# =============================================================================
# Test Connection
# =============================================================================

@router.post("/{engine_id}/test", response_model=TestConnectionResult)
async def test_edge_engine(engine_id: str, db: Session = Depends(get_db)):
    """Test connectivity to an edge engine by hitting its /api/health endpoint."""
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")
        
    url = engine.url
    provider_name = engine.edge_provider.provider if engine.edge_provider else "unknown"

    return await _test_target_connection(str(url), str(provider_name))


async def _test_target_connection(url: str, provider: str) -> TestConnectionResult:
    """Test connectivity to an edge engine."""
    import httpx
    import time

    health_url = f"{url.rstrip('/')}/api/health"

    try:
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(health_url)
        latency_ms = round((time.monotonic() - start) * 1000, 1)

        if response.is_success:
            return TestConnectionResult(
                success=True,
                message=f"{provider.title()} engine is reachable",
                latency_ms=latency_ms,
            )
        else:
            return TestConnectionResult(
                success=False,
                message=f"Engine returned HTTP {response.status_code}",
                latency_ms=latency_ms,
            )
    except httpx.ConnectError:
        return TestConnectionResult(
            success=False,
            message="Connection refused — is the engine running?",
        )
    except httpx.TimeoutException:
        return TestConnectionResult(
            success=False,
            message="Connection timed out after 5s",
        )
    except Exception as e:
        return TestConnectionResult(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


# =============================================================================
# Remote Delete Helpers
# =============================================================================

async def _delete_cloudflare_worker(engine: EdgeEngine):
    """Delete a Cloudflare Worker — convenience wrapper for endpoints not yet split."""
    creds = _extract_cf_creds(engine)
    await _delete_cloudflare_worker_from_creds(creds)


def _extract_cf_creds(engine: EdgeEngine) -> dict:
    """Extract Cloudflare credentials and worker name from an EdgeEngine (DB-only, no I/O)."""
    import json

    if not engine.edge_provider or not engine.edge_provider.provider_credentials:
        raise HTTPException(400, "No Cloudflare API token stored on the associated provider account")

    credentials = json.loads(str(engine.edge_provider.provider_credentials))
    api_token = credentials.get("api_token")
    account_id = credentials.get("account_id")

    if not api_token or not account_id:
        raise HTTPException(400, "Invalid Cloudflare provider credentials missing api_token or account_id")

    # Extract worker name from engine_config or URL
    worker_name = str(engine.name)  # Fallback
    if engine.engine_config:
        conf = json.loads(str(engine.engine_config))
        worker_name = conf.get("worker_name", worker_name)

    target_url = str(engine.url or "")
    if target_url and "workers.dev" in target_url:
        from urllib.parse import urlparse
        parsed = urlparse(target_url)
        parts = (parsed.hostname or "").split(".")
        if len(parts) >= 3:
            worker_name = parts[0]

    return {
        "api_token": api_token,
        "account_id": account_id,
        "worker_name": worker_name,
    }


async def _delete_cloudflare_worker_from_creds(creds: dict):
    """Delete a Cloudflare Worker using pre-extracted credentials (pure HTTP, no DB)."""
    import httpx

    delete_url = f"https://api.cloudflare.com/client/v4/accounts/{creds['account_id']}/workers/scripts/{creds['worker_name']}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.delete(
            delete_url,
            headers={"Authorization": f"Bearer {creds['api_token']}"}
        )

    if not response.is_success:
        result = response.json()
        errors = result.get("errors", [{}])
        err_msg = errors[0].get("message", response.text) if errors else response.text
        raise HTTPException(502, f"Failed to delete CF Worker: {err_msg}")


# =============================================================================
# Batch Operations
# =============================================================================

@router.post("/batch/delete", response_model=BatchResult)
async def batch_delete_engines(payload: BatchDeleteRequest, db: Session = Depends(get_db)):
    """Batch delete engines. Optionally delete remote resources in parallel via asyncio.gather."""
    engines = db.query(EdgeEngine).filter(EdgeEngine.id.in_(payload.engine_ids)).all()
    found_ids = {str(e.id) for e in engines}
    result = BatchResult(total=len(payload.engine_ids))

    # Separate system engines (cannot delete)
    deletable = [e for e in engines if not e.is_system]
    system_blocked = [e for e in engines if e.is_system]
    for e in system_blocked:
        result.failed.append({"id": str(e.id), "error": "Cannot delete system engine"})

    # Not found
    for eid in payload.engine_ids:
        if eid not in found_ids:
            result.failed.append({"id": eid, "error": "Engine not found"})

    # Release-Before-IO: extract all CF creds from DB first, then do I/O
    cf_jobs: list[tuple[str, dict]] = []
    if payload.delete_remote:
        for engine in deletable:
            if engine.edge_provider and str(engine.edge_provider.provider) == "cloudflare":
                try:
                    creds = _extract_cf_creds(engine)
                    cf_jobs.append((str(engine.id), creds))
                except Exception as ex:
                    result.failed.append({"id": str(engine.id), "error": str(ex)})

    # Parallel CF teardown via asyncio.gather
    if cf_jobs:
        async def _safe_delete(engine_id: str, creds: dict):
            try:
                await _delete_cloudflare_worker_from_creds(creds)
                return engine_id, None
            except Exception as ex:
                return engine_id, str(ex)

        outcomes = await asyncio.gather(*[_safe_delete(eid, c) for eid, c in cf_jobs])
        failed_remote_ids = set()
        for eid, err in outcomes:
            if err:
                result.failed.append({"id": eid, "error": f"Remote delete failed: {err}"})
                failed_remote_ids.add(eid)

        # Only DB-delete engines whose remote teardown succeeded (or had no remote)
        deletable = [e for e in deletable if str(e.id) not in failed_remote_ids]

    # Batch DB delete
    for engine in deletable:
        db.delete(engine)
        result.success.append(str(engine.id))
    db.commit()

    return result


@router.post("/batch/toggle", response_model=BatchResult)
async def batch_toggle_engines(payload: BatchToggleRequest, db: Session = Depends(get_db)):
    """Batch toggle active status for multiple engines. Single SQL update."""
    engines = db.query(EdgeEngine).filter(EdgeEngine.id.in_(payload.engine_ids)).all()
    found_ids = {str(e.id) for e in engines}
    result = BatchResult(total=len(payload.engine_ids))

    now = datetime.utcnow().isoformat()
    for engine in engines:
        if engine.is_system:  # type: ignore[truthy-bool]
            result.failed.append({"id": str(engine.id), "error": "Cannot toggle system engine"})
            continue
        engine.is_active = payload.is_active  # type: ignore[assignment]
        engine.updated_at = now  # type: ignore[assignment]
        result.success.append(str(engine.id))

    for eid in payload.engine_ids:
        if eid not in found_ids:
            result.failed.append({"id": eid, "error": "Engine not found"})

    db.commit()
    return result


@router.post("/batch/sync-check", response_model=BatchResult)
async def batch_sync_check(payload: BatchRequest, db: Session = Depends(get_db)):
    """Batch sync-check: verify engines are reachable and update last_synced_at."""
    engines = db.query(EdgeEngine).filter(EdgeEngine.id.in_(payload.engine_ids)).all()
    found_ids = {str(e.id) for e in engines}
    result = BatchResult(total=len(payload.engine_ids))

    for eid in payload.engine_ids:
        if eid not in found_ids:
            result.failed.append({"id": eid, "error": "Engine not found"})

    # Parallel health checks via asyncio.gather
    async def _check_engine(engine: EdgeEngine):
        import httpx
        eid = str(engine.id)
        url = str(engine.url or "").rstrip("/")
        if not url:
            return eid, False, "No URL configured"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{url}/api/health")
            if resp.is_success:
                return eid, True, None
            else:
                return eid, False, f"HTTP {resp.status_code}"
        except Exception as ex:
            return eid, False, str(ex)

    outcomes = await asyncio.gather(*[_check_engine(e) for e in engines])

    now = datetime.utcnow().isoformat()
    for eid, ok, err in outcomes:
        if ok:
            # Update last_synced_at
            engine = next((e for e in engines if str(e.id) == eid), None)
            if engine:
                engine.last_synced_at = now  # type: ignore[assignment]
                engine.updated_at = now  # type: ignore[assignment]
            result.success.append(eid)
        else:
            result.failed.append({"id": eid, "error": err or "Unknown"})

    db.commit()
    return result


@router.get("/active/by-scope/{scope}", response_model=List[EdgeEngineResponse])
async def list_active_engines_by_scope(scope: Literal["pages", "automations", "full"], db: Session = Depends(get_db)):
    """List active edge engines filtered by adapter scope.
    
    Used by the publish pipeline to determine where to push pages/automations.
    'full' scope targets match both 'pages' and 'automations' queries.
    """
    query = db.query(EdgeEngine).filter(EdgeEngine.is_active == True)
    
    if scope == "pages":
        query = query.filter(EdgeEngine.adapter_type.in_(["pages", "full"]))
    elif scope == "automations":
        query = query.filter(EdgeEngine.adapter_type.in_(["automations", "full"]))

    engines = query.order_by(EdgeEngine.created_at.desc()).all()
    return [_serialize_engine(e) for e in engines]
