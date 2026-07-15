"""Shared response envelopes (CF-22 P0 — structural typing of recurring shapes).

These cover the ack/envelope patterns that recur across routers. One class per
shape; single-use shapes live in op_responses.py (generated).
"""

from typing import Any, Optional

from pydantic import BaseModel


class SuccessAck(BaseModel):
    """Bare `{"success": bool}` acknowledgement."""

    success: bool


class SuccessMessageAck(BaseModel):
    """`{"success", "message"?}` acknowledgement."""

    success: bool
    message: Optional[str] = None


class SuccessDataEnvelope(BaseModel):
    """`{"success", "data"?, "message"?, "error"?}` envelope."""

    success: bool
    data: Optional[Any] = None
    message: Optional[str] = None
    error: Optional[str] = None


class RemoteDeleteAck(BaseModel):
    """Edge-resource delete: local ack + whether the remote resource was deleted."""

    success: bool
    message: Optional[str] = None
    remote_deleted: Optional[bool] = None


class LegacyEndpointNotice(BaseModel):
    """Deprecation shim: points the caller at the replacement endpoint."""

    message: str
    method: Optional[str] = None
    path: Optional[str] = None
