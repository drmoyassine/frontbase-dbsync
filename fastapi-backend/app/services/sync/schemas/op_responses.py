"""Typed success responses for the DB-Synchronizer data plane (CF-22).

Why this exists: `/api/sync/*` is a mounted FastAPI sub-application, so its routes
never appeared in the main app's exported OpenAPI. The P0 `response_model` sweep
therefore never reached them — 22 operations returned bare dicts, which emit `{}`
as their schema. Consumers (the generated client, and the frontbase-framework
compat layer that must reimplement this surface) had nothing to validate against.

Two deliberate choices:

1. **`extra="allow"` on every model.** FastAPI serialises through the response
   model, so a field the model omits is silently DROPPED from the response. These
   are live data-plane endpoints feeding the console's tables and forms; a typo
   here would corrupt real payloads rather than fail loudly. Allowing extras makes
   adding a model non-destructive by construction.
2. **`Dict[str, Any]` where the payload genuinely is open** — a persisted table
   session, a record's columns, an aggregate keyed by caller-supplied column. That
   is the honest type, not a placeholder; inventing a closed shape for
   user-defined table data would be a lie the contract would then enforce.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class _Open(BaseModel):
    """Base: never drop a field the handler returned."""

    model_config = ConfigDict(extra="allow")


# ── service ──────────────────────────────────────────────────────────────────

class SyncHealthResponse(_Open):
    status: str


# ── datasources: table data ──────────────────────────────────────────────────

class TableDataResponse(_Open):
    """GET /{datasource_id}/tables/{table}/data/ — a page of rows."""

    records: List[Dict[str, Any]]
    total: int
    offset: int
    limit: int
    has_more: bool
    # Foreign-key display lookups, keyed by column name.
    fk_columns: Dict[str, Any] = {}
    timestamp_utc: Optional[str] = None


class TableAggregateResponse(_Open):
    """GET /{datasource_id}/tables/{table}/aggregate/ — caller-chosen aggregates."""

    success: bool = True
    data: Any = None


class DistinctValuesResponse(_Open):
    """GET /{datasource_id}/tables/{table}/distinct/{column}/."""

    success: bool = True
    data: List[Any] = []


class RecordMutationResponse(_Open):
    """POST/PATCH a single record — echoes the affected row."""

    success: bool = True
    record: Optional[Dict[str, Any]] = None


class TableSearchResponse(_Open):
    """GET /{datasource_id}/search — per-table match counts."""

    matches: List[Dict[str, Any]] = []


class SearchAllResponse(_Open):
    """GET /search-all/ — matches across every datasource."""

    matches: List[Dict[str, Any]] = []


# ── datasources: schema sessions ─────────────────────────────────────────────

class TableSessionSaveResponse(_Open):
    """POST session — `persisted` is False when Redis is unavailable."""

    status: str
    persisted: bool
    message: Optional[str] = None


class TableSessionResponse(_Open):
    """GET session — an arbitrary persisted editor session blob (may be empty)."""


class TableSessionClearedResponse(_Open):
    status: str


# ── datasources: relationships ───────────────────────────────────────────────

class RelationshipsResponse(_Open):
    tables: List[Any] = []
    relationships: List[Any] = []


class UserRelationshipsResponse(_Open):
    relationships: List[Dict[str, Any]] = []
    total: int = 0


class RelationshipRemovedResponse(_Open):
    success: bool = True
    removed: Any = None


# ── datasources: migration ───────────────────────────────────────────────────

class MigrationCheckResponse(_Open):
    """GET check-migration — `applicable` False for non-Supabase datasources."""

    applicable: bool
    applied: Optional[bool] = None
    reason: Optional[str] = None
    error: Optional[str] = None


class MigrationApplyResponse(_Open):
    applicable: Optional[bool] = None
    applied: Optional[bool] = None
    error: Optional[str] = None


# ── views ────────────────────────────────────────────────────────────────────

class ViewRecordsResponse(_Open):
    """GET /views/{view_id}/records/ — a page of rows plus view metadata."""

    records: List[Dict[str, Any]]
    total_records: int
    current_page: int
    total_pages: int
    per_page: int
    view_name: Optional[str] = None
    datasource_name: Optional[str] = None
    target_table: Optional[str] = None
    visible_columns: List[Any] = []
    timestamp_utc: Optional[str] = None


class ViewCountResponse(_Open):
    view_id: Any
    view_name: Optional[str] = None
    total_records: int
    target_table: Optional[str] = None
    datasource_name: Optional[str] = None
    timestamp_utc: Optional[str] = None


class ViewRecordMutationResponse(_Open):
    success: bool = True
    message: Optional[str] = None


class ViewTriggerResponse(_Open):
    success: bool = True
    message: Optional[str] = None
    data: Any = None


# ── wordpress ────────────────────────────────────────────────────────────────

class WordPressImportProgressResponse(_Open):
    """GET /wordpress/import/{import_id}/progress/ — poll shape is open."""
