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
    engine_config: Optional[dict] = None  # Engine-specific metadata (e.g. worker_name)
    is_active: bool = Field(default=True)


class EdgeEngineUpdate(BaseModel):
    """Update an existing edge engine."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    edge_provider_id: Optional[str] = None
    adapter_type: Optional[Literal["edge", "pages", "automations", "full"]] = None
    url: Optional[str] = Field(None, min_length=1, max_length=500)
    edge_db_id: Optional[str] = None
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
    engine_config: Optional[dict] = None
    is_active: bool
    is_system: bool = False
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class TestConnectionResult(BaseModel):
    """Result of testing an engine connection."""
    success: bool
    message: str
    latency_ms: Optional[float] = None


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

    provider_name = None
    if engine.edge_provider:
        provider_name = str(engine.edge_provider.provider)

    return {
        "id": str(engine.id),
        "name": str(engine.name),
        "edge_provider_id": str(engine.edge_provider_id) if engine.edge_provider_id else None,
        "provider": provider_name,
        "adapter_type": str(engine.adapter_type),
        "url": str(engine.url),
        "edge_db_id": str(engine.edge_db_id) if engine.edge_db_id else None,
        "edge_db_name": edge_db_name,
        "engine_config": config,
        "is_active": bool(engine.is_active),
        "is_system": bool(engine.is_system),
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

    # Remote Cloudflare Worker deletion
    if delete_remote and engine.edge_provider and str(engine.edge_provider.provider) == "cloudflare":
        await _delete_cloudflare_worker(engine)

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
    """Delete a Cloudflare Worker using the stored API token."""
    import httpx
    import json
    
    if not engine.edge_provider or not engine.edge_provider.provider_credentials:
        raise HTTPException(400, "No Cloudflare API token stored on the associated provider account")

    try:
        credentials = json.loads(str(engine.edge_provider.provider_credentials))
        api_token = credentials.get("api_token")
        account_id = credentials.get("account_id")
        
        if not api_token or not account_id:
            raise HTTPException(400, "Invalid Cloudflare provider credentials missing api_token or account_id")

        # Extract worker name from URL (e.g. "frontbase-edge.account.workers.dev" → "frontbase-edge")
        worker_name = str(engine.name)  # Fallback to target name
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

        # Call CF API to delete the worker
        delete_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{worker_name}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.delete(
                delete_url,
                headers={"Authorization": f"Bearer {api_token}"}
            )

        if not response.is_success:
            result = response.json()
            errors = result.get("errors", [{}])
            err_msg = errors[0].get("message", response.text) if errors else response.text
            raise HTTPException(502, f"Failed to delete CF Worker: {err_msg}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Remote delete failed: {str(e)}")


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
