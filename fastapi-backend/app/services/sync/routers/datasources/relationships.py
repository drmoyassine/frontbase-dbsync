"""
FK relationships endpoints for datasources.

GET lists relationships (native SQL FKs from cache + user-defined from
extra_config). POST/PUT/DELETE manage user-defined relationships, which are
how non-relational datasources (Google Sheets, REST) gain FK support.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.services.sync.models.table_schema import TableSchemaCache
from app.services.sync.adapters import get_adapter
from app.services.sync.services.schema_service import SchemaService
from app.services.sync.schemas.relationship import (
    RelationshipDefinition,
    RelationshipResponse,
    add_user_relationship,
    update_user_relationship,
    delete_user_relationship,
    get_user_relationships,
)
from app.services.sync.routers.datasources.dependencies import get_scoped_datasource

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.relationships")


@router.get("/{datasource_id}/relationships/")
async def get_datasource_relationships(
    refresh: bool = False,
    datasource: Datasource = Depends(get_scoped_datasource),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all foreign key relationships for all tables in a datasource.

    Uses cached schemas from SQLite (single source of truth).
    Use ?refresh=true to re-discover from external datasource.
    """
    try:
        # If refresh requested, re-discover all schemas
        if refresh:
            logger.info(f"Refreshing schemas for {datasource.id}")
            await SchemaService.refresh_all_schemas(db, datasource)

        # Get all cached schemas
        cached_result = await db.execute(
            select(TableSchemaCache).where(
                TableSchemaCache.datasource_id == datasource.id
            )
        )
        cached_list = cached_result.scalars().all()

        # If no cached schemas, trigger initial discovery
        if not cached_list:
            logger.info(f"No cached schemas found for {datasource.id}, triggering discovery")
            await SchemaService.discover_all_schemas(db, datasource)

            # Re-fetch after discovery
            cached_result = await db.execute(
                select(TableSchemaCache).where(
                    TableSchemaCache.datasource_id == datasource.id
                )
            )
            cached_list = cached_result.scalars().all()

        # Build tables list and relationships from cache
        tables = [cached.table_name for cached in cached_list]
        relationships = await SchemaService.get_all_relationships(db, datasource.id)

        logger.info(f"Returning {len(tables)} tables and {len(relationships)} relationships from cache")

        return {
            "tables": tables,
            "relationships": relationships
        }
    except Exception as e:
        # logger.exception logs the full traceback (not just str(e)) so prod
        # failures are diagnosable from the server logs, not just the response.
        logger.exception(f"Error fetching relationships for {datasource.id}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch relationships: {str(e)}")


# ── User-defined relationships (Sheets / REST / any datasource) ──────────────


@router.post("/{datasource_id}/relationships/", response_model=RelationshipResponse, status_code=201)
async def create_user_relationship(
    rel: RelationshipDefinition,
    datasource: Datasource = Depends(get_scoped_datasource),
    db: AsyncSession = Depends(get_db),
):
    """Add a user-defined relationship to the datasource (stored in extra_config)."""
    try:
        index = add_user_relationship(datasource, rel.model_dump())
        await db.commit()
        logger.info(f"[Relationships] Added {rel.from_table}.{rel.from_column} → "
                    f"{rel.to_table}.{rel.to_column} to datasource {datasource.id}")
        return RelationshipResponse(index=index, relationship=rel)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{datasource_id}/relationships/{index}/", response_model=RelationshipResponse)
async def update_relationship(
    index: int,
    rel: RelationshipDefinition,
    datasource: Datasource = Depends(get_scoped_datasource),
    db: AsyncSession = Depends(get_db),
):
    """Replace the user-defined relationship at `index`."""
    try:
        update_user_relationship(datasource, index, rel.model_dump())
        await db.commit()
        return RelationshipResponse(index=index, relationship=rel)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{datasource_id}/relationships/{index}/")
async def remove_relationship(
    index: int,
    datasource: Datasource = Depends(get_scoped_datasource),
    db: AsyncSession = Depends(get_db),
):
    """Remove the user-defined relationship at `index`."""
    try:
        removed = delete_user_relationship(datasource, index)
        await db.commit()
        logger.info(f"[Relationships] Removed relationship at index {index} from {datasource.id}")
        return {"success": True, "removed": removed}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{datasource_id}/relationships/user-defined/")
async def list_user_relationships(
    datasource: Datasource = Depends(get_scoped_datasource),
):
    """List only the user-defined relationships (raw, with index)."""
    rels = get_user_relationships(datasource)
    return {
        "relationships": [{"index": i, **r} for i, r in enumerate(rels)],
        "total": len(rels),
    }

