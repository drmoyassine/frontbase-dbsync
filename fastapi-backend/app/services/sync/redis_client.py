"""
Redis client for caching - uses user-configured Redis URL from ProjectSettings.
"""

import json
import logging
from typing import Any, Optional
import redis.asyncio as redis

logger = logging.getLogger(__name__)

# Global client instance
_redis_client: Optional[redis.Redis] = None
_current_url: Optional[str] = None
_settings_cache: Optional[dict] = None


async def load_settings_from_db():
    """Force load settings from DB into cache."""
    global _settings_cache, _settings_cache_time
    from app.services.sync.database import async_session
    from app.services.sync.models.project_settings import ProjectSettings
    from sqlalchemy import select
    import asyncio
    import time
    
    try:
        # Use a timeout to prevent startup hangs if DB is locked
        async with asyncio.timeout(2.0):
            async with async_session() as session:
                result = await session.execute(select(ProjectSettings).limit(1))
                settings = result.scalar_one_or_none()
                if settings:
                    _settings_cache = {
                        "url": settings.redis_url,
                        "token": settings.redis_token,
                        "type": settings.redis_type,
                        "enabled": settings.redis_enabled,
                        "ttl_data": settings.cache_ttl_data,
                        "ttl_count": settings.cache_ttl_count
                    }
                else:
                    _settings_cache = None
                
                # Update cache time even if None (to cache the miss)
                _settings_cache_time = time.time()
                logger.info("Redis settings loaded from DB")
    except asyncio.TimeoutError:
        logger.error("Timeout loading Redis settings - DB likely locked")
    except Exception as e:
        logger.warning(f"Failed to load Redis settings: {e}")

async def get_configured_redis_settings() -> Optional[dict]:
    """
    Return cached Redis settings.
    Does NOT fetch from DB to avoid pool exhaustion in hot paths.
    """
    global _settings_cache
    if _settings_cache is None:
        # Fallback for first run or if loading failed
        # We try to load ONCE here, but better to rely on startup
        await load_settings_from_db()
        
    return _settings_cache

def invalidate_settings_cache():
    """Triggers reload of settings."""
    # We can't await here easily if called from sync context, so we just clear
    # and let next async call reload
    global _settings_cache
    _settings_cache = None

async def get_redis_client(redis_url: Optional[str] = None) -> Optional[redis.Redis]:
    """
    Get or create Redis client.
    """
    global _redis_client, _current_url
    
    # Use provided URL or fallback to app settings
    from app.services.sync.config import settings
    url = redis_url or settings.redis_url
    
    if not url:
        return None
        
    if _redis_client and _current_url == url:
        return _redis_client
        
    try:
        _redis_client = await redis.from_url(
            url, 
            decode_responses=True,
            socket_connect_timeout=5,
            retry_on_timeout=True
        )
        _current_url = url
        logger.info(f"Redis client initialized with URL: {url}")
        return _redis_client
    except Exception as e:
        logger.error(f"Failed to initialize Redis client: {e}")
        return None


async def cache_get(redis_url: str, key: str) -> Optional[Any]:
    """Get value from Redis cache. Returns None if not found or Redis unavailable."""
    client = await get_redis_client(redis_url)
    if not client:
        return None
    
    try:
        data = await client.get(key)
        return json.loads(data) if data else None
    except Exception as e:
        logger.warning(f"Redis GET failed for {key}: {e}")
        return None


async def cache_set(redis_url: str, key: str, value: Any, ttl: int = 300) -> bool:
    """Set value in Redis cache with TTL. Returns False if Redis unavailable."""
    client = await get_redis_client(redis_url)
    if not client:
        return False
    
    try:
        await client.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as e:
        logger.warning(f"Redis SET failed for {key}: {e}")
        return False


async def cache_delete_pattern(redis_url: str, pattern: str) -> int:
    """Delete all keys matching pattern. Returns count of deleted keys."""
    client = await get_redis_client(redis_url)
    if not client:
        return 0
    
    try:
        keys = await client.keys(pattern)
        if keys:
            return await client.delete(*keys)
        return 0
    except Exception as e:
        logger.warning(f"Redis DELETE failed for pattern {pattern}: {e}")
        return 0


async def test_redis_connection(
    redis_url: str,
    redis_token: str = None,
    redis_type: str = "upstash"
) -> tuple[bool, str]:
    """Test Redis connection. Supports both Upstash (HTTP) and TCP connections."""
    if not redis_url:
        return False, "Redis URL is empty"
    
    # Upstash-style HTTP connection (or SRH proxy)
    if redis_type == "upstash" or redis_url.startswith("https://") or redis_url.startswith("http://"):
        if not redis_token:
            return False, "Redis token is required for Upstash/HTTP connections"
        try:
            import httpx
            # Upstash REST API uses POST to /ping
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    f"{redis_url.rstrip('/')}/",
                    headers={"Authorization": f"Bearer {redis_token}"},
                    json=["PING"]
                )
                if response.status_code == 200:
                    data = response.json()
                    if data.get("result") == "PONG" or (isinstance(data, list) and data[0].get("result") == "PONG"):
                        return True, "Connected successfully (Upstash/HTTP)"
                    return True, f"Connected (Response: {data})"
                return False, f"HTTP {response.status_code}: {response.text[:100]}"
        except Exception as e:
            return False, f"HTTP connection failed: {str(e)}"
    
    # Traditional TCP connection
    try:
        client = await redis.from_url(
            redis_url, 
            decode_responses=True,
            socket_connect_timeout=5
        )
        await client.ping()
        info = await client.info("server")
        version = info.get("redis_version", "unknown")
        await client.close()
        return True, f"Connected successfully (Redis {version})"
    except Exception as e:
        return False, f"Connection failed: {str(e)}"
