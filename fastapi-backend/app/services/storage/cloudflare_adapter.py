"""Cloudflare R2 Storage Adapter — via CF REST API v4."""

import httpx
import logging
from typing import Optional, List, Dict, Any

from app.services.storage.base import StorageAdapter

logger = logging.getLogger(__name__)


class CloudflareR2Adapter(StorageAdapter):
    """Storage adapter for Cloudflare R2 (via CF REST API v4)."""

    def __init__(self, api_token: str, account_id: str):
        self.api_token = api_token
        self.account_id = account_id
        self.base_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        self.headers = {"Authorization": f"Bearer {api_token}"}
        self.last_warning: Optional[str] = None  # Surfaced to frontend

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
        self.last_warning = None
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{self.base_url}/r2/buckets", headers=self.headers
            )
        if res.status_code == 403:
            self.last_warning = (
                "Your Cloudflare API token is missing R2 permissions. "
                "Update your token to include 'Workers R2 Storage: Edit' scope "
                "in Settings → Accounts → Cloudflare."
            )
            logger.warning(self.last_warning)
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
