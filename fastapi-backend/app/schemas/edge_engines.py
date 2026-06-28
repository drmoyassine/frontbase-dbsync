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
    edge_auth_id: Optional[str] = None
    datasource_ids: Optional[List[str]] = None
    storage_ids: Optional[List[str]] = None
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
    edge_auth_id: Optional[str] = None
    datasource_ids: Optional[List[str]] = None
    storage_ids: Optional[List[str]] = None
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
    edge_auth_id: Optional[str] = None
    datasource_ids: List[str] = []
    storage_ids: List[str] = []
    datasources: List[dict] = []  # [{ id, name, type }]
    storages: List[dict] = []     # [{ id, name, provider }]
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

    model_config = {
        "from_attributes": True,
    }


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
    edge_auth_id: Optional[str] = None
    datasource_ids: Optional[List[str]] = None
    storage_ids: Optional[List[str]] = None


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


class BatchRotateSecretsRequest(BaseModel):
    """Request body for POST /api/edge-engines/batch/rotate-secrets-key."""
    engine_ids: List[str] = Field(..., min_length=1, max_length=50)
    strategy: Literal['random', 'hkdf'] = 'hkdf'
    window_seconds: int = Field(3600, ge=0, le=86400)
    dry_run: bool = False


class RollbackRotationRequest(BaseModel):
    """Request body for POST /api/edge-engines/{engine_id}/rollback-rotation."""
    rotation_id: str = Field(..., description="Rotation ID to rollback")


class RotationHistoryEntry(BaseModel):
    """One entry in an engine's key-rotation history (engine_config metadata)."""
    rotation_id: str
    started_at: str
    completed_at: Optional[str] = None
    strategy: Literal['random', 'hkdf']
    old_key_version: int
    new_key_version: int
    tenants_affected: int = 0
    status: Literal['completed', 'rolled_back', 'expired', 'transitioning']
    window_seconds: int = 0


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
    edge_auth_id: Optional[str] = None
    datasource_ids: Optional[List[str]] = None
    storage_ids: Optional[List[str]] = None
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
    # Feature-parity generation parameters + tool controls
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(None, ge=1, le=128000)
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0)
    excluded_tools: Optional[list[str]] = None
    max_auto_tools: Optional[int] = Field(None, ge=0, le=500)
    mcp_enabled: Optional[bool] = None
    skills_enabled: Optional[bool] = None

class EdgeAgentProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    slug: Optional[str] = Field(None, min_length=1, max_length=50)
    system_prompt: Optional[str] = None
    permissions: Optional[dict] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(None, ge=1, le=128000)
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0)
    excluded_tools: Optional[list[str]] = None
    max_auto_tools: Optional[int] = Field(None, ge=0, le=500)
    mcp_enabled: Optional[bool] = None
    skills_enabled: Optional[bool] = None

class EdgeAgentProfileResponse(BaseModel):
    id: str
    engine_id: str
    name: str
    slug: str
    system_prompt: Optional[str] = None
    permissions: Optional[dict] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    top_p: Optional[float] = None
    excluded_tools: Optional[list[str]] = None
    max_auto_tools: Optional[int] = None
    mcp_enabled: Optional[bool] = None
    skills_enabled: Optional[bool] = None
    created_at: str
    updated_at: str

    model_config = {
        "from_attributes": True,
    }

