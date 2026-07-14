"""Response contracts for the storage domain (CF-22 P0 — structural typing).

These replace the prior blanket `dict[str, Any]` typing with the real shapes the
storage routers return. Upload/move-cross results stay dynamic (`Any`) — their
`result` payload is provider-specific and genuinely unbounded.
"""

from typing import Any, Optional

from pydantic import BaseModel


class StorageMessageAck(BaseModel):
    """`{success, message?}` — provider/bucket delete, update, empty, move, folder."""

    success: bool
    message: Optional[str] = None


class StorageBucketResult(BaseModel):
    """Bucket create / compute-size / bucket-by-id data return."""

    success: bool
    bucket: Optional[Any] = None
    path: Optional[str] = None
    size: Optional[Any] = None
    cached: Optional[bool] = None


class StorageFilesResult(BaseModel):
    """`GET /list` — paged file listing."""

    success: bool
    files: list[Any] = []
    total: Optional[int] = None


class StorageSignedUrlResult(BaseModel):
    """Signed/public URL responses (one of signedUrl/publicUrl populated)."""

    success: bool
    signedUrl: Optional[str] = None
    publicUrl: Optional[str] = None


class StorageResultEnvelope(BaseModel):
    """Generic `{success, **dynamic}` for upload / move-cross (provider-specific)."""

    success: bool
