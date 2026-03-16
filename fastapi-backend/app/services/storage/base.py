"""
StorageAdapter — Abstract base class for all storage provider adapters.

Provides the unified interface that every provider must implement:
list_buckets, create_bucket, list_files, upload_file, etc.

Also includes shared concrete methods like compute_folder_size().
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


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
