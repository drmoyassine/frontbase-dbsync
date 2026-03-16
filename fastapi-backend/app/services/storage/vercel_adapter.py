"""Vercel Blob Storage Adapter — via Vercel REST API."""

import httpx
import logging
from typing import Optional, List, Dict, Any

from app.services.storage.base import StorageAdapter

logger = logging.getLogger(__name__)


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
