"""Supabase Storage Adapter — S3-compatible via Supabase Storage API."""

import httpx
import logging
from typing import Optional, List, Dict, Any

from app.services.storage.base import StorageAdapter

logger = logging.getLogger(__name__)


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
        seen_folder_names: set[str] = set()  # Deduplicate folder entries

        for f in files:
            name = f.get("name", "")
            is_folder = "metadata" not in f or f["metadata"] is None

            # Skip placeholder / marker files
            if name in (".emptyFolderPlaceholder", ".folder"):
                continue

            # Deduplicate folder entries (Supabase can return the same folder
            # multiple times when nested subfolders exist)
            if is_folder:
                if name in seen_folder_names:
                    continue
                seen_folder_names.add(name)

            formatted.append({
                "name": name,
                "id": f.get("id", name),
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
