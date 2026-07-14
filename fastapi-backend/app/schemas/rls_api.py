"""Response contracts for the RLS domain (CF-22 P0 burn-down).

Policy and table payloads are dynamic — they mirror Supabase's RLS
introspection output — so `list[dict]` / `Any` is the honest contract there.
The typed part is the envelope and the metadata shapes the console relies on.
"""

from typing import Any, Optional

from pydantic import BaseModel


class RlsListEnvelope(BaseModel):
    success: bool
    data: Optional[list[dict[str, Any]]] = None
    error: Optional[str] = None


class RlsMessageEnvelope(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None


class RlsDataEnvelope(BaseModel):
    """Arbitrary-data envelope (metadata list/detail shapes vary by source)."""

    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


class RlsMetadataSaveData(BaseModel):
    tableName: str
    policyName: str
    sqlHash: Optional[str] = None


class RlsMetadataSaveEnvelope(BaseModel):
    success: bool
    data: Optional[RlsMetadataSaveData] = None
    error: Optional[str] = None


class RlsVerifyData(BaseModel):
    hasMetadata: bool
    isVerified: bool
    reason: Optional[str] = None
    formData: Optional[Any] = None


class RlsVerifyEnvelope(BaseModel):
    success: bool
    data: Optional[RlsVerifyData] = None
    error: Optional[str] = None
