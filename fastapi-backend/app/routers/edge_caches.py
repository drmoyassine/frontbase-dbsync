"""
Edge Caches router.

CRUD for managing named edge cache connections (Upstash, Redis, Dragonfly).
Mirrors the EdgeDatabase pattern — each EdgeCache can be attached to
one or more EdgeEngines (one-to-many).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid

from ..database.config import SessionLocal
from ..models.models import EdgeCache, EdgeEngine, EdgeProviderAccount
from ..services.cache_tester import test_cache, TestCacheResult

router = APIRouter(prefix="/api/edge-caches", tags=["edge-caches"])


# =============================================================================
# Schemas
# =============================================================================

class EdgeCacheCreate(BaseModel):
    name: str
    provider: str  # "upstash", "redis", "dragonfly"
    cache_url: str
    cache_token: Optional[str] = None
    provider_account_id: Optional[str] = None  # FK → Connected Account
    is_default: bool = False

class EdgeCacheUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    cache_url: Optional[str] = None
    cache_token: Optional[str] = None
    provider_account_id: Optional[str] = None
    is_default: Optional[bool] = None

class EdgeCacheResponse(BaseModel):
    id: str
    name: str
    provider: str
    cache_url: str
    has_token: bool  # Never expose the actual token
    is_default: bool
    is_system: bool = False
    provider_account_id: Optional[str] = None
    account_name: Optional[str] = None
    created_at: str
    updated_at: str
    engine_count: int = 0  # Number of edge engines using this cache
    linked_engines: list[dict] = []  # [{id, name, provider}] for tooltip display
    warning: Optional[str] = None
    supports_remote_delete: bool = False


# =============================================================================
# Helpers
# =============================================================================

def _query_linked_engines(db, fk_column, resource_id) -> tuple[int, list[dict]]:
    """Return (count, [{id, name, provider}]) for engines referencing a resource."""
    engines = db.query(EdgeEngine).filter(fk_column == resource_id).all()
    linked = [
        {
            "id": str(e.id),
            "name": str(e.name),
            "provider": str(e.edge_provider.provider) if e.edge_provider else "unknown",
        }
        for e in engines
    ]
    return len(linked), linked


def _serialize_cache(cache, db, engine_count: int = 0, linked_engines: Optional[list] = None, warning: Optional[str] = None) -> EdgeCacheResponse:
    """Serialize an EdgeCache ORM object."""
    from ..models.models import EdgeProviderAccount
    account_name = None
    if cache.provider_account_id:
        acct = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == cache.provider_account_id
        ).first()
        if acct:
            account_name = str(acct.name)
    from ..services.provider_resource_deleter import supports_remote_delete_for_model
    can_remote_delete = bool(cache.provider_account_id) and supports_remote_delete_for_model(
        "cache", str(cache.provider)
    )
    return EdgeCacheResponse(
        id=str(cache.id),
        name=str(cache.name),
        provider=str(cache.provider),
        cache_url=str(cache.cache_url),
        has_token=bool(cache.cache_token) or bool(cache.provider_account_id),
        is_default=bool(cache.is_default),
        is_system=bool(getattr(cache, 'is_system', False)),
        provider_account_id=str(cache.provider_account_id) if cache.provider_account_id is not None else None,
        account_name=account_name,
        created_at=str(cache.created_at),
        updated_at=str(cache.updated_at),
        engine_count=engine_count,
        linked_engines=linked_engines or [],
        warning=warning,
        supports_remote_delete=can_remote_delete,
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/", response_model=List[EdgeCacheResponse])
async def list_edge_caches():
    """List all configured edge caches."""
    db = SessionLocal()
    try:
        caches = db.query(EdgeCache).order_by(EdgeCache.created_at.desc()).all()
        result = []
        for cache in caches:
            engine_count, linked = _query_linked_engines(db, EdgeEngine.edge_cache_id, cache.id)
            result.append(_serialize_cache(cache, db, engine_count, linked))
        return result
    finally:
        db.close()


@router.post("/", response_model=EdgeCacheResponse, status_code=201)
async def create_edge_cache(payload: EdgeCacheCreate):
    """Create a new edge cache connection."""
    db = SessionLocal()
    try:
        # Prevent duplicate cache URLs
        existing = db.query(EdgeCache).filter(
            EdgeCache.cache_url == payload.cache_url
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"A cache with this URL already exists ('{existing.name}')"
            )

        now = datetime.utcnow().isoformat() + "Z"
        
        # If this is set as default, unset all others
        if payload.is_default:
            db.query(EdgeCache).filter(EdgeCache.is_default == True).update(
                {"is_default": False}
            )
        
        # If this is the first one, make it default
        count = db.query(EdgeCache).count()
        is_default = payload.is_default or count == 0
        
        from ..core.security import encrypt_field
        cache = EdgeCache(
            id=str(uuid.uuid4()),
            name=payload.name,
            provider=payload.provider,
            cache_url=payload.cache_url,
            cache_token=encrypt_field(payload.cache_token),
            provider_account_id=payload.provider_account_id,
            is_default=is_default,
            created_at=now,
            updated_at=now,
        )

        # CF lifecycle: create scoped token for KV resources
        token_warning = None
        if payload.provider == 'cloudflare' and payload.provider_account_id:
            import json
            from ..services.cf_token_manager import maybe_create_scoped_token_typed
            config = await maybe_create_scoped_token_typed(
                'cloudflare', 'kv', payload.name,
                payload.provider_account_id, db,
            )
            if config:
                token_warning = config.pop('_warning', None)
                cache.provider_config = json.dumps(config)  # type: ignore[assignment]

        db.add(cache)
        db.commit()
        db.refresh(cache)
        
        return _serialize_cache(cache, db, 0, warning=token_warning)
    finally:
        db.close()


@router.put("/{cache_id}", response_model=EdgeCacheResponse)
async def update_edge_cache(cache_id: str, payload: EdgeCacheUpdate):
    """Update an existing edge cache connection."""
    db = SessionLocal()
    try:
        cache = db.query(EdgeCache).filter(EdgeCache.id == cache_id).first()
        if not cache:
            raise HTTPException(404, f"Edge cache '{cache_id}' not found")
        
        if payload.name is not None:
            cache.name = payload.name  # type: ignore[assignment]
        if payload.provider is not None:
            cache.provider = payload.provider  # type: ignore[assignment]
        if payload.cache_url is not None:
            cache.cache_url = payload.cache_url  # type: ignore[assignment]
        if payload.cache_token is not None:
            from ..core.security import encrypt_field
            cache.cache_token = encrypt_field(payload.cache_token)  # type: ignore[assignment]
        if payload.provider_account_id is not None:
            cache.provider_account_id = payload.provider_account_id  # type: ignore[assignment]
        if payload.is_default is not None:
            if payload.is_default:
                db.query(EdgeCache).filter(EdgeCache.id != cache_id).update(
                    {"is_default": False}
                )
            cache.is_default = payload.is_default  # type: ignore[assignment]
        
        cache.updated_at = datetime.utcnow().isoformat() + "Z"  # type: ignore[assignment]
        db.commit()
        db.refresh(cache)
        
        engine_count, linked = _query_linked_engines(db, EdgeEngine.edge_cache_id, cache_id)
        
        return _serialize_cache(cache, db, engine_count, linked)
    finally:
        db.close()


@router.delete("/{cache_id}")
async def delete_edge_cache(cache_id: str, delete_remote: bool = False):
    """Delete an edge cache connection.
    
    If delete_remote=True and the cache was created from a connected account,
    also delete the resource at the provider.
    """
    db = SessionLocal()
    try:
        cache = db.query(EdgeCache).filter(EdgeCache.id == cache_id).first()
        if not cache:
            raise HTTPException(404, f"Edge cache '{cache_id}' not found")
        
        # System caches cannot be deleted
        if getattr(cache, 'is_system', False):
            raise HTTPException(403, "System caches cannot be deleted")
        
        # Check for referencing engines — Release-Before-IO (AGENTS.md)
        engine_count = db.query(EdgeEngine).filter(
            EdgeEngine.edge_cache_id == cache_id
        ).count()
        if engine_count > 0:
            raise HTTPException(
                409,
                f"Cannot delete: {engine_count} edge engine(s) still reference this cache. "
                f"Reassign them first."
            )
        
        remote_deleted = False
        cache_provider = str(cache.provider)

        # CF lifecycle: delete scoped token if exists
        if cache_provider == 'cloudflare':
            from ..services.cf_token_manager import maybe_delete_scoped_token
            await maybe_delete_scoped_token(
                'cloudflare',
                str(cache.provider_config) if cache.provider_config is not None else None,
                str(cache.provider_account_id) if cache.provider_account_id is not None else None,
                db,
            )

        # Remote resource delete via unified service
        if delete_remote and getattr(cache, 'provider_account_id', None):
            from ..services.provider_resource_deleter import delete_resource_for_edge_model
            remote_deleted = await delete_resource_for_edge_model(
                model_kind="cache",
                provider=cache_provider,
                resource_url=str(cache.cache_url),
                provider_config_json=str(cache.provider_config) if cache.provider_config is not None else None,
                provider_account_id=str(cache.provider_account_id),
                db_session=db,
            )
        
        was_default = bool(cache.is_default)
        cache_name = str(cache.name)
        db.delete(cache)
        
        # If we deleted the default, promote the next one
        if was_default:
            next_cache = db.query(EdgeCache).first()
            if next_cache:
                next_cache.is_default = True  # type: ignore[assignment]
        
        db.commit()
        msg = f"Edge cache '{cache_name}' deleted"
        if remote_deleted:
            msg += f" (also removed from {cache_provider.title()})"
        return {"success": True, "message": msg, "remote_deleted": remote_deleted}
    finally:
        db.close()


class BatchDeleteCacheRequest(BaseModel):
    ids: List[str]
    delete_remote: bool = False


class BatchResult(BaseModel):
    success: List[str] = []
    failed: List[dict] = []
    total: int = 0


@router.post("/batch/delete", response_model=BatchResult)
async def batch_delete_caches(payload: BatchDeleteCacheRequest):
    """Batch delete caches. Optionally delete remote resources in parallel."""
    import asyncio
    result = BatchResult(total=len(payload.ids))
    db = SessionLocal()
    try:
        records_to_delete: list[EdgeCache] = []
        for cid in payload.ids:
            cache = db.query(EdgeCache).filter(EdgeCache.id == cid).first()
            if not cache:
                result.failed.append({"id": cid, "error": "Not found"})
                continue
            if getattr(cache, 'is_system', False):
                result.failed.append({"id": cid, "error": "Cannot delete system cache"})
                continue
            ref_count = db.query(EdgeEngine).filter(EdgeEngine.edge_cache_id == cid).count()
            if ref_count > 0:
                result.failed.append({"id": cid, "error": f"{ref_count} engine(s) still reference this cache"})
                continue
            records_to_delete.append(cache)

        if payload.delete_remote:
            async def _safe_delete(rec: EdgeCache):
                try:
                    if getattr(rec, 'provider_account_id', None):
                        from ..services.provider_resource_deleter import delete_resource_for_edge_model
                        await delete_resource_for_edge_model(
                            model_kind="cache",
                            provider=str(rec.provider),
                            resource_url=str(rec.cache_url),
                            provider_config_json=str(rec.provider_config) if rec.provider_config is not None else None,
                            provider_account_id=str(rec.provider_account_id),
                            db_session=db,
                        )
                except Exception as e:
                    result.failed.append({"id": str(rec.id), "error": f"Remote delete failed: {e}"})
            await asyncio.gather(*[_safe_delete(rec) for rec in records_to_delete])

        for rec in records_to_delete:
            rid = str(rec.id)
            if any(f.get("id") == rid for f in result.failed):
                continue
            try:
                if str(rec.provider) == 'cloudflare':
                    from ..services.cf_token_manager import maybe_delete_scoped_token
                    await maybe_delete_scoped_token(
                        'cloudflare',
                        str(rec.provider_config) if rec.provider_config is not None else None,
                        str(rec.provider_account_id) if rec.provider_account_id is not None else None,
                        db,
                    )
                db.delete(rec)
                result.success.append(rid)
            except Exception as e:
                result.failed.append({"id": rid, "error": str(e)})

        db.commit()
        return result
    finally:
        db.close()


@router.post("/{cache_id}/test", response_model=TestCacheResult)
async def test_edge_cache(cache_id: str):
    """Test connectivity to an edge cache."""
    db = SessionLocal()
    try:
        cache = db.query(EdgeCache).filter(EdgeCache.id == cache_id).first()
        if not cache:
            raise HTTPException(404, f"Edge cache '{cache_id}' not found")
        
        cache_url = str(cache.cache_url)
        from ..core.security import decrypt_field
        cache_token_raw = cache.cache_token
        cache_token = decrypt_field(str(cache_token_raw)) if cache_token_raw is not None else None
        cache_provider = str(cache.provider)
        acct_id = str(cache.provider_account_id) if cache.provider_account_id is not None else None
    finally:
        db.close()
    
    return await test_cache(cache_provider, cache_url, cache_token, acct_id)


@router.post("/test-connection", response_model=TestCacheResult)
async def test_connection_inline(payload: EdgeCacheCreate):
    """Test a cache connection before saving it."""
    return await test_cache(payload.provider, payload.cache_url, payload.cache_token, payload.provider_account_id)

