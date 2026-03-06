"""
Edge Engines API Router — Thin Router.

CRUD endpoints for managing edge engines.
Each target represents an Edge Engine deployment on a specific provider
(Cloudflare Workers, Vercel Edge, Docker, etc.).

The publish pipeline uses active engines to push pages to each endpoint.

All business logic delegated to:
- services/engine_deploy.py (redeploy)
- services/engine_test.py (connectivity testing, CF delete)
- services/secrets_builder.py (binding construction)
- services/cloudflare_api.py (CF API calls)
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
from ..models.models import EdgeEngine, EdgeProviderAccount

from ..schemas.edge_engines import (
    EdgeEngineCreate, EdgeEngineUpdate, EdgeEngineResponse,
    TestConnectionResult, ReconfigureRequest,
    BatchRequest, BatchDeleteRequest, BatchToggleRequest, BatchResult,
)
from ..services.bundle import get_source_hash
from ..services import engine_deploy, engine_test
from ..services.secrets_builder import build_engine_secrets, FRONTBASE_BINDING_NAMES

router = APIRouter(prefix="/api/edge-engines", tags=["Edge Engines"])


# =============================================================================
# Helpers
# =============================================================================

def _serialize_engine(engine: EdgeEngine, current_hashes: dict | None = None) -> dict:
    """Serialize an EdgeEngine ORM object, parsing engine_config JSON.
    
    current_hashes: optional {"lite": "abc...", "full": "def..."} to compute is_outdated.
    """
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

    edge_queue_name = None
    if engine.edge_queue:
        edge_queue_name = str(engine.edge_queue.name)

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

    # Compute is_outdated by comparing deployed hash against current dist hash
    is_outdated = False
    if current_hashes:
        adapter = str(engine.adapter_type) if engine.adapter_type else "automations"
        is_full = adapter == "full"
        current_hash = current_hashes.get("full" if is_full else "lite")

        if not bundle_checksum_val:
            if engine.edge_provider_id and not getattr(engine, 'is_system', False):
                is_outdated = True
                sync_status = "stale"
        elif current_hash and current_hash != bundle_checksum_val:
            is_outdated = True
            sync_status = "stale"

    # GPU model (single model per engine — see edge_gpu.py enforcement)
    gpu_model_obj = engine.gpu_models[0] if engine.gpu_models else None
    gpu_model_data = {
        "id": str(gpu_model_obj.id),
        "name": str(gpu_model_obj.name),
        "slug": str(gpu_model_obj.slug),
        "model_id": str(gpu_model_obj.model_id),
        "model_type": str(gpu_model_obj.model_type),
        "endpoint_url": str(gpu_model_obj.endpoint_url) if gpu_model_obj.endpoint_url else None,
    } if gpu_model_obj else None

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
        "edge_queue_id": str(engine.edge_queue_id) if engine.edge_queue_id else None,
        "edge_queue_name": edge_queue_name,
        "engine_config": config,
        "gpu_model": gpu_model_data,
        "is_active": bool(engine.is_active),
        "is_system": bool(engine.is_system),
        "bundle_checksum": bundle_checksum_val,
        "config_checksum": config_checksum_val,
        "last_deployed_at": last_deployed_at_val,
        "last_synced_at": last_synced_at_val,
        "sync_status": sync_status,
        "is_outdated": is_outdated,
        "created_at": str(engine.created_at),
        "updated_at": str(engine.updated_at),
    }


def _get_current_hashes() -> dict:
    """Get current source hashes for drift detection."""
    source_hash = get_source_hash()
    return {"lite": source_hash, "full": source_hash}


# =============================================================================
# CRUD Endpoints
# =============================================================================

# --- Static routes MUST come before /{engine_id} routes ---

@router.get("/bundle-hashes/")
async def get_bundle_hashes():
    """Return current source hash for drift detection."""
    source_hash = get_source_hash()
    return {"lite": source_hash, "full": source_hash}


@router.get("/", response_model=List[EdgeEngineResponse])
async def list_edge_engines(db: Session = Depends(get_db)):
    """List all edge engines with outdated detection."""
    current_hashes = _get_current_hashes()
    engines = db.query(EdgeEngine).order_by(EdgeEngine.created_at.desc()).all()
    return [_serialize_engine(e, current_hashes) for e in engines]


@router.get("/{engine_id}", response_model=EdgeEngineResponse)
async def get_edge_engine(engine_id: str, db: Session = Depends(get_db)):
    """Get a single edge engine by ID."""
    current_hashes = _get_current_hashes()
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")
    return _serialize_engine(engine, current_hashes)


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


# =============================================================================
# Reconfigure
# =============================================================================

@router.post("/{engine_id}/reconfigure")
async def reconfigure_engine(engine_id: str, payload: ReconfigureRequest, db: Session = Depends(get_db)):
    """
    Live-reconfigure an engine's DB/cache bindings.
    
    Uses the CF Settings API PATCH to update bindings without full redeployment.
    Only touches Frontbase-managed bindings — all other bindings are preserved.
    """
    import httpx

    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Edge engine not found")

    # --- 1. Resolve CF credentials ---
    provider_id = engine.edge_provider_id
    is_cloudflare = False
    api_token = None
    account_id = None
    worker_name = None

    if provider_id:
        provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id).first()
        if provider and str(provider.provider) == 'cloudflare':
            is_cloudflare = True
            creds = json.loads(str(provider.provider_credentials or '{}'))
            api_token = creds.get('api_token')
            account_id = creds.get('account_id')
            cfg = json.loads(str(engine.engine_config or '{}'))
            worker_name = cfg.get('worker_name')

    # --- 2. Build NEW bindings from DB/cache selections (DRY) ---
    new_bindings = build_engine_secrets(
        db,
        edge_db_id=payload.edge_db_id,
        edge_cache_id=payload.edge_cache_id,
        edge_queue_id=payload.edge_queue_id,
    )

    # --- 3. PATCH CF Worker settings ---
    settings_patched = False
    bindings_set: list[str] = list(new_bindings.keys())
    bindings_removed: list[str] = []

    if is_cloudflare and api_token and account_id and worker_name:
        from ..services.cloudflare_api import CF_API, headers as cf_headers
        settings_url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/settings"

        try:
            async with httpx.AsyncClient() as client:
                # GET current settings to preserve non-Frontbase bindings
                get_resp = await client.get(
                    settings_url,
                    headers={**cf_headers(api_token), "Content-Type": "application/json"},
                    timeout=15.0,
                )

                existing_bindings: list[dict] = []
                if get_resp.status_code == 200:
                    data = get_resp.json()
                    result = data.get("result", {})
                    existing_bindings = result.get("bindings", [])

                # Filter out Frontbase-managed bindings (we'll replace them)
                preserved_bindings = [
                    b for b in existing_bindings
                    if b.get("name") not in FRONTBASE_BINDING_NAMES
                ]

                # Track what we're removing
                existing_fb_names = {
                    b.get("name") for b in existing_bindings
                    if b.get("name") in FRONTBASE_BINDING_NAMES
                }
                bindings_removed = list(existing_fb_names - set(new_bindings.keys()))

                # Add our new bindings as secret_text
                for name, value in new_bindings.items():
                    preserved_bindings.append({
                        "type": "secret_text",
                        "name": name,
                        "text": value,
                    })

                # PATCH settings — CF API requires multipart/form-data
                settings_payload = json.dumps({"bindings": preserved_bindings})
                patch_resp = await client.patch(
                    settings_url,
                    headers=cf_headers(api_token),
                    files={
                        "settings": (None, settings_payload, "application/json"),
                    },
                    timeout=15.0,
                )

                settings_patched = patch_resp.status_code in (200, 201)
                if settings_patched:
                    print(f"[Reconfigure] Settings PATCH OK for '{worker_name}': "
                          f"set={bindings_set}, removed={bindings_removed}")
                else:
                    print(f"[Reconfigure] Settings PATCH failed: "
                          f"{patch_resp.status_code} {patch_resp.text[:300]}")

                # Also DELETE removed secrets (legacy per-script secrets persist independently)
                secrets_url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/secrets"
                for secret_name in bindings_removed:
                    try:
                        del_resp = await client.delete(
                            f"{secrets_url}/{secret_name}",
                            headers=cf_headers(api_token),
                            timeout=15.0,
                        )
                        if del_resp.status_code in (200, 204):
                            print(f"[Reconfigure] Deleted legacy secret '{secret_name}'")
                        else:
                            print(f"[Reconfigure] Could not delete secret '{secret_name}': {del_resp.status_code}")
                    except Exception as del_err:
                        print(f"[Reconfigure] Error deleting secret '{secret_name}': {del_err}")

        except Exception as e:
            print(f"[Reconfigure] Settings PATCH error: {e}")

    # --- 4. Update local DB record ---
    engine.edge_db_id = payload.edge_db_id  # type: ignore[assignment]
    engine.edge_cache_id = payload.edge_cache_id  # type: ignore[assignment]
    engine.edge_queue_id = payload.edge_queue_id  # type: ignore[assignment]
    engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()
    db.refresh(engine)

    # --- 5. Flush edge cache on the target ---
    cache_flushed = await engine_deploy._flush_cache(str(engine.url).rstrip('/'))

    return {
        "success": True,
        "engine": _serialize_engine(engine),
        "settings_patched": settings_patched,
        "cache_flushed": cache_flushed,
        "bindings_set": bindings_set,
        "bindings_removed": bindings_removed,
    }


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
    result["engine"] = _serialize_engine(engine)
    return result


# =============================================================================
# Delete
# =============================================================================

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
        cf_creds = engine_test.extract_cf_creds(engine)

    if cf_creds:
        await engine_test.delete_cloudflare_worker_from_creds(cf_creds)

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
# Batch Operations
# =============================================================================

@router.post("/batch/delete", response_model=BatchResult)
async def batch_delete_engines(payload: BatchDeleteRequest, db: Session = Depends(get_db)):
    """Batch delete engines. Optionally delete remote resources in parallel via asyncio.gather."""
    result = BatchResult(total=len(payload.engine_ids))

    # Phase 1: extract CF creds BEFORE any I/O (Release-Before-IO)
    engines_to_delete: list[tuple[EdgeEngine, dict | None]] = []
    for eid in payload.engine_ids:
        engine = db.query(EdgeEngine).filter(EdgeEngine.id == eid).first()
        if not engine:
            result.failed.append({"id": eid, "error": "Not found"})
            continue
        if engine.is_system:  # type: ignore[truthy-bool]
            result.failed.append({"id": eid, "error": "Cannot delete system engine"})
            continue

        cf_creds = None
        if payload.delete_remote and engine.edge_provider and str(engine.edge_provider.provider) == "cloudflare":
            try:
                cf_creds = engine_test.extract_cf_creds(engine)
            except Exception as e:
                result.failed.append({"id": eid, "error": f"CF creds error: {e}"})
                continue
        engines_to_delete.append((engine, cf_creds))

    # Phase 2: Delete remote resources in parallel
    if payload.delete_remote:
        async def _safe_delete(engine_id: str, creds: dict):
            try:
                await engine_test.delete_cloudflare_worker_from_creds(creds)
            except Exception as e:
                result.failed.append({"id": engine_id, "error": f"Remote delete failed: {e}"})

        tasks = [
            _safe_delete(str(eng.id), creds)
            for eng, creds in engines_to_delete
            if creds
        ]
        if tasks:
            await asyncio.gather(*tasks)

    # Phase 3: Delete from DB
    for engine, _ in engines_to_delete:
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
        {"id": str(e.id), "url": str(e.url), "name": str(e.name), "adapter_type": str(e.adapter_type)}
        for e in engines
    ]
