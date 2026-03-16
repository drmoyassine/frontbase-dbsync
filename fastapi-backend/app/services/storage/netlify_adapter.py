"""Netlify Blobs Storage Adapter — via Netlify REST API.

Uses the same endpoints as @netlify/blobs SDK internally:
  Base: https://api.netlify.com/api/v1/blobs/{siteID}
  Auth: Authorization: Bearer {api_token}

Stores are site-wide, prefixed with 'site:' (e.g. store "images" → "site:images").
"""

import httpx
import logging
from typing import Optional, List, Dict, Any

from app.services.storage.base import StorageAdapter

logger = logging.getLogger(__name__)


class NetlifyBlobsAdapter(StorageAdapter):
    """Storage adapter for Netlify Blobs via the REST API."""

    STORE_PREFIX = "site:"
    SIGNED_URL_ACCEPT = "application/json;type=signed-url"

    def __init__(self, api_token: str, site_id: str):
        self.api_token = api_token
        self.site_id = site_id
        self.headers = {"Authorization": f"Bearer {api_token}"}
        self.blobs_url = f"https://api.netlify.com/api/v1/blobs/{site_id}"
        self.api_url = "https://api.netlify.com/api/v1"

    def _store_name(self, name: str) -> str:
        """Add 'site:' prefix for the internal API."""
        if name.startswith(self.STORE_PREFIX):
            return name
        return f"{self.STORE_PREFIX}{name}"

    def _strip_prefix(self, name: str) -> str:
        """Strip 'site:' prefix for display."""
        if name.startswith(self.STORE_PREFIX):
            return name[len(self.STORE_PREFIX):]
        return name

    async def list_buckets(self) -> List[Dict[str, Any]]:
        """List all site-wide stores as buckets."""
        stores: List[str] = []
        cursor: Optional[str] = None
        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                params: Dict[str, str] = {"prefix": self.STORE_PREFIX}
                if cursor:
                    params["cursor"] = cursor
                res = await client.get(
                    self.blobs_url, headers=self.headers, params=params,
                )
                if res.status_code == 404:
                    break
                if not res.is_success:
                    raise Exception(f"Failed to list Netlify stores: {res.text}")
                data = res.json()
                stores.extend(data.get("stores", []))
                cursor = data.get("next_cursor")
                if not cursor:
                    break

        return [
            {
                "id": self._strip_prefix(s),
                "name": self._strip_prefix(s),
                "public": True,
                "created_at": None,
            }
            for s in stores
            if s.startswith(self.STORE_PREFIX)
        ]

    async def create_bucket(self, name: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> Dict[str, Any]:
        """Create a store by writing a marker blob (stores auto-create on first write)."""
        store = self._store_name(name)
        url = f"{self.blobs_url}/{store}/.frontbase-init"
        # Step 1: Get signed URL
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.put(
                url,
                headers={**self.headers, "Accept": self.SIGNED_URL_ACCEPT},
                content=b"",
            )
        if not res.is_success:
            raise Exception(f"Failed to get signed URL for store creation: {res.text}")
        signed_url = res.json().get("url")
        if not signed_url:
            raise Exception("No signed URL returned from Netlify API")
        # Step 2: Write marker to signed URL
        async with httpx.AsyncClient(timeout=30) as client:
            res2 = await client.put(signed_url, content=b"frontbase-init")
        if not res2.is_success:
            raise Exception(f"Failed to create store marker: {res2.text}")
        return {"id": name, "name": name, "public": True, "created_at": None}

    async def get_bucket(self, bucket_id: str) -> Dict[str, Any]:
        """Get store info (stores don't have metadata, return name)."""
        return {
            "id": bucket_id,
            "name": bucket_id,
            "public": True,
            "created_at": None,
        }

    async def update_bucket(self, bucket_id: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> None:
        logger.info(f"Netlify Blobs update_bucket is a no-op for {bucket_id}")

    async def delete_bucket(self, bucket_id: str) -> None:
        """Delete a store by deleting all its blobs (store auto-deletes when empty)."""
        await self.empty_bucket(bucket_id)

    async def empty_bucket(self, bucket_id: str) -> None:
        """Delete all blobs in a store."""
        store = self._store_name(bucket_id)
        cursor: Optional[str] = None
        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                params: Dict[str, str] = {}
                if cursor:
                    params["cursor"] = cursor
                res = await client.get(
                    f"{self.blobs_url}/{store}",
                    headers=self.headers,
                    params=params,
                )
                if res.status_code == 404:
                    break
                if not res.is_success:
                    raise Exception(f"Failed to list blobs for empty: {res.text}")
                data = res.json()
                blobs = data.get("blobs", [])
                for blob in blobs:
                    key = blob.get("key", "")
                    if key:
                        await client.delete(
                            f"{self.blobs_url}/{store}/{key}",
                            headers=self.headers,
                        )
                cursor = data.get("next_cursor")
                if not cursor:
                    break

    async def list_files(self, bucket: str, path: str = "",
                         limit: int = 100, offset: int = 0,
                         search: Optional[str] = None) -> List[Dict[str, Any]]:
        """List blobs in a store, using prefix + directories for folder simulation."""
        store = self._store_name(bucket)
        params: Dict[str, str] = {"directories": "true"}
        if path:
            params["prefix"] = path if path.endswith("/") else f"{path}/"

        all_blobs: List[Dict[str, Any]] = []
        all_dirs: List[str] = []
        cursor: Optional[str] = None

        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                req_params = {**params}
                if cursor:
                    req_params["cursor"] = cursor
                res = await client.get(
                    f"{self.blobs_url}/{store}",
                    headers=self.headers,
                    params=req_params,
                )
                if res.status_code == 404:
                    break
                if not res.is_success:
                    raise Exception(f"Failed to list Netlify blobs: {res.text}")
                data = res.json()
                all_blobs.extend(data.get("blobs", []))
                all_dirs.extend(data.get("directories", []))
                cursor = data.get("next_cursor")
                if not cursor:
                    break

        formatted: List[Dict[str, Any]] = []
        prefix = params.get("prefix", "")

        # Directories first
        seen_dirs: set[str] = set()
        for d in all_dirs:
            dir_name = d
            if prefix and dir_name.startswith(prefix):
                dir_name = dir_name[len(prefix):]
            dir_name = dir_name.rstrip("/")
            if not dir_name or dir_name in seen_dirs:
                continue
            seen_dirs.add(dir_name)
            formatted.append({
                "name": dir_name,
                "id": f"{prefix}{dir_name}/",
                "size": 0,
                "updated_at": None,
                "mimetype": None,
                "isFolder": True,
            })

        # Files
        for blob in all_blobs:
            key = blob.get("key", "")
            if not key:
                continue
            name = key
            if prefix and name.startswith(prefix):
                name = name[len(prefix):]
            # Skip nested (directory children handled above)
            if "/" in name:
                continue
            # Skip marker files
            if name == ".frontbase-init" or name == ".folder":
                continue
            if search and search.lower() not in name.lower():
                continue
            formatted.append({
                "name": name,
                "id": key,
                "size": 0,  # Netlify list doesn't return size
                "updated_at": None,
                "mimetype": None,
                "isFolder": False,
            })

        # Apply offset + limit
        return formatted[offset:offset + limit]

    async def upload_file(self, bucket: str, path: str,
                          content: bytes, content_type: str) -> Dict[str, Any]:
        """Upload a blob using the two-step signed URL flow."""
        store = self._store_name(bucket)
        url = f"{self.blobs_url}/{store}/{path}"

        # Step 1: Get signed URL
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.put(
                url,
                headers={**self.headers, "Accept": self.SIGNED_URL_ACCEPT},
                content=b"",
            )
        if not res.is_success:
            raise Exception(f"Failed to get signed URL for upload: {res.text}")
        signed_url = res.json().get("url")
        if not signed_url:
            raise Exception("No signed URL returned from Netlify API")

        # Step 2: PUT actual content to signed URL
        async with httpx.AsyncClient(timeout=60) as client:
            res2 = await client.put(
                signed_url,
                content=content,
                headers={"Content-Type": content_type},
            )
        if not res2.is_success:
            raise Exception(f"Failed to upload blob: {res2.text}")

        return {"path": path, "publicUrl": ""}

    async def delete_files(self, bucket: str, paths: List[str]) -> None:
        """Delete blobs by key."""
        store = self._store_name(bucket)
        async with httpx.AsyncClient(timeout=30) as client:
            for key in paths:
                res = await client.delete(
                    f"{self.blobs_url}/{store}/{key}",
                    headers=self.headers,
                )
                if res.status_code not in (200, 204, 404):
                    raise Exception(f"Failed to delete blob {key}: {res.text}")

    async def get_signed_url(self, bucket: str, path: str,
                             expires_in: int = 3600) -> str:
        """Get a signed download URL for a blob."""
        store = self._store_name(bucket)
        url = f"{self.blobs_url}/{store}/{path}"
        # Use GET with signed-url accept header
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.get(
                url,
                headers={**self.headers, "Accept": self.SIGNED_URL_ACCEPT},
            )
        if not res.is_success:
            raise Exception(f"Failed to get signed URL: {res.text}")
        signed_url = res.json().get("url", "")
        return signed_url

    async def get_public_url(self, bucket: str, path: str) -> str:
        """Netlify Blobs aren't publicly accessible — return a download via API."""
        return f"{self.blobs_url}/{self._store_name(bucket)}/{path}"

    async def move_file(self, bucket: str, source_key: str,
                        destination_key: str) -> None:
        """Move a blob: get → put to new key → delete old."""
        store = self._store_name(bucket)
        # 1. Get content
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.get(
                f"{self.blobs_url}/{store}/{source_key}",
                headers=self.headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to read blob for move: {res.text}")
        content = res.content
        ct = res.headers.get("content-type", "application/octet-stream")

        # 2. Upload to new key
        await self.upload_file(bucket, destination_key, content, ct)

        # 3. Delete old key
        await self.delete_files(bucket, [source_key])

    async def create_folder(self, bucket: str, folder_path: str) -> None:
        """Create a folder by writing a .folder marker blob."""
        if folder_path.endswith("/"):
            folder_path = folder_path[:-1]
        marker_key = f"{folder_path}/.folder"
        await self.upload_file(bucket, marker_key, b"", "application/x-directory")
