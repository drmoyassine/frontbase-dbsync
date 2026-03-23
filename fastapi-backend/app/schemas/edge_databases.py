"""
Edge Database Schemas — Pydantic models for the edge-databases API.

Extracted from routers/edge_databases.py for SRP compliance.
"""

from pydantic import BaseModel
from typing import Optional, List


class EdgeDatabaseCreate(BaseModel):
    name: str
    provider: str  # "turso", "neon", "planetscale"
    db_url: str
    db_token: Optional[str] = None
    provider_account_id: Optional[str] = None  # FK → Connected Account
    is_default: bool = False
    schema_name: Optional[str] = None  # PG schema for state isolation (e.g. "frontbase_edge_staging")


class EdgeDatabaseUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    db_url: Optional[str] = None
    db_token: Optional[str] = None
    provider_account_id: Optional[str] = None
    is_default: Optional[bool] = None
    schema_name: Optional[str] = None


class EdgeDatabaseResponse(BaseModel):
    id: str
    name: str
    provider: str
    db_url: str
    has_token: bool  # Never expose the actual token
    is_default: bool
    is_system: bool = False  # True = pre-seeded, cannot be deleted
    provider_account_id: Optional[str] = None
    account_name: Optional[str] = None
    created_at: str
    updated_at: str
    target_count: int = 0  # Number of deployment targets using this DB
    linked_engines: List[dict] = []  # [{id, name, provider}] for tooltip display
    warning: Optional[str] = None  # Scoped token creation warnings
    supports_remote_delete: bool = False  # Whether this resource can be deleted remotely
    schema_name: Optional[str] = None  # PG schema name for state isolation


class DiscoverSchemasRequest(BaseModel):
    db_url: str
    provider: Optional[str] = None  # e.g. "supabase", "neon"
    provider_account_id: Optional[str] = None  # Connected account for credential resolution


class CreateSchemaRequest(BaseModel):
    db_url: str
    suffix: str  # e.g. "staging" → creates frontbase_edge_staging
    provider: Optional[str] = None
    provider_account_id: Optional[str] = None


class ResetRolePasswordRequest(BaseModel):
    db_url: str
    schema_name: str
    provider_account_id: str


class BatchDeleteDatabaseRequest(BaseModel):
    ids: List[str]
    delete_remote: bool = False


class BatchResult(BaseModel):
    success: List[str] = []
    failed: List[dict] = []
    total: int = 0
