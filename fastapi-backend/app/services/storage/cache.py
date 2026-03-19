"""
Storage Size Cache — L1 in-memory + L2 Redis caching for folder sizes.

L1: In-memory dict — instant, lost on restart
L2: Redis with 10-min TTL — survives restart, shared across workers
L3: Recursive API walk — expensive, populates L1 + L2 (handled by adapters)
"""

import asyncio
import logging
from typing import Dict, Optional

from app.services.sync.redis_client import cache_get, cache_set, get_configured_redis_settings

logger = logging.getLogger(__name__)

# ── L1 In-Memory Cache ───────────────────────────────────────────────
_SIZE_CACHE: Dict[str, int] = {}
_SIZE_CACHE_LOCK = asyncio.Lock()
_SIZE_CACHE_TTL_REDIS = 600  # 10 minutes in Redis


def _size_cache_key(provider_id: str, bucket: str, path: str) -> str:
    """Build a cache key for a (provider, bucket, path) combo."""
    return f"storage:size:{provider_id}:{bucket}:{path or '__root__'}"


async def get_cached_size(provider_id: str, bucket: str, path: str) -> Optional[int]:
    """Check L1 then L2 for a cached size. Returns None on miss."""
    key = _size_cache_key(provider_id, bucket, path)

    # L1: Memory
    if key in _SIZE_CACHE:
        return _SIZE_CACHE[key]

    # L2: Redis
    try:
        redis_settings = await get_configured_redis_settings()
        redis_url = redis_settings.get("url") if redis_settings and redis_settings.get("enabled") else None
        if redis_url:
            cached = await cache_get(redis_url, key)
            if cached is not None:
                size = int(cached)
                async with _SIZE_CACHE_LOCK:
                    _SIZE_CACHE[key] = size
                return size
    except Exception:
        pass  # Redis unavailable — fall through to L3

    return None  # Cache miss


async def set_cached_size(provider_id: str, bucket: str, path: str, size: int) -> None:
    """Populate L1 + L2 caches."""
    key = _size_cache_key(provider_id, bucket, path)

    # L1
    async with _SIZE_CACHE_LOCK:
        _SIZE_CACHE[key] = size

    # L2
    try:
        redis_settings = await get_configured_redis_settings()
        redis_url = redis_settings.get("url") if redis_settings and redis_settings.get("enabled") else None
        if redis_url:
            await cache_set(redis_url, key, str(size), ttl=_SIZE_CACHE_TTL_REDIS)
    except Exception:
        pass  # Redis unavailable — L1 still works


async def clear_cached_size(provider_id: str, bucket: str) -> None:
    """Clear ALL cached sizes for a (provider, bucket) pair from L1.

    Called after mutations (delete, empty, upload) to force fresh recomputation.
    L2 (Redis) entries expire naturally via TTL (10 min).
    """
    prefix = f"storage:size:{provider_id}:{bucket}:"

    # L1: Clear matching keys from memory
    async with _SIZE_CACHE_LOCK:
        keys_to_remove = [k for k in _SIZE_CACHE if k.startswith(prefix)]
        for k in keys_to_remove:
            del _SIZE_CACHE[k]

    if keys_to_remove:
        logger.info(f"[Cache] Cleared {len(keys_to_remove)} size entries for {provider_id}/{bucket}")
