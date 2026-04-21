"""
Pydantic schemas for the Edge Engines API.

Extracted from routers/edge_engines.py for single-concern compliance.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Literal


class EdgeEngineCreate(BaseModel):
    """Create a new edge engine."""
    name: str = Field(..., min_length=1, max_length=100)
    edge_provider_id: Optional[str] = None
    adapter_type: Literal["edge", "pages", "automations", "full"] = Field(default="full")
    url: str = Field(..., min_length=1, max_length=500)
    edge_db_id: Optional[str] = None
    edge_cache_id: Optional[str] = None
    edge_queue_id: Optional[str] = None
    engine_config: Optional[dict] = None  # Engine-specific metadata (e.g. worker_name)
    is_active: bool = Field(default=True)
    is_imported: bool = Field(default=False)


class EdgeEngineUpdate(BaseModel):
    """Update an existing edge engine."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    edge_provider_id: Optional[str] = None
    adapter_type: Optional[Literal["edge", "pages", "automations", "full"]] = None
    url: Optional[str] = Field(None, min_length=1, max_length=500)
    edge_db_id: Optional[str] = None
    edge_cache_id: Optional[str] = None
    edge_queue_id: Optional[str] = None
    engine_config: Optional[dict] = None
    is_active: Optional[bool] = None
    is_imported: Optional[bool] = None


class GPUModelSummary(BaseModel):
    """Embedded GPU model summary within engine response."""
    model_config = {"protected_namespaces": ()}

    id: str
    name: str
    slug: Optional[str] = None
    model_id: Optional[str] = None
    model_type: str
    endpoint_url: Optional[str] = None

class EdgeEngineResponse(BaseModel):
    """Edge engine response."""
    id: str
    name: str
    edge_provider_id: Optional[str] = None
    provider: Optional[str] = None  # From the joined provider account
    adapter_type: str
    url: str
    edge_db_id: Optional[str] = None
    edge_db_name: Optional[str] = None
    edge_cache_id: Optional[str] = None
    edge_cache_name: Optional[str] = None
    edge_queue_id: Optional[str] = None
    edge_queue_name: Optional[str] = None
    engine_config: Optional[dict] = None
    gpu_models: List[GPUModelSummary] = []
    is_active: bool
    is_system: bool = False
    is_imported: bool = False
    is_shared: bool = False
    bundle_checksum: Optional[str] = None
    config_checksum: Optional[str] = None
    last_deployed_at: Optional[str] = None
    last_synced_at: Optional[str] = None
    sync_status: Optional[str] = None  # "synced" | "stale" | "unknown"
    is_outdated: bool = False  # True when deployed bundle_checksum != current dist hash
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class TestConnectionResult(BaseModel):
    """Result of testing an engine connection."""
    success: bool
    message: str
    latency_ms: Optional[float] = None


class ReconfigureRequest(BaseModel):
    """Reconfigure an engine's DB/cache/queue bindings and push secrets to the remote."""
    edge_db_id: Optional[str] = None   # null = detach DB
    edge_cache_id: Optional[str] = None  # null = detach cache
    edge_queue_id: Optional[str] = None  # null = detach queue


class BatchRequest(BaseModel):
    """Base batch request with engine IDs."""
    engine_ids: List[str] = Field(..., min_length=1)


class BatchDeleteRequest(BatchRequest):
    """Batch delete with optional remote teardown."""
    delete_remote: bool = False


class BatchToggleRequest(BatchRequest):
    """Batch toggle active status."""
    is_active: bool


class BatchResult(BaseModel):
    """Result of a batch operation."""
    success: List[str] = []  # IDs that succeeded
    failed: List[dict] = []  # [{ id, error }]
    total: int = 0


class GenericDeployRequest(BaseModel):
    """Provider-agnostic deploy request for the Deploy Engine Wizard.

    The endpoint resolves the provider type from provider_id and routes
    to the correct deployer. `worker_name` is the resource name
    (CF worker, Supabase function, Vercel project, etc.).
    """
    provider_id: str
    worker_name: str = Field(..., min_length=1, max_length=200)
    adapter_type: Literal["edge", "pages", "automations", "full"] = Field(default="automations")
    edge_db_id: Optional[str] = None
    edge_cache_id: Optional[str] = None
    edge_queue_id: Optional[str] = None
    compute_type: Optional[str] = None  # "community" → sets is_shared=True

    @field_validator("worker_name")
    @classmethod
    def validate_worker_name(cls, v: str) -> str:
        """Enforce URL-safe subdomain naming: lowercase a-z, 0-9, hyphens only."""
        import re
        v = v.strip().lower()
        if not re.match(r'^[a-z0-9]([a-z0-9-]*[a-z0-9])?$', v):
            raise ValueError(
                "Name must contain only lowercase letters, numbers, and hyphens. "
                "Cannot start or end with a hyphen."
            )
        return v


class EdgeAgentProfileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50)
    system_prompt: Optional[str] = None
    permissions: Optional[dict] = None

class EdgeAgentProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    slug: Optional[str] = Field(None, min_length=1, max_length=50)
    system_prompt: Optional[str] = None
    permissions: Optional[dict] = None

class EdgeAgentProfileResponse(BaseModel):
    id: str
    engine_id: str
    name: str
    slug: str
    system_prompt: Optional[str] = None
    permissions: Optional[dict] = None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

