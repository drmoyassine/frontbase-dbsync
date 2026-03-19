"""Cloudflare R2 Storage Adapter — bucket ops via CF API v4, object ops via S3."""

import hashlib
import httpx
import logging
from typing import Optional, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor
import asyncio

from app.services.storage.base import StorageAdapter

logger = logging.getLogger(__name__)

# Thread pool for running sync boto3 calls in async context
_executor = ThreadPoolExecutor(max_workers=4)


class CloudflareR2Adapter(StorageAdapter):
    """Storage adapter for Cloudflare R2.

    Bucket management uses CF REST API v4.
    Object operations (list, upload, delete) use S3-compatible API via boto3.
    S3 credentials are derived from the existing CF Bearer token:
      - Access Key ID = token ID (from GET /user/tokens/verify)
      - Secret Access Key = SHA-256(token value)
    """

    def __init__(self, api_token: str, account_id: str):
        self.api_token = api_token
        self.account_id = account_id
        self.base_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        self.headers = {"Authorization": f"Bearer {api_token}"}
        self.last_warning: Optional[str] = None  # Surfaced to frontend
        self._s3_client = None  # Lazy-initialized boto3 S3 client

    # ── S3 Client (lazy, cached) ─────────────────────────────────────

    async def _get_s3_client(self):
        """Get or create a boto3 S3 client using credentials derived from the CF token."""
        if self._s3_client is not None:
            return self._s3_client

        # Step 1: Get the token ID via verify endpoint
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                "https://api.cloudflare.com/client/v4/user/tokens/verify",
                headers=self.headers,
            )
        if not res.is_success:
            raise Exception(f"Failed to verify CF token: {res.text}")
        token_id = res.json().get("result", {}).get("id", "")
        if not token_id:
            raise Exception("Could not determine CF token ID for S3 credentials")

        # Step 2: Derive S3 credentials
        access_key_id = token_id
        secret_access_key = hashlib.sha256(self.api_token.encode()).hexdigest()

        # Step 3: Create boto3 S3 client
        import boto3
        from botocore.config import Config as BotoConfig

        self._s3_client = boto3.client(
            "s3",
            endpoint_url=f"https://{self.account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=BotoConfig(
                signature_version="s3v4",
                region_name="auto",
                retries={"max_attempts": 2},
            ),
        )
        logger.info(f"[CF R2] S3 client initialized for account {self.account_id}")
        return self._s3_client

    async def _run_s3(self, method: str, **kwargs):
        """Run a boto3 S3 method in a thread pool (boto3 is sync)."""
        s3 = await self._get_s3_client()
        logger.debug(f"[CF R2] S3 call: {method}({kwargs})")
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _executor, lambda: getattr(s3, method)(**kwargs)
        )

    # ── CF API v4 helpers (for bucket management) ────────────────────

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

    async def _delete_cf(self, path: str) -> None:
        async with httpx.AsyncClient() as client:
            res = await client.delete(f"{self.base_url}{path}", headers=self.headers)
        if not res.is_success:
            raise Exception(f"CF R2 API error: {res.text}")

    # ── Bucket operations (CF API v4) ────────────────────────────────

    async def list_buckets(self) -> List[Dict[str, Any]]:
        self.last_warning = None
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{self.base_url}/r2/buckets", headers=self.headers
            )
        if res.status_code == 403:
            cf_msg = ""
            try:
                errors = res.json().get("errors", [])
                if errors:
                    cf_msg = errors[0].get("message", "")
            except Exception:
                pass

            if "enable R2" in cf_msg:
                self.last_warning = (
                    "R2 is not enabled on this Cloudflare account. "
                    "Go to dash.cloudflare.com → R2 to activate it first."
                )
            else:
                self.last_warning = (
                    "Your Cloudflare API token is missing R2 permissions. "
                    "Update your token to include 'Workers R2 Storage: Edit' scope "
                    "in Settings → Accounts → Cloudflare."
                )
            logger.warning(f"[CF R2] 403 — account_id={self.account_id}: {cf_msg or res.text[:200]}")
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
        await self._post("/r2/buckets", {"name": name})
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
        logger.info(f"R2 update_bucket is a no-op for {bucket_id}")

    async def delete_bucket(self, bucket_id: str) -> None:
        await self._delete_cf(f"/r2/buckets/{bucket_id}")

    async def empty_bucket(self, bucket_id: str) -> None:
        # List ALL objects (no delimiter) for full recursive delete
        all_keys: List[str] = []
        kwargs: Dict[str, Any] = {"Bucket": bucket_id, "MaxKeys": 1000}
        while True:
            result = await self._run_s3("list_objects_v2", **kwargs)
            contents = result.get("Contents", [])
            all_keys.extend(obj["Key"] for obj in contents)
            if not result.get("IsTruncated"):
                break
            kwargs["ContinuationToken"] = result["NextContinuationToken"]

        logger.info(f"[CF R2] empty_bucket({bucket_id}): found {len(all_keys)} objects")
        if all_keys:
            # S3 batch delete supports up to 1000 per call
            for i in range(0, len(all_keys), 1000):
                batch = all_keys[i:i + 1000]
                await self.delete_files(bucket_id, batch)

    # ── Object operations (S3-compatible API via boto3) ──────────────

    async def list_files(self, bucket: str, path: str = "",
                         limit: int = 100, offset: int = 0,
                         search: Optional[str] = None) -> List[Dict[str, Any]]:
        kwargs: Dict[str, Any] = {"Bucket": bucket, "MaxKeys": limit}
        prefix = search or ""
        if path:
            prefix = path if path.endswith("/") else f"{path}/"
        if prefix:
            kwargs["Prefix"] = prefix
        kwargs["Delimiter"] = "/"

        result = await self._run_s3("list_objects_v2", **kwargs)

        formatted: List[Dict[str, Any]] = []

        # Folders (common prefixes)
        for prefix_entry in result.get("CommonPrefixes", []):
            p = prefix_entry.get("Prefix", "")
            folder_name = p.rstrip("/").rsplit("/", 1)[-1]
            formatted.append({
                "name": folder_name,
                "id": p,
                "size": 0,
                "updated_at": None,
                "mimetype": None,
                "isFolder": True,
            })

        # Files
        for obj in result.get("Contents", []):
            key = obj.get("Key", "")
            name = key.rsplit("/", 1)[-1] if "/" in key else key
            if not name or name.endswith("/"):
                continue
            formatted.append({
                "name": name,
                "id": key,
                "size": obj.get("Size", 0),
                "updated_at": obj.get("LastModified", "").isoformat() if obj.get("LastModified") else None,
                "mimetype": None,  # S3 list doesn't return content-type
                "isFolder": False,
            })
        return formatted

    async def upload_file(self, bucket: str, path: str,
                          content: bytes, content_type: str) -> Dict[str, Any]:
        await self._run_s3(
            "put_object",
            Bucket=bucket,
            Key=path,
            Body=content,
            ContentType=content_type,
        )
        return {"path": path}

    async def delete_files(self, bucket: str, paths: List[str]) -> None:
        if not paths:
            return

        # Expand folder paths to include all nested objects
        all_keys: List[str] = []
        for p in paths:
            if p.endswith("/"):
                # Folder — list all objects under this prefix and delete them
                kwargs: Dict[str, Any] = {"Bucket": bucket, "Prefix": p, "MaxKeys": 1000}
                while True:
                    result = await self._run_s3("list_objects_v2", **kwargs)
                    contents = result.get("Contents", [])
                    all_keys.extend(obj["Key"] for obj in contents)
                    if not result.get("IsTruncated"):
                        break
                    kwargs["ContinuationToken"] = result["NextContinuationToken"]
            else:
                all_keys.append(p)

        if not all_keys:
            return

        logger.info(f"[CF R2] delete_files({bucket}): deleting {len(all_keys)} objects")
        # S3 batch delete supports up to 1000 per call
        for i in range(0, len(all_keys), 1000):
            batch = all_keys[i:i + 1000]
            objects = [{"Key": k} for k in batch]
            await self._run_s3(
                "delete_objects",
                Bucket=bucket,
                Delete={"Objects": objects, "Quiet": True},
            )

    async def get_signed_url(self, bucket: str, path: str,
                             expires_in: int = 3600) -> str:
        s3 = await self._get_s3_client()
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": path},
            ExpiresIn=expires_in,
        )
        return str(url)

    async def get_public_url(self, bucket: str, path: str) -> str:
        return f"https://{self.account_id}.r2.cloudflarestorage.com/{bucket}/{path}"

    async def move_file(self, bucket: str, source_key: str,
                        destination_key: str) -> None:
        # S3 copy + delete
        await self._run_s3(
            "copy_object",
            Bucket=bucket,
            Key=destination_key,
            CopySource={"Bucket": bucket, "Key": source_key},
        )
        await self._run_s3("delete_object", Bucket=bucket, Key=source_key)

    async def create_folder(self, bucket: str, folder_path: str) -> None:
        if not folder_path.endswith("/"):
            folder_path += "/"
        await self.upload_file(bucket, folder_path, b"", "application/x-directory")
