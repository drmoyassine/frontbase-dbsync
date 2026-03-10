"""
Pydantic schemas for the Edge Providers API.

Extracted from routers/edge_providers.py for single-concern compliance.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any, List


# =============================================================================
# Provider Account CRUD
# =============================================================================

class EdgeProviderAccountCreate(BaseModel):
    name: str = Field(..., description="Name of the provider account (e.g. 'Personal Cloudflare')")
    provider: str = Field(..., description="Provider type (cloudflare, docker, vercel, etc.)")
    provider_credentials: Optional[Dict[str, Any]] = Field(None, description="API tokens, account IDs, etc.")


class EdgeProviderAccountUpdate(BaseModel):
    name: Optional[str] = None
    provider_credentials: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class EdgeProviderAccountResponse(BaseModel):
    id: str
    name: str
    provider: str
    is_active: bool
    has_credentials: bool = False
    provider_metadata: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str

    @field_validator('provider_metadata', mode='before')
    @classmethod
    def parse_metadata(cls, v):
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v

    class Config:
        from_attributes = True


# =============================================================================
# Test Connection
# =============================================================================

class TestConnectionRequest(BaseModel):
    provider: str = Field(..., description="Provider type (cloudflare, supabase, vercel, netlify, deno, upstash)")
    credentials: Dict[str, Any] = Field(..., description="Provider credentials to validate")


# =============================================================================
# Discovery
# =============================================================================

class DiscoverRequest(BaseModel):
    provider: str = Field(..., description="Provider type")
    credentials: Dict[str, Any] = Field(..., description="Provider credentials")


# =============================================================================
# Resource Creation
# =============================================================================

class CreateResourceRequest(BaseModel):
    resource_type: str = Field(..., description="Type of resource to create: 'redis'")
    name: str = Field(..., description="Name for the new resource")
    region: str = Field(default="us-east-1", description="Region for the resource")


# =============================================================================
# Turso Database Registry
# =============================================================================

class TursoDatabaseEntry(BaseModel):
    name: str = Field(..., description="Display name for the database")
    url: str = Field(..., description="libsql:// URL for the database")
    token: str = Field(..., description="Database auth token")
