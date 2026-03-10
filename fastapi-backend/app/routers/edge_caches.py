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


# =============================================================================
# Helpers
# =============================================================================

def _serialize_cache(cache, db, engine_count: int = 0) -> EdgeCacheResponse:
    """Serialize an EdgeCache ORM object."""
    from ..models.models import EdgeProviderAccount
    account_name = None
    if cache.provider_account_id:
        acct = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == cache.provider_account_id
        ).first()
        if acct:
            account_name = str(acct.name)
    return EdgeCacheResponse(
        id=str(cache.id),
        name=str(cache.name),
        provider=str(cache.provider),
        cache_url=str(cache.cache_url),
        has_token=bool(cache.cache_token) or bool(cache.provider_account_id),
        is_default=bool(cache.is_default),
        is_system=bool(getattr(cache, 'is_system', False)),
        provider_account_id=str(cache.provider_account_id) if cache.provider_account_id else None,
        account_name=account_name,
        created_at=str(cache.created_at),
        updated_at=str(cache.updated_at),
        engine_count=engine_count,
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
            engine_count = db.query(EdgeEngine).filter(
                EdgeEngine.edge_cache_id == cache.id
            ).count()
            result.append(_serialize_cache(cache, db, engine_count))
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
        db.add(cache)
        db.commit()
        db.refresh(cache)
        
        return _serialize_cache(cache, db, 0)
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
        
        engine_count = db.query(EdgeEngine).filter(
            EdgeEngine.edge_cache_id == cache_id
        ).count()
        
        return _serialize_cache(cache, db, engine_count)
    finally:
        db.close()


@router.delete("/{cache_id}")
async def delete_edge_cache(cache_id: str, delete_remote: bool = False):
    """Delete an edge cache connection.
    
    If delete_remote=True and the cache was created from a connected Upstash account,
    also delete the Redis database at Upstash via Management API.
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
        # If delete_remote requested and cache linked to a provider account
        if delete_remote and getattr(cache, 'provider_account_id', None):
            try:
                from ..core.security import get_provider_creds
                account = db.query(EdgeProviderAccount).filter(
                    EdgeProviderAccount.id == cache.provider_account_id
                ).first()
                if account and str(account.provider) == "upstash":
                    import httpx, base64
                    creds = get_provider_creds(str(account.id), db)
                    if creds:
                        token = creds.get("api_token", "")
                        email = creds.get("email", "")
                        auth = base64.b64encode(f"{email}:{token}".encode()).decode()
                        cache_url = str(cache.cache_url)
                        # List all Redis DBs and find matching one by endpoint URL
                        async with httpx.AsyncClient(timeout=15.0) as client:
                            list_resp = await client.get(
                                "https://api.upstash.com/v2/redis/databases",
                                headers={"Authorization": f"Basic {auth}"},
                            )
                            if list_resp.status_code == 200:
                                dbs = list_resp.json()
                                for rdb in (dbs if isinstance(dbs, list) else []):
                                    rest_url = rdb.get("rest_url", "")
                                    endpoint = rdb.get("endpoint", "")
                                    if (rest_url and rest_url in cache_url) or (endpoint and endpoint in cache_url):
                                        db_id = rdb.get("database_id")
                                        if db_id:
                                            del_resp = await client.delete(
                                                f"https://api.upstash.com/v2/redis/database/{db_id}",
                                                headers={"Authorization": f"Basic {auth}"},
                                            )
                                            remote_deleted = del_resp.status_code in (200, 204)
                                        break
            except Exception:
                pass  # Remote delete is best-effort; local delete proceeds
        
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
            msg += " (also removed from Upstash)"
        return {"success": True, "message": msg, "remote_deleted": remote_deleted}
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
        cache_token = decrypt_field(str(cache_token_raw)) if cache_token_raw else None  # type: ignore[truthy-bool]
        cache_provider = str(cache.provider)
    finally:
        db.close()
    
    return await test_cache(cache_provider, cache_url, cache_token)


@router.post("/test-connection", response_model=TestCacheResult)
async def test_connection_inline(payload: EdgeCacheCreate):
    """Test a cache connection before saving it."""
    return await test_cache(payload.provider, payload.cache_url, payload.cache_token)

