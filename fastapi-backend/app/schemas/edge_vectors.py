"""
Edge Vector Schemas — Pydantic models for the edge-vectors API.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class EdgeVectorCreate(BaseModel):
    name: str
    provider: str  # "pgvector", "cloudflare_vectorize", "turso_vector", "embedded_lancedb"
    vector_url: str = Field(max_length=500, description="Vector database connection URL or DSN")
    vector_token: Optional[str] = None
    provider_account_id: Optional[str] = None  # FK → Connected Account
    is_default: bool = False
    # Provider-specific, non-secret tuning (dimensions, metric, table name, …).
    # Secrets never belong here — they live in the encrypted vector_token or are
    # resolved from the linked Connected Account at deploy time.
    provider_config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Provider-specific config like dimensions, metric type, table name (no secrets)",
    )


class EdgeVectorUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    vector_url: Optional[str] = Field(default=None, max_length=500, description="Vector database connection URL or DSN")
    vector_token: Optional[str] = None
    provider_account_id: Optional[str] = None
    is_default: Optional[bool] = None
    provider_config: Optional[Dict[str, Any]] = None


class EdgeVectorResponse(BaseModel):
    id: str
    name: str
    provider: str
    vector_url: str
    has_token: bool  # Never expose the actual token
    is_default: bool
    is_system: bool = False  # True = pre-seeded, cannot be deleted
    provider_account_id: Optional[str] = None
    account_name: Optional[str] = None
    # Provider-specific config — already redacted of secrets server-side.
    provider_config: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str
    engine_count: int = 0  # Number of edge engines using this vector store
    linked_engines: List[dict] = []  # [{id, name, provider}] for tooltip display
    supports_remote_delete: bool = False  # Whether this resource can be deleted remotely
