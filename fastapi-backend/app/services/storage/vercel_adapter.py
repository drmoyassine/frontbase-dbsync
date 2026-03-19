"""Vercel Blob Storage Adapter — dual-token architecture.

Store-level operations (account API token → api.vercel.com):
  - GET    /v1/storage/stores               → list stores (filter type=blob)
  - POST   /v1/storage/stores/blob          → create store
  - GET    /v1/storage/stores/{storeId}     → get store details
  - DELETE /v1/storage/stores/blob/{storeId} → delete store
  - POST   /v1/storage/stores/{id}/connections → connect store to project
  - GET    /v3/env/pull/{projectId}/{target} → pull decrypted env vars (rw token)

Blob-level operations (BLOB_READ_WRITE_TOKEN → blob.vercel-storage.com):
  - GET    /                                → list blobs
  - PUT    /{path}                          → upload blob
  - POST   /delete                          → delete blobs
  - PUT    /{path}                          → copy blob (via x-vercel-copy-url)

The account API token can only manage stores. All blob-level operations require
a per-store BLOB_READ_WRITE_TOKEN which is generated when a store is connected
to a Vercel project. This adapter auto-provisions a bridge project when needed.
"""

import httpx
import logging
from typing import Optional, List, Dict, Any

from app.services.storage.base import StorageAdapter

logger = logging.getLogger(__name__)

ADMIN_API = "https://api.vercel.com"
BLOB_API = "https://blob.vercel-storage.com"
BLOB_API_VERSION = "12"


class VercelBlobAdapter(StorageAdapter):
    """Storage adapter for Vercel Blob stores."""

    def __init__(self, api_token: str):
        self.api_token = api_token
        self.admin_headers = {"Authorization": f"Bearer {api_token}"}
        # Cache: store_id → rw_token
        self._rw_token_cache: Dict[str, str] = {}
        # Cache: team/owner id
        self._team_id: Optional[str] = None
        # Cache: store name → store_id (Vercel IDs are "store_xxxxx")
        self._name_to_id: Dict[str, str] = {}

    # ── Internal: name → store ID resolution ─────────────────────────

    async def _resolve_store_id(self, bucket: str) -> str:
        """Resolve a bucket name or ID to a Vercel store ID.

        The file browser may pass a store name ("uploads") or a store ID
        ("store_xxxxx"). Vercel API endpoints require the store ID.
        """
        # Already a store ID
        if bucket.startswith("store_"):
            return bucket
        # Cached
        if bucket in self._name_to_id:
            return self._name_to_id[bucket]
        # Fetch all stores and populate cache
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"{ADMIN_API}/v1/storage/stores",
                headers=self.admin_headers,
                params={"type": "blob"},
            )
        if res.is_success:
            for s in res.json().get("stores", []):
                sid = str(s.get("id", ""))
                name = str(s.get("name", ""))
                if sid:
                    self._name_to_id[name] = sid
                    if not self._team_id:
                        self._team_id = str(s.get("ownerId", ""))
        if bucket in self._name_to_id:
            return self._name_to_id[bucket]
        # Last resort: assume it's the ID
        return bucket

    # ── Internal: team ID resolution ─────────────────────────────────

    async def _get_team_id(self) -> str:
        """Get the team/owner ID from the first available store or account."""
        if self._team_id:
            return self._team_id
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"{ADMIN_API}/v1/storage/stores",
                headers=self.admin_headers,
                params={"type": "blob"},
            )
        if res.is_success:
            stores = res.json().get("stores", [])
            if stores:
                self._team_id = str(stores[0].get("ownerId", ""))
                return self._team_id
        # Fallback: try the user/team API
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"{ADMIN_API}/v2/user",
                headers=self.admin_headers,
            )
        if res.is_success:
            user = res.json().get("user", {})
            self._team_id = str(user.get("defaultTeamId", user.get("id", "")))
            return self._team_id
        return ""

    # ── Internal: store → project connection + token retrieval ───────

    async def _ensure_store_connected(self, store_id: str, team_id: str,
                                       project_id: str,
                                       store_name: str = "") -> bool:
        """Connect a store to a project if not already connected.

        Always uses a store-name-scoped envVarPrefix so multiple stores can
        share the same project without env var conflicts.
        E.g. store "uploads" → env var UPLOADS_BLOB_READ_WRITE_TOKEN.

        Returns True on success, False on failure.
        """
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"{ADMIN_API}/v1/storage/stores/{store_id}/connections",
                headers=self.admin_headers,
                params={"teamId": team_id},
            )
        if res.is_success:
            connections = res.json().get("connections", [])
            for conn in connections:
                if conn.get("projectId") == project_id:
                    return True  # Already connected

        # Build a store-name-scoped prefix to avoid env var collisions
        safe_prefix = (store_name or store_id).upper().replace("-", "_").replace(" ", "_")
        prefix = f"{safe_prefix}_BLOB"
        body: Dict[str, Any] = {
            "projectId": project_id,
            "envVarEnvironments": ["production", "preview", "development"],
            "type": "integration",
            "envVarPrefix": prefix,
        }
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                f"{ADMIN_API}/v1/storage/stores/{store_id}/connections",
                headers={**self.admin_headers, "Content-Type": "application/json"},
                params={"teamId": team_id},
                json=body,
            )
        if res.is_success or res.status_code == 409:
            logger.info(f"[Vercel] Connected store {store_id} with prefix '{prefix}'")
            return True

        logger.warning(f"Failed to connect store {store_id} to project {project_id}: {res.text}")
        return False


    async def _get_connected_project(self, store_id: str, team_id: str) -> Optional[str]:
        """Find a project already connected to this store."""
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"{ADMIN_API}/v1/storage/stores/{store_id}/connections",
                headers=self.admin_headers,
                params={"teamId": team_id},
            )
        if res.is_success:
            connections = res.json().get("connections", [])
            if connections:
                return str(connections[0].get("projectId", ""))
        return None

    async def _get_rw_token(self, bucket: str) -> str:
        """Get the BLOB_READ_WRITE_TOKEN for a store, resolving name→ID first."""
        # Check cache by original key first
        if bucket in self._rw_token_cache:
            return self._rw_token_cache[bucket]

        store_id = await self._resolve_store_id(bucket)
        # Also check cache by resolved ID
        if store_id in self._rw_token_cache:
            self._rw_token_cache[bucket] = self._rw_token_cache[store_id]
            return self._rw_token_cache[store_id]

        team_id = await self._get_team_id()
        if not team_id:
            raise Exception("Could not determine Vercel team/owner ID")

        # Find a project already connected to this store
        project_id = await self._get_connected_project(store_id, team_id)
        if not project_id:
            raise Exception(
                f"Store {store_id} ({bucket}) is not connected to any Vercel project. "
                "Re-create the bucket and select a project to connect to."
            )

        # Pull the decrypted env vars from the connected project
        store_suffix = store_id.replace("store_", "")
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"{ADMIN_API}/v3/env/pull/{project_id}/development",
                headers=self.admin_headers,
                params={"teamId": team_id, "source": "vercel-cli:env:pull"},
            )
        if not res.is_success:
            raise Exception(
                f"Failed to pull env vars from project {project_id}: {res.status_code} {res.text}"
            )

        env = res.json().get("env", {})
        # Find the token matching THIS store by its suffix in the token value
        # Token format: vercel_blob_rw_{storeIdSuffix}_{secret}
        # Env var names: BLOB_READ_WRITE_TOKEN, MYSTORE_BLOB_READ_WRITE_TOKEN, etc.
        rw_token = ""
        for key, value in env.items():
            if key.endswith("_READ_WRITE_TOKEN") and store_suffix in value:
                rw_token = value
                break

        if not rw_token:
            raise Exception(
                f"BLOB_READ_WRITE_TOKEN for store {store_id} not found in project {project_id}. "
                f"Available env keys: {[k for k in env if 'READ_WRITE' in k]}"
            )

        self._rw_token_cache[bucket] = rw_token
        self._rw_token_cache[store_id] = rw_token
        return rw_token

    def _blob_headers(self, rw_token: str) -> Dict[str, str]:
        """Headers for blob-level API calls."""
        return {
            "Authorization": f"Bearer {rw_token}",
            "x-api-version": BLOB_API_VERSION,
        }

    # ── Store-level operations (account API token) ───────────────────

    async def list_buckets(self) -> List[Dict[str, Any]]:
        """List all Vercel Blob stores."""
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"{ADMIN_API}/v1/storage/stores",
                headers=self.admin_headers,
                params={"type": "blob"},
            )
        if not res.is_success:
            raise Exception(f"Failed to list Vercel stores: {res.text}")
        data = res.json()
        stores = data.get("stores", [])
        # Cache team_id from first store
        if stores and not self._team_id:
            self._team_id = stores[0].get("ownerId", "")
        return [
            {
                "id": s.get("id", ""),
                "name": s.get("name", s.get("id", "")),
                "public": s.get("access") == "public",
                "created_at": s.get("createdAt"),
            }
            for s in stores
        ]

    async def create_bucket(self, name: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None,
                            project_id: Optional[str] = None) -> Dict[str, Any]:
        """Create a new Vercel Blob store and connect it to a project.

        Access mode (public/private) is permanent — cannot be changed after creation.
        project_id: Vercel project to connect to. If the project already has a blob
                    store, a custom prefix is used for the env var.
        """
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                f"{ADMIN_API}/v1/storage/stores/blob",
                headers={**self.admin_headers, "Content-Type": "application/json"},
                json={
                    "name": name,
                    "region": "iad1",
                    "access": "public" if public else "private",
                },
            )
        if not res.is_success:
            error_msg = res.text
            try:
                error_data = res.json()
                error_msg = error_data.get("error", {}).get("message", res.text)
            except Exception:
                pass
            raise Exception(f"Failed to create Vercel Blob store: {error_msg}")
        store = res.json().get("store", res.json())
        store_id = store.get("id", "")
        logger.info(f"[Vercel] Created store '{name}' -> id={store_id}, project_id={project_id}")

        # Connect the store to the project for rw token generation
        if project_id:
            team_id = store.get("ownerId", "") or await self._get_team_id()
            if team_id:
                self._team_id = team_id
            connected = await self._ensure_store_connected(
                store_id, team_id, project_id, store_name=name
            )
            if connected:
                logger.info(f"[Vercel] Store {store_id} connected to project {project_id}")
            else:
                logger.warning(f"[Vercel] Store {store_id} created but NOT connected!")
        else:
            logger.warning(f"[Vercel] No project_id provided for store {store_id}")

        return {
            "id": store_id,
            "name": name,
            "public": public,
            "created_at": store.get("createdAt"),
        }

    async def get_bucket(self, bucket_id: str) -> Dict[str, Any]:
        """Get details of a Vercel Blob store."""
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"{ADMIN_API}/v1/storage/stores/{bucket_id}",
                headers=self.admin_headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to get Vercel Blob store: {res.text}")
        data = res.json()
        s = data.get("store", data)
        return {
            "id": s.get("id", bucket_id),
            "name": s.get("name", bucket_id),
            "public": s.get("access") == "public",
            "created_at": s.get("createdAt"),
        }

    async def update_bucket(self, bucket_id: str, public: bool = False,
                            file_size_limit: Optional[int] = None,
                            allowed_mime_types: Optional[List[str]] = None) -> None:
        """Vercel Blob store access mode is permanent — update is a no-op."""
        logger.info(f"Vercel Blob store update is a no-op for {bucket_id} "
                     "(access mode is set at creation and cannot be changed)")

    async def delete_bucket(self, bucket_id: str) -> None:
        """Delete a Vercel Blob store."""
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.request(
                "DELETE",
                f"{ADMIN_API}/v1/storage/stores/blob/{bucket_id}",
                headers=self.admin_headers,
            )
        if not res.is_success:
            error_msg = res.text
            try:
                error_data = res.json()
                error_msg = error_data.get("error", {}).get("message", res.text)
            except Exception:
                pass
            raise Exception(f"Failed to delete Vercel Blob store: {error_msg}")
        # Clear cached token
        self._rw_token_cache.pop(bucket_id, None)

    async def empty_bucket(self, bucket_id: str) -> None:
        """Delete all blobs in a store."""
        files = await self.list_files(bucket_id)
        if files:
            urls = [f["id"] for f in files if not f.get("isFolder")]
            if urls:
                await self.delete_files(bucket_id, urls)

    # ── Blob-level operations (BLOB_READ_WRITE_TOKEN) ────────────────

    async def list_files(self, bucket: str, path: str = "",
                         limit: int = 100, offset: int = 0,
                         search: Optional[str] = None) -> List[Dict[str, Any]]:
        rw_token = await self._get_rw_token(bucket)
        params: Dict[str, Any] = {"limit": limit, "mode": "expanded"}
        if path:
            params["prefix"] = path if path.endswith("/") else f"{path}/"
        if search:
            params["prefix"] = search

        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                BLOB_API,
                params=params,
                headers=self._blob_headers(rw_token),
            )
        if not res.is_success:
            raise Exception(f"Failed to list Vercel Blobs: {res.text}")

        data = res.json()
        blobs = data.get("blobs", [])
        folders = data.get("folders", [])

        formatted: List[Dict[str, Any]] = []
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
        rw_token = await self._get_rw_token(bucket)
        headers = {
            **self._blob_headers(rw_token),
            "content-type": content_type,
            "x-add-random-suffix": "0",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.put(
                f"{BLOB_API}/?pathname={path}",
                content=content,
                headers=headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to upload to Vercel Blob: {res.text}")
        data = res.json()
        return {"path": path, "publicUrl": data.get("url", "")}

    async def delete_files(self, bucket: str, paths: List[str]) -> None:
        rw_token = await self._get_rw_token(bucket)

        # Expand folder paths to include all nested blobs
        all_urls: List[str] = []
        for p in paths:
            if p.endswith("/"):
                # Folder — list all blobs with this prefix and collect URLs
                prefix = p
                params: Dict[str, Any] = {"limit": 1000, "prefix": prefix}
                async with httpx.AsyncClient(timeout=15) as client:
                    res = await client.get(
                        BLOB_API,
                        params=params,
                        headers=self._blob_headers(rw_token),
                    )
                if res.is_success:
                    for blob in res.json().get("blobs", []):
                        url = blob.get("url", "")
                        if url:
                            all_urls.append(url)
            else:
                all_urls.append(p)

        if not all_urls:
            return

        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                f"{BLOB_API}/delete",
                json={"urls": all_urls},
                headers=self._blob_headers(rw_token),
            )
        if not res.is_success:
            raise Exception(f"Failed to delete Vercel Blobs: {res.text}")

    async def get_signed_url(self, bucket: str, path: str,
                             expires_in: int = 3600) -> str:
        raise Exception("Vercel Blob signed URLs are not available via REST API")

    async def get_public_url(self, bucket: str, path: str) -> str:
        return path

    async def move_file(self, bucket: str, source_key: str,
                        destination_key: str) -> None:
        raise Exception("Vercel Blob does not support move/rename via API")

    async def create_folder(self, bucket: str, folder_path: str) -> None:
        if not folder_path.endswith("/"):
            folder_path += "/"
        await self.upload_file(bucket, f"{folder_path}.folder", b"", "application/x-directory")
