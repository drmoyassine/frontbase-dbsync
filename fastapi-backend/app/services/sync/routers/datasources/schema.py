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

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.schema")


@router.get("/{datasource_id}/tables/", response_model=List[str])
async def get_datasource_tables(
    datasource_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get list of tables/resources from a datasource."""
    result = await db.execute(select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    try:
        adapter = get_adapter(datasource)
        async with adapter:
            return await adapter.get_tables()
    except Exception as e:
        logger.error(f"Error fetching tables for {datasource_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch tables: {str(e)}")


@router.get("/{datasource_id}/tables/{table}/schema/", response_model=TableSchema)
async def get_table_schema(
    datasource_id: str,
    table: str,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """
    Get schema for a specific table in a datasource.
    
    Schema is cached in SQLite for instant subsequent loads.
    Use ?refresh=true to force a fresh fetch from the source.
    """
    result = await db.execute(select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    # Check for cached schema (unless refresh requested)
    if not refresh:
        cache_result = await db.execute(
            select(TableSchemaCache).where(
                TableSchemaCache.datasource_id == datasource_id,
                TableSchemaCache.table_name == table
            )
        )
        cached = cache_result.scalar_one_or_none()
        if cached:
            logger.debug(f"Schema cache hit for {datasource_id}/{table}")
            return TableSchema(columns=cached.columns, foreign_keys=cached.foreign_keys or [])
    
    # No cache or refresh requested - fetch from source
    try:
        adapter = get_adapter(datasource)
        async with adapter:
            schema = await adapter.get_schema(table)
        
        # Store in cache (upsert)
        if refresh:
            await db.execute(
                delete(TableSchemaCache).where(
                    TableSchemaCache.datasource_id == datasource_id,
                    TableSchemaCache.table_name == table
                )
            )
        
        new_cache = TableSchemaCache(
            datasource_id=datasource_id,
            table_name=table,
            columns=schema["columns"],
            foreign_keys=schema.get("foreign_keys", [])
        )
        db.add(new_cache)
        await db.commit()
        
        logger.info(f"Schema fetched and cached for {datasource_id}/{table}")
        return TableSchema(**schema)
    except Exception as e:
        logger.error(f"Error fetching schema for {datasource_id} table {table}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch schema: {str(e)}")


# Session endpoints for draft layout/config
@router.post("/{datasource_id}/tables/{table_name}/session/")
async def save_table_session(datasource_id: str, table_name: str, session_data: Dict[str, Any]):
    """Save draft layout/config to Redis session (optional - gracefully degrades if Redis unavailable)."""
    key = f"session:{datasource_id}:{table_name}"
    ttl = settings.sync_state_ttl
    success = await cache_set(settings.redis_url, key, session_data, ttl=ttl)
    if not success:
        logger.warning(f"Redis unavailable - session data not persisted for {table_name}")
        return {"status": "ok", "persisted": False, "message": "Redis unavailable - changes not saved"}
    return {"status": "ok", "persisted": True}


@router.get("/{datasource_id}/tables/{table_name}/session/")
async def get_table_session(datasource_id: str, table_name: str):
    """Retrieve draft layout/config from Redis session."""
    key = f"session:{datasource_id}:{table_name}"
    data = await cache_get(settings.redis_url, key)
    return data or {}


@router.delete("/{datasource_id}/tables/{table_name}/session")
async def clear_table_session(datasource_id: str, table_name: str):
    """Clear draft layout/config from Redis session."""
    key = f"session:{datasource_id}:{table_name}"
    await cache_delete_pattern(settings.redis_url, key)
    return {"status": "ok"}
