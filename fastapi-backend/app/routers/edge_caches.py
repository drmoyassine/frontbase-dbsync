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
from ..models.models import EdgeCache, EdgeEngine
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
    is_default: bool = False

class EdgeCacheUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    cache_url: Optional[str] = None
    cache_token: Optional[str] = None
    is_default: Optional[bool] = None

class EdgeCacheResponse(BaseModel):
    id: str
    name: str
    provider: str
    cache_url: str
    has_token: bool  # Never expose the actual token
    is_default: bool
    is_system: bool = False
    created_at: str
    updated_at: str
    engine_count: int = 0  # Number of edge engines using this cache


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
            engine_count = db.query(EdgeEngine).filter(
                EdgeEngine.edge_cache_id == cache.id
            ).count()
            result.append(EdgeCacheResponse(
                id=str(cache.id),
                name=str(cache.name),
                provider=str(cache.provider),
                cache_url=str(cache.cache_url),
                has_token=bool(cache.cache_token),
                is_default=bool(cache.is_default),
                is_system=bool(getattr(cache, 'is_system', False)),
                created_at=str(cache.created_at),
                updated_at=str(cache.updated_at),
                engine_count=engine_count,
            ))
        return result
    finally:
        db.close()


@router.post("/", response_model=EdgeCacheResponse, status_code=201)
async def create_edge_cache(payload: EdgeCacheCreate):
    """Create a new edge cache connection."""
    db = SessionLocal()
    try:
        now = datetime.utcnow().isoformat() + "Z"
        
        # If this is set as default, unset all others
        if payload.is_default:
            db.query(EdgeCache).filter(EdgeCache.is_default == True).update(
                {"is_default": False}
            )
        
        # If this is the first one, make it default
        count = db.query(EdgeCache).count()
        is_default = payload.is_default or count == 0
        
        cache = EdgeCache(
            id=str(uuid.uuid4()),
            name=payload.name,
            provider=payload.provider,
            cache_url=payload.cache_url,
            cache_token=payload.cache_token,
            is_default=is_default,
            created_at=now,
            updated_at=now,
        )
        db.add(cache)
        db.commit()
        db.refresh(cache)
        
        return EdgeCacheResponse(
            id=str(cache.id),
            name=str(cache.name),
            provider=str(cache.provider),
            cache_url=str(cache.cache_url),
            has_token=bool(cache.cache_token),
            is_default=bool(cache.is_default),
            created_at=str(cache.created_at),
            updated_at=str(cache.updated_at),
            engine_count=0,
        )
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
            cache.cache_token = payload.cache_token  # type: ignore[assignment]
        if payload.is_default is not None:
            if payload.is_default:
                # Unset all others
                db.query(EdgeCache).filter(EdgeCache.id != cache_id).update(
                    {"is_default": False}
                )
            cache.is_default = payload.is_default  # type: ignore[assignment]
        
        cache.updated_at = datetime.utcnow().isoformat() + "Z"  # type: ignore[assignment]
        db.commit()
        db.refresh(cache)
        
        engine_count = db.query(EdgeEngine).filter(
            EdgeEngine.edge_cache_id == cache_id
        ).count()
        
        return EdgeCacheResponse(
            id=str(cache.id),
            name=str(cache.name),
            provider=str(cache.provider),
            cache_url=str(cache.cache_url),
            has_token=bool(cache.cache_token),
            is_default=bool(cache.is_default),
            created_at=str(cache.created_at),
            updated_at=str(cache.updated_at),
            engine_count=engine_count,
        )
    finally:
        db.close()


@router.delete("/{cache_id}")
async def delete_edge_cache(cache_id: str):
    """Delete an edge cache connection.
    
    Fails if any edge engines still reference this cache.
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
        
        was_default = bool(cache.is_default)
        db.delete(cache)
        
        # If we deleted the default, promote the next one
        if was_default:
            next_cache = db.query(EdgeCache).first()
            if next_cache:
                next_cache.is_default = True  # type: ignore[assignment]
        
        db.commit()
        return {"success": True, "message": f"Edge cache '{cache.name}' deleted"}
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
        cache_token_raw = cache.cache_token
        cache_token = str(cache_token_raw) if cache_token_raw else None  # type: ignore[truthy-bool]
        cache_provider = str(cache.provider)
    finally:
        db.close()
    
    return await test_cache(cache_provider, cache_url, cache_token)


@router.post("/test-connection", response_model=TestCacheResult)
async def test_connection_inline(payload: EdgeCacheCreate):
    """Test a cache connection before saving it."""
    return await test_cache(payload.provider, payload.cache_url, payload.cache_token)

