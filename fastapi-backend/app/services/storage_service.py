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


# ── Cloudflare R2 Adapter ─────────────────────────────────────────────

class CloudflareR2Adapter(StorageAdapter):
    """Storage adapter for Cloudflare R2 (via CF REST API v4)."""

    def __init__(self, api_token: str, account_id: str):
        self.api_token = api_token
        self.account_id = account_id
        self.base_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        self.headers = {"Authorization": f"Bearer {api_token}"}

    async def _get(self, path: str) -> Any:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self.base_url}{path}", headers=self.headers)
        if not res.is_success:
            raise Exception(f"CF R2 API error: {res.text}")
        data = res.json()
        return data.get("result", data)

    async def _post(self, path: str, payload: Dict[str, Any] | None = None) -> Any:
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{self.base_url}{path}", json=payload or {}, headers=self.headers)
        if not res.is_success:
            raise Exception(f"CF R2 API error: {res.text}")
        data = res.json()
        return data.get("result", data)

    async def _delete(self, path: str) -> None:
        async with httpx.AsyncClient() as client:
            res = await client.delete(f"{self.base_url}{path}", headers=self.headers)
        if not res.is_success:
            raise Exception(f"CF R2 API error: {res.text}")

    async def list_buckets(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{self.base_url}/r2/buckets", headers=self.headers
            )
        if res.status_code == 403:
            logger.warning(
                "CF API token lacks R2 permission — return empty. "
                "Re-create the token with 'Workers R2 Storage:Read' scope."
            )
            return []
        if not res.is_success:
            raise Exception(f"CF R2 API error: {res.text}")
        data = res.json()
        result = data.get("result", data)
        buckets = result if isinstance(result, list) else result.get("buckets", [])
        return [
            {
                "id": b.get("name"),
                "name": b.get("name"),
                "public": False,
                "created_at": b.get("creation_date"),
            }
            for b in buckets
        ]

    async def create_bucket(self, name: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> Dict[str, Any]:
        result = await self._post("/r2/buckets", {"name": name})
        return {"id": name, "name": name, "public": False, "created_at": None}

    async def get_bucket(self, bucket_id: str) -> Dict[str, Any]:
        result = await self._get(f"/r2/buckets/{bucket_id}")
        return {
            "id": result.get("name", bucket_id),
            "name": result.get("name", bucket_id),
            "public": False,
            "created_at": result.get("creation_date"),
        }

    async def update_bucket(self, bucket_id: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> None:
        # R2 doesn't support bucket-level settings update via REST
        logger.info(f"R2 update_bucket is a no-op for {bucket_id}")

    async def delete_bucket(self, bucket_id: str) -> None:
        await self._delete(f"/r2/buckets/{bucket_id}")

    async def empty_bucket(self, bucket_id: str) -> None:
        # R2 doesn't have a native "empty bucket" — delete all objects
        files = await self.list_files(bucket_id)
        if files:
            paths = [f["name"] for f in files if not f.get("isFolder")]
            if paths:
                await self.delete_files(bucket_id, paths)

    async def list_files(self, bucket: str, path: str = "",
                         limit: int = 100, offset: int = 0,
                         search: Optional[str] = None) -> List[Dict[str, Any]]:
        # Use CF R2 API to list objects in a bucket
        params: Dict[str, Any] = {"per_page": limit}
        if path:
            params["prefix"] = path if path.endswith("/") else f"{path}/"
        params["delimiter"] = "/"

        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{self.base_url}/r2/buckets/{bucket}/objects",
                params=params,
                headers=self.headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to list R2 objects: {res.text}")

        data = res.json().get("result", {})
        objects = data.get("objects", [])
        prefixes = data.get("delimited_prefixes", [])

        formatted = []
        # Folders (common prefixes)
        for prefix in prefixes:
            folder_name = prefix.rstrip("/").rsplit("/", 1)[-1]
            formatted.append({
                "name": folder_name,
                "id": prefix,
                "size": 0,
                "updated_at": None,
                "mimetype": None,
                "isFolder": True,
            })
        # Files
        for obj in objects:
            key = obj.get("key", "")
            name = key.rsplit("/", 1)[-1] if "/" in key else key
            if not name or name.endswith("/"):
                continue
            formatted.append({
                "name": name,
                "id": key,
                "size": obj.get("size", 0),
                "updated_at": obj.get("last_modified"),
                "mimetype": obj.get("http_metadata", {}).get("contentType"),
                "isFolder": False,
            })
        return formatted

    async def upload_file(self, bucket: str, path: str,
                          content: bytes, content_type: str) -> Dict[str, Any]:
        headers = {**self.headers, "Content-Type": content_type}
        async with httpx.AsyncClient() as client:
            res = await client.put(
                f"{self.base_url}/r2/buckets/{bucket}/objects/{path}",
                content=content,
                headers=headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to upload to R2: {res.text}")
        return {"path": path}

    async def delete_files(self, bucket: str, paths: List[str]) -> None:
        for path in paths:
            await self._delete(f"/r2/buckets/{bucket}/objects/{path}")

    async def get_signed_url(self, bucket: str, path: str,
                             expires_in: int = 3600) -> str:
        raise Exception("R2 signed URLs require S3-compatible presigning (not yet implemented)")

    async def get_public_url(self, bucket: str, path: str) -> str:
        # R2 custom domains required for public access
        return f"https://{self.account_id}.r2.cloudflarestorage.com/{bucket}/{path}"

    async def move_file(self, bucket: str, source_key: str,
                        destination_key: str) -> None:
        raise Exception("R2 move requires S3 copy+delete (not yet implemented)")

    async def create_folder(self, bucket: str, folder_path: str) -> None:
        # R2 is flat — create a placeholder object
        if not folder_path.endswith("/"):
            folder_path += "/"
        await self.upload_file(bucket, folder_path, b"", "application/x-directory")


# ── Vercel Blob Adapter ──────────────────────────────────────────────

class VercelBlobAdapter(StorageAdapter):
    """Storage adapter for Vercel Blob stores."""

    def __init__(self, api_token: str):
        self.api_token = api_token
        self.headers = {"Authorization": f"Bearer {api_token}"}

    async def list_buckets(self) -> List[Dict[str, Any]]:
        """List Vercel projects as 'buckets' (each project can use Vercel Blob).

        Vercel doesn't expose a /v1/blob/stores list endpoint.
        Projects are the correct unit — each one can have Blob storage.
        """
        async with httpx.AsyncClient() as client:
            res = await client.get(
                "https://api.vercel.com/v9/projects",
                headers=self.headers,
                params={"limit": 100},
            )
        if not res.is_success:
            logger.warning(f"Vercel projects API failed: {res.status_code}")
            return []
        data = res.json()
        projects = data.get("projects", [])
        return [
            {
                "id": p.get("id", ""),
                "name": p.get("name", p.get("id", "")),
                "public": True,
                "created_at": p.get("createdAt"),
            }
            for p in projects
        ]

    async def create_bucket(self, name: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> Dict[str, Any]:
        raise Exception("Vercel Blob stores are created via the Vercel dashboard or CLI")

    async def get_bucket(self, bucket_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://api.vercel.com/v1/blob/stores/{bucket_id}",
                headers=self.headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to get Vercel Blob store: {res.text}")
        s = res.json()
        return {
            "id": s.get("storeId", bucket_id),
            "name": s.get("name", bucket_id),
            "public": True,
            "created_at": s.get("createdAt"),
        }

    async def update_bucket(self, bucket_id: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> None:
        logger.info(f"Vercel Blob store update is a no-op for {bucket_id}")

    async def delete_bucket(self, bucket_id: str) -> None:
        raise Exception("Vercel Blob stores cannot be deleted via API")

    async def empty_bucket(self, bucket_id: str) -> None:
        files = await self.list_files(bucket_id)
        if files:
            urls = [f["id"] for f in files if not f.get("isFolder")]
            if urls:
                await self.delete_files(bucket_id, urls)

    async def list_files(self, bucket: str, path: str = "",
                         limit: int = 100, offset: int = 0,
                         search: Optional[str] = None) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {"limit": limit, "storeId": bucket}
        if path:
            params["prefix"] = path if path.endswith("/") else f"{path}/"
        if offset:
            # Vercel uses cursor-based pagination; offset not natively supported
            pass

        async with httpx.AsyncClient() as client:
            res = await client.get(
                "https://api.vercel.com/v1/blob",
                params=params,
                headers=self.headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to list Vercel Blobs: {res.text}")

        data = res.json()
        blobs = data.get("blobs", [])
        folders = data.get("folders", [])

        formatted = []
        for folder in folders:
            folder_name = folder.rstrip("/").rsplit("/", 1)[-1] if "/" in folder else folder.rstrip("/")
            formatted.append({
                "name": folder_name,
                "id": folder,
                "size": 0,
                "updated_at": None,
                "mimetype": None,
                "isFolder": True,
            })
        for blob in blobs:
            pathname = blob.get("pathname", "")
            name = pathname.rsplit("/", 1)[-1] if "/" in pathname else pathname
            formatted.append({
                "name": name,
                "id": blob.get("url", pathname),
                "size": blob.get("size", 0),
                "updated_at": blob.get("uploadedAt"),
                "mimetype": blob.get("contentType"),
                "isFolder": False,
            })
        return formatted

    async def upload_file(self, bucket: str, path: str,
                          content: bytes, content_type: str) -> Dict[str, Any]:
        headers = {
            **self.headers,
            "Content-Type": content_type,
            "x-api-blob-store-id": bucket,
        }
        async with httpx.AsyncClient() as client:
            res = await client.put(
                f"https://api.vercel.com/v1/blob/{path}",
                content=content,
                headers=headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to upload to Vercel Blob: {res.text}")
        data = res.json()
        return {"path": path, "publicUrl": data.get("url", "")}

    async def delete_files(self, bucket: str, paths: List[str]) -> None:
        # Vercel Blob delete by URL
        async with httpx.AsyncClient() as client:
            res = await client.request(
                "DELETE",
                "https://api.vercel.com/v1/blob",
                json={"urls": paths},
                headers=self.headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to delete Vercel Blobs: {res.text}")

    async def get_signed_url(self, bucket: str, path: str,
                             expires_in: int = 3600) -> str:
        raise Exception("Vercel Blob signed URLs are not available via REST API")

    async def get_public_url(self, bucket: str, path: str) -> str:
        # Vercel Blob URLs are public by default — but need the actual blob URL
        return path  # path is typically the full URL for Vercel Blobs

    async def move_file(self, bucket: str, source_key: str,
                        destination_key: str) -> None:
        raise Exception("Vercel Blob does not support move/rename via API")

    async def create_folder(self, bucket: str, folder_path: str) -> None:
        # Vercel Blob is flat key-value — folders are virtual
        if not folder_path.endswith("/"):
            folder_path += "/"
        await self.upload_file(bucket, f"{folder_path}.folder", b"", "application/x-directory")


# ── Netlify Blobs Adapter ────────────────────────────────────────────

class NetlifyBlobsAdapter(StorageAdapter):
    """Storage adapter for Netlify Blobs (per-site blob stores)."""

    def __init__(self, api_token: str):
        self.api_token = api_token
        self.headers = {"Authorization": f"Bearer {api_token}"}
        self.base_url = "https://api.netlify.com/api/v1"

    async def list_buckets(self) -> List[Dict[str, Any]]:
        """List Netlify sites as 'buckets' (each site has its own blob store)."""
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{self.base_url}/sites",
                headers=self.headers,
                params={"per_page": 100},
            )
        if not res.is_success:
            raise Exception(f"Failed to list Netlify sites: {res.text}")
        sites = res.json()
        return [
            {
                "id": s.get("id", ""),
                "name": s.get("name", s.get("id", "")),
                "public": True,
                "created_at": s.get("created_at"),
            }
            for s in sites
        ]

    async def create_bucket(self, name: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> Dict[str, Any]:
        raise Exception("Netlify Blobs are per-site — create a Netlify site first")

    async def get_bucket(self, bucket_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{self.base_url}/sites/{bucket_id}",
                headers=self.headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to get Netlify site: {res.text}")
        s = res.json()
        return {
            "id": s.get("id", bucket_id),
            "name": s.get("name", bucket_id),
            "public": True,
            "created_at": s.get("created_at"),
        }

    async def update_bucket(self, bucket_id: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> None:
        logger.info(f"Netlify Blobs update_bucket is a no-op for {bucket_id}")

    async def delete_bucket(self, bucket_id: str) -> None:
        raise Exception("Cannot delete a Netlify site via the Blobs adapter")

    async def empty_bucket(self, bucket_id: str) -> None:
        raise Exception("Netlify Blobs empty is not yet supported")

    async def list_files(self, bucket: str, path: str = "",
                         limit: int = 100, offset: int = 0,
                         search: Optional[str] = None) -> List[Dict[str, Any]]:
        # Netlify Blobs API — list deployed files for a site
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{self.base_url}/sites/{bucket}/files",
                headers=self.headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to list Netlify files: {res.text}")

        files = res.json()
        formatted = []
        prefix = (path + "/") if path else ""
        for f in files:
            file_path = f.get("path", "").lstrip("/")
            if prefix and not file_path.startswith(prefix):
                continue
            relative = file_path[len(prefix):] if prefix else file_path
            # Skip nested files (only show immediate children)
            if "/" in relative:
                # Extract top-level folder name
                folder_name = relative.split("/")[0]
                if not any(item["name"] == folder_name and item["isFolder"] for item in formatted):
                    formatted.append({
                        "name": folder_name,
                        "id": f"{prefix}{folder_name}/",
                        "size": 0,
                        "updated_at": None,
                        "mimetype": None,
                        "isFolder": True,
                    })
                continue
            if not relative:
                continue
            formatted.append({
                "name": relative,
                "id": file_path,
                "size": f.get("size", 0),
                "updated_at": None,
                "mimetype": f.get("mime_type"),
                "isFolder": False,
            })
        return formatted[:limit]

    async def upload_file(self, bucket: str, path: str,
                          content: bytes, content_type: str) -> Dict[str, Any]:
        raise Exception("Netlify Blobs upload requires deploy context (not yet supported)")

    async def delete_files(self, bucket: str, paths: List[str]) -> None:
        raise Exception("Netlify Blobs delete requires deploy context (not yet supported)")

    async def get_signed_url(self, bucket: str, path: str,
                             expires_in: int = 3600) -> str:
        raise Exception("Netlify Blobs does not support signed URLs")

    async def get_public_url(self, bucket: str, path: str) -> str:
        # Get site URL first
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{self.base_url}/sites/{bucket}",
                headers=self.headers,
            )
        if not res.is_success:
            return f"https://{bucket}.netlify.app/{path}"
        site = res.json()
        url = site.get("ssl_url") or site.get("url") or f"https://{bucket}.netlify.app"
        return f"{url}/{path}"

    async def move_file(self, bucket: str, source_key: str,
                        destination_key: str) -> None:
        raise Exception("Netlify Blobs does not support move/rename")

    async def create_folder(self, bucket: str, folder_path: str) -> None:
        raise Exception("Netlify Blobs does not support folder creation via API")


# ── Factory ───────────────────────────────────────────────────────────

ADAPTER_REGISTRY: Dict[str, type] = {
    "supabase": SupabaseStorageAdapter,
    "cloudflare": CloudflareR2Adapter,
    "vercel": VercelBlobAdapter,
    "netlify": NetlifyBlobsAdapter,
}


def get_storage_adapter(db: Session, storage_provider_id: str) -> StorageAdapter:
    """Resolve a StorageProvider → EdgeProviderAccount → credentials → adapter.

    This is the main entry point for all storage operations.
    Uses the adapter registry to map provider type → adapter class,
    then builds the adapter with provider-specific credentials.
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

    # ── Build adapter with provider-specific credentials ──────────────
    if provider_type == "supabase":
        api_url = ctx.get("api_url", "")
        auth_key = ctx.get("service_role_key", "") or ctx.get("anon_key", "")
        if not api_url or not auth_key:
            from fastapi import HTTPException
            raise HTTPException(400, "Supabase account missing api_url or keys")
        return SupabaseStorageAdapter(api_url, auth_key)

    if provider_type == "cloudflare":
        api_token = ctx.get("api_token", "")
        if not api_token:
            from fastapi import HTTPException
            raise HTTPException(400, "Cloudflare account missing api_token")
        # Resolve account_id from metadata or first account
        account_id = ctx.get("account_id", "")
        if not account_id:
            # Fetch first account ID via CF API
            try:
                import httpx as _httpx
                resp = _httpx.get(
                    "https://api.cloudflare.com/client/v4/accounts",
                    headers={"Authorization": f"Bearer {api_token}"},
                    params={"per_page": 1},
                )
                if resp.is_success:
                    accounts = resp.json().get("result", [])
                    if accounts:
                        account_id = accounts[0]["id"]
            except Exception:
                pass
        if not account_id:
            from fastapi import HTTPException
            raise HTTPException(400, "Could not resolve Cloudflare account ID for R2")
        return CloudflareR2Adapter(api_token, account_id)

    if provider_type == "vercel":
        api_token = ctx.get("api_token", "")
        if not api_token:
            from fastapi import HTTPException
            raise HTTPException(400, "Vercel account missing api_token")
        return VercelBlobAdapter(api_token)

    if provider_type == "netlify":
        api_token = ctx.get("api_token", "")
        if not api_token:
            from fastapi import HTTPException
            raise HTTPException(400, "Netlify account missing api_token")
        return NetlifyBlobsAdapter(api_token)

    from fastapi import HTTPException
    raise HTTPException(400, f"Unsupported storage provider: {provider_type}")
