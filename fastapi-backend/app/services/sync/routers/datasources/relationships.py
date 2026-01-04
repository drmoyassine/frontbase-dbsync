"""
FK relationships discovery endpoints for datasources.
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

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.relationships")


@router.get("/{datasource_id}/relationships")
async def get_datasource_relationships(
    datasource_id: str,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """
    Get all foreign key relationships for all tables in a datasource.
    
    Uses cached schemas from SQLite (single source of truth).
    Use ?refresh=true to re-discover from external datasource.
    """
    result = await db.execute(select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    try:
        # If refresh requested, re-discover all schemas
        if refresh:
            logger.info(f"Refreshing schemas for {datasource_id}")
            await SchemaService.refresh_all_schemas(db, datasource)
        
        # Get all cached schemas
        cached_result = await db.execute(
            select(TableSchemaCache).where(
                TableSchemaCache.datasource_id == datasource_id
            )
        )
        cached_list = cached_result.scalars().all()
        
        # If no cached schemas, trigger initial discovery
        if not cached_list:
            logger.info(f"No cached schemas found for {datasource_id}, triggering discovery")
            await SchemaService.discover_all_schemas(db, datasource)
            
            # Re-fetch after discovery
            cached_result = await db.execute(
                select(TableSchemaCache).where(
                    TableSchemaCache.datasource_id == datasource_id
                )
            )
            cached_list = cached_result.scalars().all()
        
        # Build tables list and relationships from cache
        tables = [cached.table_name for cached in cached_list]
        relationships = await SchemaService.get_all_relationships(db, datasource_id)
        
        logger.info(f"Returning {len(tables)} tables and {len(relationships)} relationships from cache")
        
        return {
            "tables": tables,
            "relationships": relationships
        }
    except Exception as e:
        logger.error(f"Error fetching relationships for {datasource_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch relationships: {str(e)}")

