"""
Redis-backed progress store for WordPress imports.

Replaces the in-memory ImportProgressStore with a Redis-backed implementation
that works across multiple workers. Designed for production deployments with
gunicorn -w N or similar multi-worker configurations.

Key differences from in-memory store:
- Data survives worker restarts (within TTL)
- Works across multiple workers
- Slightly higher latency (Redis network call)
- Requires Redis to be configured

Usage:
    from app.services.wordpress.redis_progress_store import RedisImportProgressStore

    store = RedisImportProgressStore()
    service = WordPressImportService(store=store)
"""

from __future__ import annotations

import logging
import time
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.sync.redis_client import cache_get, cache_set, cache_delete_pattern, get_configured_redis_settings

logger = logging.getLogger(__name__)

# Redis key prefix for WordPress import state
_WP_IMPORT_KEY_PREFIX = "wp:import:state:"

# Default TTL for import state (24 hours - imports should complete faster)
_DEFAULT_TTL = 86400


def _import_state_key(import_id: str) -> str:
    """Generate Redis key for an import state."""
    return f"{_WP_IMPORT_KEY_PREFIX}{import_id}"


def _serialize_state(state: Dict[str, Any]) -> str:
    """Serialize state dict to JSON string."""
    import json
    return json.dumps(state, default=str)


def _deserialize_state(raw: str) -> Optional[Dict[str, Any]]:
    """Deserialize JSON string to state dict."""
    import json
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to deserialize import state")
        return None


class RedisImportProgressStore:
    """Redis-backed import progress store for multi-worker deployments.

    CRITICAL: Tenant isolation is enforced via ``check_tenant_access`` — every
    public read access MUST call it before returning data. The store tracks
    ``tenant_id`` + ``datasource_id`` for ownership validation.

    This store is compatible with the in-memory store's interface — all methods
    have the same signatures and return types.
    """

    def __init__(self, ttl: int = _DEFAULT_TTL) -> None:
        """Initialize the Redis-backed store.

        Args:
            ttl: Time-to-live for import state in seconds (default 24 hours).
                 Terminal state imports are kept longer for debugging.
        """
        self._ttl = ttl
        self._terminal_ttl = ttl * 7  # Keep terminal states 7x longer

    async def create(
        self,
        import_id: str,
        tenant_id: Optional[str],
        datasource_id: str,
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new import state in Redis."""
        from app.services.wordpress.import_service import _utcnow_iso

        state = {
            "import_id": import_id,
            "tenant_id": tenant_id,
            "datasource_id": datasource_id,
            "status": "pending",
            "started_at": _utcnow_iso(),
            "completed_at": None,
            "total_records": 0,
            "processed_records": 0,
            "failed_records": 0,
            "current_post_type": None,
            "current_page": None,
            "total_pages": None,
            "errors": [],
            "per_post_type": {},
            "url_mappings": {},
            "options": options,
            "result": None,
        }

        key = _import_state_key(import_id)
        await cache_set(None, key, state, ttl=self._ttl)
        logger.info("Created import state %s in Redis for tenant %s", import_id, tenant_id)
        return state

    def _get(self, import_id: str) -> Optional[Dict[str, Any]]:
        """Internal get without tenant check (for system access).

        Note: This is a synchronous wrapper for the async cache_get.
        The actual method returns a coroutine that must be awaited.
        """
        raise NotImplementedError("Use async get() method")

    async def _get_async(self, import_id: str) -> Optional[Dict[str, Any]]:
        """Async internal get without tenant check."""
        key = _import_state_key(import_id)
        data = await cache_get(None, key)
        return data if isinstance(data, dict) else None

    async def get(self, import_id: str, tenant_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """Get import state ONLY if tenant owns it. Returns None if not found or wrong tenant."""
        state = await self._get_async(import_id)
        if not state:
            return None

        # Master (tenant_id=None) can see imports with no tenant_id
        # Tenant users can ONLY see their own imports
        if tenant_id is None:
            # Master/self-host: can only see imports created with no tenant
            return state if state.get("tenant_id") is None else None
        # Tenant user: must match exact tenant_id
        return state if state.get("tenant_id") == tenant_id else None

    async def progress(self, import_id: str, tenant_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """Get progress payload for an import."""
        state = await self.get(import_id, tenant_id)
        if not state:
            return None

        # Return camelCase progress payload (matches WordPressImportProgress)
        return {
            "status": state.get("status"),
            "startedAt": state.get("started_at"),
            "completedAt": state.get("completed_at"),
            "totalRecords": state.get("total_records", 0),
            "processedRecords": state.get("processed_records", 0),
            "failedRecords": state.get("failed_records", 0),
            "currentPostType": state.get("current_post_type"),
            "currentPage": state.get("current_page"),
            "totalPages": state.get("total_pages"),
            "errors": list(state.get("errors", [])[-50:]),  # Cap to keep payloads small
        }

    async def result(self, import_id: str, tenant_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """Get final result for an import."""
        state = await self.get(import_id, tenant_id)
        if not state:
            return None
        return state.get("result") if state.get("result") else None

    async def check_tenant_access(
        self, import_id: str, tenant_id: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        """Validate tenant access and return state if OK, None if denied."""
        return await self.get(import_id, tenant_id)

    async def update_progress(
        self,
        import_id: str,
        **updates: Any
    ) -> bool:
        """Update specific fields in the import state.

        This is used by the background task to update progress without
        rewriting the entire state.
        """
        state = await self._get_async(import_id)
        if not state:
            return False

        # Apply updates
        for key, value in updates.items():
            # Convert camelCase keys from service to snake_case for storage
            snake_key = key.replace("processedRecords", "processed_records") \
                          .replace("failedRecords", "failed_records") \
                          .replace("totalRecords", "total_records") \
                          .replace("currentPostType", "current_post_type") \
                          .replace("currentPage", "current_page") \
                          .replace("totalPages", "total_pages") \
                          .replace("startedAt", "started_at") \
                          .replace("completedAt", "completed_at")
            state[snake_key] = value

        # Determine TTL based on status
        ttl = self._terminal_ttl if state.get("status") in ("completed", "failed", "partial") else self._ttl

        key = _import_state_key(import_id)
        await cache_set(None, key, state, ttl=ttl)
        return True

    async def set_terminal_state(
        self,
        import_id: str,
        status: str,
        completed_at: str,
        result: Dict[str, Any],
    ) -> bool:
        """Set terminal state and result for an import."""
        state = await self._get_async(import_id)
        if not state:
            return False

        state["status"] = status
        state["completed_at"] = completed_at
        state["result"] = result

        key = _import_state_key(import_id)
        await cache_set(None, key, state, ttl=self._terminal_ttl)
        logger.info("Set terminal state %s for import %s", status, import_id)
        return True

    async def cleanup_old(self, max_age_seconds: int = 3600) -> int:
        """Clean up completed imports older than max_age_seconds.

        Note: This is expensive for Redis as it requires scanning all keys.
        In production, consider using Redis keys with expiration or a
        separate cleanup strategy.

        Returns:
            Count of imports cleaned up.
        """
        # For Redis, we rely on TTL for automatic cleanup
        # This method is a no-op but kept for interface compatibility
        logger.debug("Redis store uses TTL for automatic cleanup (no manual cleanup needed)")
        return 0

    async def list_tenant_imports(
        self,
        tenant_id: Optional[str],
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """List all imports for a tenant.

        This is a convenience method for admin dashboards.
        Requires scanning keys - use sparingly.
        """
        # This requires Redis SCAN which is expensive
        # Implement only if needed for UI
        logger.warning("list_tenant_imports not implemented for Redis store (requires SCAN)")
        return []


def get_redis_import_store(ttl: int = _DEFAULT_TTL) -> RedisImportProgressStore:
    """Factory function to get a Redis-backed import store.

    This allows the store to be swapped at deployment time:

        # In production with Redis
        store = get_redis_import_store()

        # In development (fallback to in-memory)
        if not store:
            from app.services.wordpress.import_service import ImportProgressStore
            store = ImportProgressStore()
    """
    return RedisImportProgressStore(ttl=ttl)
