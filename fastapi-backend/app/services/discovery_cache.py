"""
Provider discovery cache — L1 (in-memory, 15m) + L2 (Redis/Upstash, 1h).

Wraps `provider_discovery.discover_resources` so repeated discovery calls within a
tenant session don't re-hit provider APIs (Cloudflare/Supabase/Turso/etc. rate-limit
and are slow). L1 dedups intra-process; L2 dedups across processes/replicas.

Design (Sprint 3I):
  - Cache key: `provider + sha1(creds)` — stable per credential set; a token
    rotation simply causes one cache miss (acceptable).
  - L1 miss → L2 lookup; an L2 hit backfills L1 so the next call is L1-fast.
  - Invalidation: `invalidate_discovery_cache(provider, account_key?)` clears L1
    and pattern-deletes L2. Call after provision/delete so fresh resources appear.

Both layers degrade gracefully: no Redis configured ⇒ L1-only (still useful on
the long-lived Docker backend).
"""

from __future__ import annotations

import hashlib
import json
import time
import logging
from typing import Optional

from .sync.redis_client import cache_get, cache_set, cache_delete_pattern, get_configured_redis_settings

logger = logging.getLogger(__name__)

L1_TTL_SECONDS = 15 * 60       # 15 minutes — intra-process dedup
L2_TTL_SECONDS = 60 * 60       # 1 hour — cross-process

# L1 store: key -> (value, expires_at_monotonic)
_L1: dict[str, tuple[dict, float]] = {}

# Effectiveness counters (surfaced via /api/health diagnostics)
_discover_cache_hits = 0
_discover_cache_misses = 0


def _account_key(provider: str, creds: dict) -> str:
    """Stable cache key from provider + creds (sha1 of the sorted JSON)."""
    raw = json.dumps(creds or {}, sort_keys=True, default=str)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]
    return f"discover:{provider}:{digest}"


async def _l2_url() -> Optional[str]:
    """Resolve the configured Redis URL for L2, or None if caching is off."""
    settings = await get_configured_redis_settings()
    if settings and settings.get("enabled"):
        return settings.get("url") or None
    return None


async def get_cached_discovery(provider: str, creds: dict) -> Optional[dict]:
    """Return cached discovery result (L1 then L2), or None on miss."""
    global _discover_cache_hits, _discover_cache_misses
    key = _account_key(provider, creds)

    # L1
    entry = _L1.get(key)
    if entry and entry[1] > time.time():
        _discover_cache_hits += 1
        return entry[0]
    if entry:
        _L1.pop(key, None)  # expired

    # L2
    url = await _l2_url()
    if url:
        cached = await cache_get(url, key)
        if cached is not None:
            # backfill L1 with a fresh L1 TTL
            _L1[key] = (cached, time.time() + L1_TTL_SECONDS)
            _discover_cache_hits += 1
            return cached

    _discover_cache_misses += 1
    return None


async def set_cached_discovery(provider: str, creds: dict, value: dict) -> None:
    """Store a discovery result in L1 (always) and L2 (if configured)."""
    key = _account_key(provider, creds)
    _L1[key] = (value, time.time() + L1_TTL_SECONDS)
    url = await _l2_url()
    if url:
        await cache_set(url, key, value, L2_TTL_SECONDS)


async def invalidate_discovery_cache(provider: Optional[str] = None, creds: Optional[dict] = None) -> None:
    """Invalidate cached discovery results.

    - With `provider` + `creds`: clears that single account's entry.
    - With `provider` only: clears all entries for that provider (L2 pattern delete).
    - With neither: clears everything (use sparingly).
    """
    # L1 — clear matching keys
    if provider and creds:
        key = _account_key(provider, creds)
        _L1.pop(key, None)
    elif provider:
        prefix = f"discover:{provider}:"
        for k in [k for k in _L1 if k.startswith(prefix)]:
            _L1.pop(k, None)
    else:
        _L1.clear()

    # L2 — pattern delete (best-effort; no-op without Redis)
    url = await _l2_url()
    if url:
        pattern = f"discover:{provider}:{'*' if provider else '*'}"
        try:
            await cache_delete_pattern(url, pattern if provider else "discover:*")
        except Exception as e:  # noqa: BLE001
            logger.warning("[discovery_cache] L2 invalidate failed: %s", e)


def get_discovery_cache_stats() -> dict:
    """Effectiveness counters for /api/health diagnostics."""
    total = _discover_cache_hits + _discover_cache_misses
    return {
        "hits": _discover_cache_hits,
        "misses": _discover_cache_misses,
        "hit_rate": round(_discover_cache_hits / total, 4) if total else None,
        "l1_entries": len(_L1),
    }


def _reset_discovery_cache_for_tests() -> None:
    """Test-only: clear L1 + counters."""
    global _discover_cache_hits, _discover_cache_misses
    _L1.clear()
    _discover_cache_hits = 0
    _discover_cache_misses = 0
