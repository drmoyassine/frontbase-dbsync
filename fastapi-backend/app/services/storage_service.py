"""
Storage Service — Abstracted multi-provider storage operations.

Provides a unified interface for storage operations across providers.
Each provider has an adapter that translates generic operations to
provider-specific API calls.

Size computation uses L1/L2/L3 caching (Memory → Redis → Compute):
  L1: In-memory dict — instant, lost on restart
  L2: Redis with 10-min TTL — survives restart, shared across workers
  L3: Recursive Supabase API walk — expensive, populates L1 + L2
"""

import httpx
import json
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from app.database.config import SessionLocal
from app.core.credential_resolver import get_provider_context_by_id
from app.services.sync.redis_client import cache_get, cache_set, get_configured_redis_settings

logger = logging.getLogger(__name__)


# ── L1 In-Memory Cache for Storage Sizes ─────────────────────────────
_SIZE_CACHE: Dict[str, int] = {}
_SIZE_CACHE_LOCK = asyncio.Lock()
_SIZE_CACHE_TTL_REDIS = 600  # 10 minutes in Redis


def _size_cache_key(provider_id: str, bucket: str, path: str) -> str:
    """Build a cache key for a (provider, bucket, path) combo."""
    return f"storage:size:{provider_id}:{bucket}:{path or '__root__'}"


async def get_cached_size(provider_id: str, bucket: str, path: str) -> int | None:
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


# ── Abstract Adapter ──────────────────────────────────────────────────

class StorageAdapter(ABC):
    """Base class for all storage provider adapters."""

    @abstractmethod
    async def list_buckets(self) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    async def create_bucket(self, name: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def get_bucket(self, bucket_id: str) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def update_bucket(self, bucket_id: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> None:
        ...

    @abstractmethod
    async def delete_bucket(self, bucket_id: str) -> None:
        ...

    @abstractmethod
    async def empty_bucket(self, bucket_id: str) -> None:
        ...

    @abstractmethod
    async def list_files(self, bucket: str, path: str = "",
                         limit: int = 100, offset: int = 0,
                         search: Optional[str] = None) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    async def upload_file(self, bucket: str, path: str,
                          content: bytes, content_type: str) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def delete_files(self, bucket: str, paths: List[str]) -> None:
        ...

    @abstractmethod
    async def get_signed_url(self, bucket: str, path: str,
                             expires_in: int = 3600) -> str:
        ...

    @abstractmethod
    async def get_public_url(self, bucket: str, path: str) -> str:
        ...

    @abstractmethod
    async def move_file(self, bucket: str, source_key: str,
                        destination_key: str) -> None:
        ...

    @abstractmethod
    async def create_folder(self, bucket: str, folder_path: str) -> None:
        ...

    async def compute_folder_size(self, bucket: str, path: str = "") -> int:
        """Recursively compute the total size of all files under a path.

        Uses concurrent traversal (asyncio.gather) for subfolders and
        catches per-folder errors so a single failed subfolder doesn't
        break the entire computation.
        """
        import asyncio

        total_file_size = 0
        subfolder_paths: list[str] = []
        offset = 0
        batch_size = 1000

        # 1. Walk the current level — collect file sizes + subfolder names
        while True:
            try:
                items = await self.list_files(
                    bucket=bucket, path=path, limit=batch_size, offset=offset
                )
            except Exception:
                break  # API error at this level — give up on this path
            if not items:
                break
            for item in items:
                if item.get("isFolder"):
                    folder_name = item.get("name", "")
                    sub = f"{path}/{folder_name}" if path else folder_name
                    subfolder_paths.append(sub)
                else:
                    total_file_size += item.get("size", 0)
            if len(items) < batch_size:
                break
            offset += batch_size

        # 2. Recurse into subfolders concurrently
        if subfolder_paths:
            results = await asyncio.gather(
                *[self.compute_folder_size(bucket, sp) for sp in subfolder_paths],
                return_exceptions=True,
            )
            for r in results:
                if isinstance(r, int):
                    total_file_size += r
                # Exceptions are silently skipped (that subfolder contributes 0)

        return total_file_size

    async def list_files_with_folder_sizes(
        self, bucket: str, path: str = "",
        limit: int = 100, offset: int = 0,
        search: str | None = None,
    ) -> list[dict[str, Any]]:
        """List files and enrich folder entries with recursively computed sizes."""
        import asyncio
        items = await self.list_files(bucket, path, limit, offset, search)

        # Identify folders that need size computation
        folder_indices: list[int] = []
        for i, item in enumerate(items):
            if item.get("isFolder"):
                folder_indices.append(i)

        if folder_indices:
            async def _get_folder_size(idx: int) -> tuple[int, int]:
                folder_name = items[idx].get("name", "")
                sub_path = f"{path}/{folder_name}" if path else folder_name
                sz = await self.compute_folder_size(bucket, sub_path)
                return idx, sz

            results = await asyncio.gather(
                *[_get_folder_size(i) for i in folder_indices]
            )
            for idx, sz in results:
                items[idx]["size"] = sz

        return items


# ── Supabase Adapter ─────────────────────────────────────────────────

class SupabaseStorageAdapter(StorageAdapter):
    """Storage adapter for Supabase (S3-compatible via Supabase Storage API)."""

    def __init__(self, api_url: str, auth_key: str):
        self.base_url = f"{api_url}/storage/v1"
        self.headers = {
            "apikey": auth_key,
            "Authorization": f"Bearer {auth_key}",
        }

    async def list_buckets(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self.base_url}/bucket", headers=self.headers)
        if not res.is_success:
            raise Exception(f"Failed to list buckets: {res.text}")
        return res.json()

    async def create_bucket(self, name: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"id": name, "name": name, "public": public}
        if file_size_limit:
            payload["file_size_limit"] = file_size_limit
        if allowed_mime_types:
            payload["allowed_mime_types"] = allowed_mime_types

        async with httpx.AsyncClient() as client:
            res = await client.post(f"{self.base_url}/bucket", json=payload, headers=self.headers)
        if not res.is_success:
            raise Exception(f"Failed to create bucket: {res.text}")
        return res.json()

    async def get_bucket(self, bucket_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self.base_url}/bucket/{bucket_id}", headers=self.headers)
        if not res.is_success:
            raise Exception(f"Failed to get bucket: {res.text}")
        return res.json()

    async def update_bucket(self, bucket_id: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> None:
        payload: Dict[str, Any] = {"public": public}
        if file_size_limit is not None:
            payload["file_size_limit"] = file_size_limit
        if allowed_mime_types is not None:
            payload["allowed_mime_types"] = allowed_mime_types

        async with httpx.AsyncClient() as client:
            res = await client.put(f"{self.base_url}/bucket/{bucket_id}", json=payload, headers=self.headers)
        if not res.is_success:
            raise Exception(f"Failed to update bucket: {res.text}")

    async def delete_bucket(self, bucket_id: str) -> None:
        async with httpx.AsyncClient() as client:
            res = await client.delete(f"{self.base_url}/bucket/{bucket_id}", headers=self.headers)
        if not res.is_success:
            raise Exception(f"Failed to delete bucket: {res.text}")

    async def empty_bucket(self, bucket_id: str) -> None:
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{self.base_url}/bucket/{bucket_id}/empty", headers=self.headers)
        if not res.is_success:
            raise Exception(f"Failed to empty bucket: {res.text}")

    async def list_files(self, bucket: str, path: str = "",
                         limit: int = 100, offset: int = 0,
                         search: Optional[str] = None) -> List[Dict[str, Any]]:
        payload: Dict[str, Any] = {
            "prefix": path,
            "limit": limit,
            "offset": offset,
            "sortBy": {"column": "name", "order": "asc"},
        }
        if search:
            payload["search"] = search

        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{self.base_url}/object/list/{bucket}",
                json=payload,
                headers=self.headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to list files: {res.text}")

        # Normalize response
        files = res.json()
        formatted = []
        for f in files:
            is_folder = "metadata" not in f or f["metadata"] is None
            formatted.append({
                "name": f.get("name"),
                "id": f.get("id", f.get("name")),
                "size": f.get("metadata", {}).get("size", 0) if not is_folder else 0,
                "updated_at": f.get("updated_at") or f.get("last_accessed_at") or f.get("created_at"),
                "mimetype": f.get("metadata", {}).get("mimetype") if f.get("metadata") else None,
                "metadata": f.get("metadata"),
                "isFolder": is_folder,
            })
        return formatted

    async def upload_file(self, bucket: str, path: str,
                          content: bytes, content_type: str) -> Dict[str, Any]:
        from urllib.parse import quote
        safe_path = quote(path, safe="/")
        url = f"{self.base_url}/object/{bucket}/{safe_path}"
        headers = {**self.headers, "Content-Type": content_type}

        async with httpx.AsyncClient() as client:
            res = await client.post(url, content=content, headers=headers)
        if not res.is_success:
            raise Exception(f"Failed to upload file: {res.text}")

        public_url = f"{self.base_url}/object/public/{bucket}/{safe_path}"
        return {"path": path, "publicUrl": public_url}

    async def delete_files(self, bucket: str, paths: List[str]) -> None:
        async with httpx.AsyncClient() as client:
            res = await client.request(
                "DELETE",
                f"{self.base_url}/object/{bucket}",
                json={"prefixes": paths},
                headers=self.headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to delete files: {res.text}")

    async def get_signed_url(self, bucket: str, path: str,
                             expires_in: int = 3600) -> str:
        from urllib.parse import quote
        safe_path = quote(path, safe="/")
        url = f"{self.base_url}/object/sign/{bucket}/{safe_path}"

        async with httpx.AsyncClient() as client:
            res = await client.post(url, json={"expiresIn": expires_in}, headers=self.headers)
        if not res.is_success:
            raise Exception(f"Failed to generate signed URL: {res.text}")

        relative_path = res.json().get("signedURL")
        # Supabase returns a relative path — build full URL from base
        base_origin = self.base_url.rsplit("/storage/v1", 1)[0]
        return f"{base_origin}/storage/v1{relative_path}" if relative_path else ""

    async def get_public_url(self, bucket: str, path: str) -> str:
        from urllib.parse import quote
        safe_path = quote(path, safe="/")
        return f"{self.base_url}/object/public/{bucket}/{safe_path}"

    async def move_file(self, bucket: str, source_key: str,
                        destination_key: str) -> None:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{self.base_url}/object/move",
                json={"bucketId": bucket, "sourceKey": source_key, "destinationKey": destination_key},
                headers=self.headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to move file: {res.text}")

    async def create_folder(self, bucket: str, folder_path: str) -> None:
        if folder_path.endswith("/"):
            folder_path = folder_path[:-1]
        target = f"{folder_path}/.folder"
        from urllib.parse import quote
        safe_path = quote(target, safe="/")

        headers = {**self.headers, "Content-Type": "application/x-directory"}
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{self.base_url}/object/{bucket}/{safe_path}",
                content=b"",
                headers=headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to create folder: {res.text}")


# ── Factory ───────────────────────────────────────────────────────────

ADAPTER_REGISTRY: Dict[str, type] = {
    "supabase": SupabaseStorageAdapter,
    # Future: "cloudflare": R2StorageAdapter, etc.
}


def get_storage_adapter(db: Session, storage_provider_id: str) -> StorageAdapter:
    """Resolve a StorageProvider → EdgeProviderAccount → credentials → adapter.

    This is the main entry point for all storage operations.
    """
    from app.models.storage_provider import StorageProvider

    sp = db.query(StorageProvider).filter(
        StorageProvider.id == storage_provider_id,
    ).first()
    if not sp:
        from fastapi import HTTPException
        raise HTTPException(404, f"Storage provider {storage_provider_id} not found")

    # Resolve credentials from the linked account
    ctx = get_provider_context_by_id(db, str(sp.provider_account_id))
    provider_type = str(sp.provider)

    adapter_cls = ADAPTER_REGISTRY.get(provider_type)
    if not adapter_cls:
        from fastapi import HTTPException
        raise HTTPException(400, f"No storage adapter for provider type '{provider_type}'")

    # Build adapter based on provider type
    if provider_type == "supabase":
        api_url = ctx.get("api_url", "")
        # Prefer service_role_key for full access, fallback to anon_key
        auth_key = ctx.get("service_role_key", "") or ctx.get("anon_key", "")
        if not api_url or not auth_key:
            from fastapi import HTTPException
            raise HTTPException(400, "Supabase account missing api_url or keys")
        return SupabaseStorageAdapter(api_url, auth_key)

    from fastapi import HTTPException
    raise HTTPException(400, f"Unsupported storage provider: {provider_type}")
