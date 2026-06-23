"""
WordPress import endpoints.

    POST /api/sync/wordpress/import/                 -> start import, returns {import_id}
    GET  /api/sync/wordpress/import/{import_id}/progress/   -> SSE progress stream
    GET  /api/sync/wordpress/import/{import_id}/           -> final result (JSON)

The import runs as a detached asyncio task; the SSE endpoint streams progress
to the browser. SSE here is a plain ``StreamingResponse`` (no BaseHTTPMiddleware
in the stack — see main.py), matching the /api/agent/chat streaming pattern.

SECURITY: All endpoints validate tenant ownership of imports before returning data.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.middleware.tenant_context import TenantContext, get_tenant_context
from app.models.models import Project
from app.services.sync.adapters import get_adapter
from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource, DatasourceType
from app.services.wordpress import WordPressImportService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()
logger = logging.getLogger("app.routers.wordpress")

# Module-level singleton: the in-memory progress store must be shared between
# the start endpoint and the SSE reader. (Single-process; swap for a Redis
# store to support multiple workers — see ImportProgressStore.)
import_service = WordPressImportService()

_TERMINAL = ("completed", "failed", "partial")
_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  # disable nginx buffering for realtime SSE
}


class WordPressImportRequest(BaseModel):
    """Body for POST /import/."""

    datasource_id: str
    options: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("options")
    @classmethod
    def validate_options(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        """Validate import options for security constraints."""
        # Limit post types to prevent abuse
        post_types = v.get("postTypes", [])
        if isinstance(post_types, list):
            if len(post_types) > 20:
                raise ValueError("Cannot import more than 20 post types at once")
            # Validate each post type name is safe
            for pt in post_types:
                if not isinstance(pt, str) or not pt or len(pt) > 50:
                    raise ValueError("Invalid post type name")

        # Validate field mappings size (prevent DoS via massive mappings)
        field_mappings = v.get("fieldMappings", {})
        if isinstance(field_mappings, dict):
            total_mappings = sum(len(m) if isinstance(m, (list, dict)) else 1 for m in field_mappings.values())
            if total_mappings > 500:
                raise ValueError("Field mappings too large (max 500 total mappings)")

        return v


async def _load_owned_datasource(
    db: AsyncSession, ctx: TenantContext | None, datasource_id: str
) -> Datasource:
    """Fetch a datasource by ID and enforce tenant ownership (body-provided id)."""
    result = await db.execute(
        select(Datasource)
        .options(selectinload(Datasource.views))
        .where(Datasource.id == datasource_id)
    )
    datasource = result.scalar_one_or_none()
    if not datasource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Datasource not found")

    if ctx and ctx.tenant_id and not ctx.is_master:
        project_result = await db.execute(select(Project).where(Project.tenant_id == ctx.tenant_id))
        project = project_result.scalar_one_or_none()
        if not project or datasource.project_id != str(project.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Datasource not found")
    elif ctx and ctx.is_master:
        if datasource.project_id is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Datasource not found")

    return datasource


def _sse(event: str, payload: Any) -> str:
    """Format a Server-Sent Events frame."""
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


@router.post("/import/", summary="Start a WordPress import")
async def start_import(
    body: WordPressImportRequest,
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
) -> Dict[str, str]:
    """Start a WordPress → Frontbase import and return its ``import_id``."""
    datasource = await _load_owned_datasource(db, ctx, body.datasource_id)

    if datasource.type != DatasourceType.WORDPRESS_PLUGIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Datasource is of type {datasource.type.value}, not wordpress_plugin.",
        )

    options = dict(body.options)
    if not options.get("postTypes"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="options.postTypes must list at least one post type to import.",
        )

    adapter = get_adapter(datasource)
    tenant_id = ctx.tenant_id if ctx else None
    try:
        import_id = await import_service.start(adapter, str(datasource.id), tenant_id, options)
    except Exception as exc:
        logger.exception("Failed to start WordPress import for %s", datasource.id)
        # Sanitize error message - don't leak internal details
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start import. Please check the datasource configuration and try again."
        )

    return {"import_id": import_id}


@router.get("/import/{import_id}/progress/", summary="SSE stream of import progress")
async def import_progress_stream(
    import_id: str,
    ctx: TenantContext | None = Depends(get_tenant_context),
) -> StreamingResponse:
    """Stream import progress as Server-Sent Events.

    Emits ``progress`` frames while running and a final ``complete`` frame
    (carrying the full result) when the import reaches a terminal state.

    CRITICAL: Validates tenant ownership before streaming. Returns 404 if
    the import doesn't exist or doesn't belong to the requesting tenant.
    """

    tenant_id = ctx.tenant_id if ctx else None

    async def event_stream() -> AsyncIterator[str]:
        last_processed = -1
        # Grace period: allow the background task a moment to register progress.
        misses = 0
        try:
            while True:
                # Validate tenant access on each poll (handles edge cases)
                progress = import_service.get_progress(import_id, tenant_id)
                if progress is None:
                    misses += 1
                    if misses > 20:
                        yield _sse("complete", {"status": "failed", "errors": [{"message": "Import not found or access denied"}]})
                        return
                    yield ": ping\n\n"
                    await asyncio.sleep(0.25)
                    continue

                misses = 0
                # Emit progress when records advance or on terminal transition
                if progress.get("processedRecords") != last_processed or progress.get("status") in _TERMINAL:
                    yield _sse("progress", progress)
                    last_processed = progress.get("processedRecords", -1)

                if progress.get("status") in _TERMINAL:
                    result = import_service.get_result(import_id, tenant_id) or progress
                    yield _sse("complete", result)
                    return

                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            # Client disconnected — stop streaming cleanly.
            raise

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=_SSE_HEADERS)


@router.get("/import/{import_id}/", summary="Final import result (JSON)")
async def get_import_result(
    import_id: str,
    ctx: TenantContext | None = Depends(get_tenant_context),
) -> Dict[str, Any]:
    """Return the final result of a completed/failed import.

    CRITICAL: Validates tenant ownership. Returns 404 if the import doesn't
    exist or doesn't belong to the requesting tenant.
    """
    tenant_id = ctx.tenant_id if ctx else None

    # Use check_access which returns None if tenant doesn't own the import
    state = import_service.check_access(import_id, tenant_id)
    if state is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import not found")

    result = import_service.get_result(import_id, tenant_id)
    if result is None:
        progress = import_service.get_progress(import_id, tenant_id)
        if progress is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import not found")
        return {"status": "running", "progress": progress}
    return result
