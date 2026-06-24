"""
Schema and table discovery endpoints for datasources.
"""

import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.services.sync.models.table_schema import TableSchemaCache
from app.services.sync.schemas.datasource import TableSchema
from app.services.sync.adapters import get_adapter
from app.services.sync.config import settings
from app.services.sync.redis_client import cache_get, cache_set, cache_delete_pattern
from app.services.sync.routers.datasources.dependencies import get_scoped_datasource

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.schema")


@router.get("/{datasource_id}/tables/", response_model=List[str])
async def get_datasource_tables(
    datasource: Datasource = Depends(get_scoped_datasource),
    db: AsyncSession = Depends(get_db)
):
    """Get list of tables/resources from a datasource."""
    try:
        adapter = get_adapter(datasource, db)
        async with adapter:
            return await adapter.get_tables()
    except Exception as e:
        logger.error(f"Error fetching tables for {datasource.id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch tables: {str(e)}")


@router.get("/{datasource_id}/tables/{table}/schema/", response_model=TableSchema)
async def get_table_schema(
    table: str,
    refresh: bool = False,
    datasource: Datasource = Depends(get_scoped_datasource),
    db: AsyncSession = Depends(get_db)
):
    """
    Get schema for a specific table in a datasource.
    
    Schema is cached in SQLite for instant subsequent loads.
    Use ?refresh=true to force a fresh fetch from the source.
    """
    # Check for cached schema (unless refresh requested)
    if not refresh:
        cache_result = await db.execute(
            select(TableSchemaCache).where(
                TableSchemaCache.datasource_id == datasource.id,
                TableSchemaCache.table_name == table
            )
        )
        cached = cache_result.scalar_one_or_none()
        if cached:
            import json
            logger.debug(f"Schema cache hit for {datasource.id}/{table}")

            # Defensive: handle columns/foreign_keys as string (legacy) or list
            columns = cached.columns or []
            if isinstance(columns, str):
                try:
                    columns = json.loads(columns)
                except (json.JSONDecodeError, TypeError):
                    columns = []

            fk_data = cached.foreign_keys or []
            if isinstance(fk_data, str):
                try:
                    fk_data = json.loads(fk_data)
                except (json.JSONDecodeError, TypeError):
                    fk_data = []

            # Merge user-defined FKs (Sheets/REST) for this table
            from app.services.sync.schemas.relationship import get_user_foreign_keys_for_table
            user_fks = get_user_foreign_keys_for_table(datasource, table)
            if user_fks:
                fk_data = list(fk_data) + user_fks

            return TableSchema(columns=columns, foreign_keys=fk_data)  # type: ignore[arg-type]
    
    # No cache or refresh requested - fetch from source
    try:
        adapter = get_adapter(datasource, db)
        async with adapter:
            schema = await adapter.get_schema(table)

        native_columns = schema.get("columns", [])
        native_fks = schema.get("foreign_keys", [])

        # Store native schema in cache (upsert). User-defined FKs are NOT
        # cached — they live in extra_config and are merged at read time so
        # they always survive schema refreshes.
        if refresh:
            await db.execute(
                delete(TableSchemaCache).where(
                    TableSchemaCache.datasource_id == datasource.id,
                    TableSchemaCache.table_name == table
                )
            )

        new_cache = TableSchemaCache(
            datasource_id=datasource.id,
            table_name=table,
            columns=native_columns,
            foreign_keys=native_fks
        )
        db.add(new_cache)
        await db.commit()

        # Merge user-defined FKs into the response
        from app.services.sync.schemas.relationship import get_user_foreign_keys_for_table
        user_fks = get_user_foreign_keys_for_table(datasource, table)
        response_fks = list(native_fks) + user_fks if user_fks else native_fks

        logger.info(f"Schema fetched and cached for {datasource.id}/{table}")
        return TableSchema(columns=native_columns, foreign_keys=response_fks)  # type: ignore[arg-type]
    except Exception as e:
        logger.error(f"Error fetching schema for {datasource.id} table {table}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch schema: {str(e)}")


# Session endpoints for draft layout/config
@router.post("/{datasource_id}/tables/{table_name}/session/")
async def save_table_session(
    table_name: str,
    session_data: Dict[str, Any],
    datasource: Datasource = Depends(get_scoped_datasource)
):
    """Save draft layout/config to Redis session (optional - gracefully degrades if Redis unavailable)."""
    key = f"session:{datasource.id}:{table_name}"
    ttl = settings.sync_state_ttl
    success = await cache_set(settings.redis_url, key, session_data, ttl=ttl)
    if not success:
        logger.warning(f"Redis unavailable - session data not persisted for {table_name}")
        return {"status": "ok", "persisted": False, "message": "Redis unavailable - changes not saved"}
    return {"status": "ok", "persisted": True}


@router.get("/{datasource_id}/tables/{table_name}/session/")
async def get_table_session(
    table_name: str,
    datasource: Datasource = Depends(get_scoped_datasource)
):
    """Retrieve draft layout/config from Redis session."""
    key = f"session:{datasource.id}:{table_name}"
    data = await cache_get(settings.redis_url, key)
    return data or {}


@router.delete("/{datasource_id}/tables/{table_name}/session/")
async def clear_table_session(
    table_name: str,
    datasource: Datasource = Depends(get_scoped_datasource)
):
    """Clear draft layout/config from Redis session."""
    key = f"session:{datasource.id}:{table_name}"
    await cache_delete_pattern(settings.redis_url, key)
    return {"status": "ok"}
