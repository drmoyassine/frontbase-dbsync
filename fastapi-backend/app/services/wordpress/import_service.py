"""
WordPress import orchestration with live progress.

Runs a paginated extraction → transformation → persistence pipeline for each
selected post type, publishing progress to an in-memory store that the SSE
endpoint streams to the browser.

Persistence
-----------
``_persist_record`` is the single extension point: by default it is a no-op
that returns the transformed record. Wire it to the Frontbase content store
(REST/DB/queue) to complete the migration. Keeping it isolated means the
extraction + transformation + progress + URL-mapping logic is fully testable
without a live Frontbase target.

Progress payloads use camelCase keys to match the frontend
``WordPressImportProgress`` / ``WordPressImportResult`` TypeScript contracts.
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from app.services.wordpress.mapping_service import WordPressMappingService
from app.services.wordpress.url_mapping import WordPressUrlMappingService

logger = logging.getLogger(__name__)

# Default page size for extraction (plugin caps at 100)
DEFAULT_PAGE_SIZE = 100


def _utcnow_iso() -> str:
    """Current UTC timestamp as an ISO-8601 string (SSE-friendly)."""
    return datetime.now(timezone.utc).isoformat()


@dataclass
class _ImportState:
    """Mutable state for one in-flight import, exposed via the progress store.

    CRITICAL: ``tenant_id`` is stored to enforce tenant isolation. All progress/
    result endpoints must validate that the requesting tenant owns the import.
    """

    import_id: str
    tenant_id: Optional[str]  # None for master/self-host, tenant_id for cloud
    datasource_id: str  # Store datasource_id for ownership validation
    status: str = "pending"  # pending | running | completed | failed | partial
    started_at: str = field(default_factory=_utcnow_iso)
    completed_at: Optional[str] = None
    total_records: int = 0
    processed_records: int = 0
    failed_records: int = 0
    current_post_type: Optional[str] = None
    current_page: Optional[int] = None
    total_pages: Optional[int] = None
    errors: List[Dict[str, Any]] = field(default_factory=list)
    # Internal accumulators (not serialized to the progress payload)
    per_post_type: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    url_mappings: Dict[str, str] = field(default_factory=dict)
    options: Dict[str, Any] = field(default_factory=dict)
    result: Optional[Dict[str, Any]] = None

    def to_progress(self) -> Dict[str, Any]:
        """camelCase progress payload matching WordPressImportProgress."""
        return {
            "status": self.status,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
            "totalRecords": self.total_records,
            "processedRecords": self.processed_records,
            "failedRecords": self.failed_records,
            "currentPostType": self.current_post_type,
            "currentPage": self.current_page,
            "totalPages": self.total_pages,
            "errors": list(self.errors[-50:]),  # cap to keep payloads small
        }


class ImportProgressStore:
    """In-memory registry of import states (single-process, tenant-aware).

    CRITICAL: Tenant isolation is enforced via ``check_tenant_access`` — every
    public read access MUST call it before returning data. The store tracks
    ``tenant_id`` + ``datasource_id`` for ownership validation.

    For multi-worker deployments, swap this for a Redis/DB-backed store — the
    shape (``get``/``set``/``progress``/``result``) is intentionally tiny.
    """

    def __init__(self) -> None:
        self._states: Dict[str, _ImportState] = {}
        self._lock = asyncio.Lock()

    async def create(
        self, import_id: str, tenant_id: Optional[str], datasource_id: str,
        options: Dict[str, Any]
    ) -> _ImportState:
        async with self._lock:
            state = _ImportState(
                import_id=import_id,
                tenant_id=tenant_id,
                datasource_id=datasource_id,
                options=options
            )
            self._states[import_id] = state
            return state

    def _get(self, import_id: str) -> Optional[_ImportState]:
        """Internal get without tenant check (for system access)."""
        return self._states.get(import_id)

    def get(self, import_id: str, tenant_id: Optional[str]) -> Optional[_ImportState]:
        """Get import state ONLY if tenant owns it. Returns None if not found or wrong tenant."""
        state = self._states.get(import_id)
        if not state:
            return None
        # Master (tenant_id=None) can see imports with no tenant_id
        # Tenant users can ONLY see their own imports
        if tenant_id is None:
            # Master/self-host: can only see imports created with no tenant
            return state if state.tenant_id is None else None
        # Tenant user: must match exact tenant_id
        return state if state.tenant_id == tenant_id else None

    def progress(self, import_id: str, tenant_id: Optional[str]) -> Optional[Dict[str, Any]]:
        state = self.get(import_id, tenant_id)
        return state.to_progress() if state else None

    def result(self, import_id: str, tenant_id: Optional[str]) -> Optional[Dict[str, Any]]:
        state = self.get(import_id, tenant_id)
        return state.result if state and state.result else None

    def check_tenant_access(
        self, import_id: str, tenant_id: Optional[str]
    ) -> Optional[_ImportState]:
        """Validate tenant access and raise HTTP_404 if denied. Returns state if OK."""
        state = self.get(import_id, tenant_id)
        if state is None:
            # Always return None (HTTP_404) to avoid leaking existence of other tenants' imports
            return None
        return state

    async def cleanup_old(self, max_age_seconds: int = 3600) -> int:
        """Clean up completed imports older than max_age_seconds. Returns count cleaned."""
        import time
        from datetime import datetime, timezone

        cutoff = time.time() - max_age_seconds
        removed = 0

        async with self._lock:
            to_remove = []
            for import_id, state in self._states.items():
                if state.status in ("completed", "failed", "partial"):
                    try:
                        completed = datetime.fromisoformat(
                            (state.completed_at or state.started_at).replace("Z", "+00:00")
                        ).timestamp()
                        if completed < cutoff:
                            to_remove.append(import_id)
                    except (ValueError, TypeError):
                        # Can't parse - skip
                        pass

            for import_id in to_remove:
                del self._states[import_id]
                removed += 1

        return removed


class WordPressImportService:
    """Orchestrates a full WordPress → Frontbase import."""

    def __init__(
        self,
        store: Optional[ImportProgressStore] = None,
        persist_record: Optional[Callable[[Dict[str, Any], str, Dict[str, Any]], Any]] = None,
        url_mapping_service: Optional[WordPressUrlMappingService] = None,
        mapping_service: Optional[WordPressMappingService] = None,
    ) -> None:
        self.store = store or ImportProgressStore()
        self._persist_record = persist_record or self._default_persist
        self.url_mapping = url_mapping_service or WordPressUrlMappingService()
        self.mapping = mapping_service or WordPressMappingService()

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    async def start(
        self,
        adapter: Any,
        datasource_id: str,
        tenant_id: Optional[str],
        options: Dict[str, Any]
    ) -> str:
        """Register a new import and launch it in the background.

        Returns the import_id immediately so the caller can subscribe to the
        SSE progress stream.
        """
        import_id = str(uuid.uuid4())
        await self.store.create(import_id, tenant_id, datasource_id, options)
        # Detached background task — survives the request that started it.
        asyncio.create_task(self._run(import_id, adapter, options))
        logger.info(
            "Started WordPress import %s for datasource %s, tenant %s, post types %s",
            import_id, datasource_id, tenant_id, options.get("postTypes")
        )
        return import_id

    def get_progress(self, import_id: str, tenant_id: Optional[str]) -> Optional[Dict[str, Any]]:
        return self.store.progress(import_id, tenant_id)

    def get_result(self, import_id: str, tenant_id: Optional[str]) -> Optional[Dict[str, Any]]:
        return self.store.result(import_id, tenant_id)

    def check_access(self, import_id: str, tenant_id: Optional[str]) -> Optional[_ImportState]:
        """Validate tenant access to an import. Returns state if OK, None if denied."""
        return self.store.check_tenant_access(import_id, tenant_id)

    async def cleanup_old_imports(self, max_age_seconds: int = 3600) -> int:
        """Clean up completed imports older than max_age_seconds. Returns count cleaned."""
        return await self.store.cleanup_old(max_age_seconds)

    # ------------------------------------------------------------------ #
    # Pipeline
    # ------------------------------------------------------------------ #
    async def _run(self, import_id: str, adapter: Any, options: Dict[str, Any]) -> None:
        state = self.store._get(import_id)  # Internal get (bypass tenant check for system task)
        if state is None:
            logger.warning("Import %s not found in store (may have been cancelled)", import_id)
            return

        # Ensure terminal status is ALWAYS set (even on unhandled exceptions)
        try:
            state.status = "running"
            post_types: List[str] = list(options.get("postTypes", []) or [])
            page_size = int(options.get("pageSize") or DEFAULT_PAGE_SIZE)
            field_mappings = options.get("fieldMappings") or {}
            do_url_mapping = bool(options.get("urlMapping", True))

            # Resolve total record counts up-front for accurate progress
            totals: Dict[str, int] = {}
            try:
                for pt in post_types:
                    totals[pt] = await adapter.count_records(pt)
            except Exception as exc:
                logger.warning("count_records failed during import %s: %s", import_id, exc)
                for pt in post_types:
                    totals[pt] = 0

            state.total_records = sum(totals.values())
            state.total_pages = sum(max(1, math.ceil(t / page_size)) for t in totals.values())

            try:
                for pt in post_types:
                    state.current_post_type = pt
                    state.per_post_type.setdefault(
                        pt, {"postType": pt, "total": totals.get(pt, 0), "imported": 0, "failed": 0, "errors": []}
                    )
                    await self._import_post_type(import_id, state, adapter, pt, page_size, field_mappings, do_url_mapping)

                state.status = "failed" if state.failed_records and state.processed_records == 0 else (
                    "partial" if state.failed_records > 0 else "completed"
                )
            except Exception as exc:
                logger.exception("Import %s failed during post type processing", import_id)
                state.status = "failed"
                state.errors.append({"postType": state.current_post_type or "", "message": str(exc)})

        except Exception as exc:
            # Outer catch: ensures terminal status even if setup fails
            logger.exception("Import %s failed during initialization", import_id)
            state.status = "failed"
            state.errors.append({"postType": "", "message": str(exc)})
        finally:
            # ALWAYS set terminal state and result
            state.completed_at = _utcnow_iso()
            state.result = self._build_result(state, options)

    async def _import_post_type(
        self,
        import_id: str,
        state: _ImportState,
        adapter: Any,
        post_type: str,
        page_size: int,
        field_mappings: Dict[str, Any],
        do_url_mapping: bool,
    ) -> None:
        page = 1
        pt_stats = state.per_post_type[post_type]
        while True:
            state.current_page = page
            try:
                batch = await adapter.read_records(
                    post_type, limit=page_size, offset=(page - 1) * page_size
                )
            except Exception as exc:
                logger.warning("extract page %s/%s failed: %s", post_type, page, exc)
                state.errors.append(
                    {"postType": post_type, "recordId": -1, "message": f"page {page}: {exc}"}
                )
                pt_stats["failed"] += 1
                state.failed_records += 1
                state.processed_records += 1
                break

            if not batch:
                break

            for record in batch:
                try:
                    transformed = self._transform_record(
                        record, post_type, field_mappings
                    )
                    await self._persist_record(transformed, post_type, record)

                    if do_url_mapping:
                        single = self.url_mapping.build_for_record(record, post_type)
                        if single:
                            state.url_mappings.update(single)

                    pt_stats["imported"] += 1
                except Exception as exc:
                    logger.warning("record persist failed (%s/%s): %s", post_type, record.get("id"), exc)
                    state.errors.append(
                        {
                            "postType": post_type,
                            "recordId": record.get("id"),
                            "message": str(exc),
                        }
                    )
                    pt_stats["failed"] += 1
                    pt_stats["errors"].append({"recordId": record.get("id"), "message": str(exc)})
                    state.failed_records += 1
                finally:
                    state.processed_records += 1

            if len(batch) < page_size:
                break
            page += 1

    # ------------------------------------------------------------------ #
    # Transformation
    # ------------------------------------------------------------------ #
    def _transform_record(
        self,
        record: Dict[str, Any],
        post_type: str,
        field_mappings: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Apply field mappings to a record; passthrough when none provided."""
        mappings = self._normalise_mappings(field_mappings.get(post_type))
        if not mappings:
            # Preserve the full extracted record when no mapping is configured.
            return dict(record)

        # Sanitize mappings to prevent field injection
        safe_mappings = _sanitize_mappings(mappings)

        out: Dict[str, Any] = {}
        for m in safe_mappings:
            value = _resolve_path(record, m.get("wordpressPath") or m.get("wordpress_path") or "")
            field_name = m.get("frontbaseField") or m.get("frontbase_field")
            out[field_name] = _coerce(value, m.get("transform", "string"))
        return out

    @staticmethod
    def _normalise_mappings(raw: Any) -> List[Dict[str, Any]]:
        """Accept the various field-mapping shapes the UI might emit."""
        if not raw:
            return []
        # List of {frontbaseField, wordpressPath, transform}
        if isinstance(raw, list):
            return [m for m in raw if isinstance(m, dict) and (m.get("frontbaseField") or m.get("frontbase_field"))]
        # Dict: {frontbaseField: wordpressPath} or {frontbaseField: {wordpressPath, transform}}
        if isinstance(raw, dict):
            out: List[Dict[str, Any]] = []
            for target, source in raw.items():
                if isinstance(source, dict):
                    out.append(
                        {
                            "frontbaseField": target,
                            "wordpressPath": source.get("wordpressPath") or source.get("wordpress_path"),
                            "transform": source.get("transform", "string"),
                        }
                    )
                else:
                    out.append({"frontbaseField": target, "wordpressPath": source, "transform": "string"})
            return out
        return []

    # ------------------------------------------------------------------ #
    # Persistence extension point
    # ------------------------------------------------------------------ #
    @staticmethod
    async def _default_persist(
        transformed: Dict[str, Any], post_type: str, original: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Default persistence: no-op (returns the transformed record).

        Replace via the ``persist_record`` constructor argument to write into
        the Frontbase content store.
        """
        return transformed

    # ------------------------------------------------------------------ #
    # Result assembly
    # ------------------------------------------------------------------ #
    def _build_result(self, state: _ImportState, options: Dict[str, Any]) -> Dict[str, Any]:
        started = _parse_iso(state.started_at)
        completed = _parse_iso(state.completed_at or _utcnow_iso())
        duration = (completed - started).total_seconds() if started and completed else 0.0
        return {
            "importId": state.import_id,
            "status": state.status,
            "startedAt": state.started_at,
            "completedAt": state.completed_at,
            "durationSeconds": round(duration, 3),
            "options": options,
            "postTypes": {pt: stats for pt, stats in state.per_post_type.items()},
            "totalRecords": state.total_records,
            "successful": state.processed_records - state.failed_records,
            "failed": state.failed_records,
            "errors": list(state.errors),
            "urlMappings": dict(state.url_mappings) if options.get("urlMapping", True) else None,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Allowed characters for Frontbase field names (prevent injection)
_SAFE_FIELD_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')

def _validate_field_name(name: str) -> bool:
    """Validate that a field name is safe (alphanumeric + underscore, not starting with digit)."""
    return bool(_SAFE_FIELD_PATTERN.match(name))

def _sanitize_mappings(mappings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove any mappings with unsafe field names."""
    sanitized = []
    for m in mappings:
        field_name = m.get("frontbaseField") or m.get("frontbase_field", "")
        if field_name and _validate_field_name(field_name):
            sanitized.append(m)
        else:
            logger.warning("Skipping mapping with unsafe field name: %s", field_name)
    return sanitized
def _resolve_path(record: Dict[str, Any], path: str) -> Any:
    """Resolve a dot-notation path (e.g. ``meta._price`` or ``acf.hero.title``)."""
    if not path:
        return None
    value: Any = record
    for part in path.split("."):
        if isinstance(value, dict):
            value = value.get(part)
        elif isinstance(value, list):
            try:
                value = value[int(part)]
            except (ValueError, IndexError):
                return None
        else:
            return None
        if value is None:
            return None
    return value


def _coerce(value: Any, transform: str) -> Any:
    """Coerce a value to the requested type; leave None untouched."""
    if value is None:
        return None
    t = (transform or "string").lower()
    try:
        if t == "integer":
            return int(value)
        if t in ("float", "number"):
            return float(value)
        if t == "boolean":
            if isinstance(value, bool):
                return value
            return str(value).strip().lower() in ("1", "true", "yes", "on")
        if t == "json":
            return value  # already structured (dict/list)
        # string / date / datetime → textual representation
        return str(value)
    except (ValueError, TypeError):
        return value


def _parse_iso(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
