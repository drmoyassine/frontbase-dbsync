"""
Pydantic schemas for the Cloudflare Deploy API.

Extracted from routers/cloudflare.py for single-concern compliance.
"""

from pydantic import BaseModel, Field
from typing import Optional


class ConnectRequest(BaseModel):
    """List existing workers for a provider account."""
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")


class DeployRequest(BaseModel):
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")
    worker_name: str = Field(default="frontbase-edge", description="Worker script name")
    adapter_type: str = Field(default="automations", description="Engine type: 'automations' (Lite) or 'full'")
    edge_db_id: Optional[str] = Field(None, description="EdgeDatabase ID to attach (uses default if omitted)")
    edge_cache_id: Optional[str] = Field(None, description="EdgeCache ID to attach")
    edge_queue_id: Optional[str] = Field(None, description="EdgeQueue ID to attach")
    cache_url: Optional[str] = Field(None, description="Cache REST URL (Upstash, SRH, etc.)")
    cache_token: Optional[str] = Field(None, description="Cache REST auth token")


class StatusRequest(BaseModel):
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")
    worker_name: str = "frontbase-edge"


class TeardownRequest(BaseModel):
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")
    worker_name: str = "frontbase-edge"


class InspectRequest(BaseModel):
    """Inspect a deployed worker's content, settings, or secrets."""
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")
    worker_name: str = Field(..., description="Worker script name to inspect")
