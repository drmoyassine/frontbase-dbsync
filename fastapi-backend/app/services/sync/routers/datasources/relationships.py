"""
FK relationships discovery endpoints for datasources.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.services.sync.adapters import get_adapter

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.relationships")


@router.get("/{datasource_id}/relationships")
async def get_datasource_relationships(
    datasource_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get all foreign key relationships for all tables in a datasource.
    Returns a list of relationships with source/target table/column info.
    Uses a single optimized query instead of looping through tables.
    """
    result = await db.execute(select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    try:
        adapter = get_adapter(datasource)
        async with adapter:
            # Get tables and all relationships in parallel (fast)
            tables = await adapter.get_tables()
            
            # Use optimized single-query method if available
            if hasattr(adapter, 'get_all_relationships'):
                relationships = await adapter.get_all_relationships()
            else:
                # Fallback for adapters without the optimized method
                relationships = []
                for table in tables:
                    schema = await adapter.get_schema(table)
                    for col in schema.get("columns", []):
                        if col.get("is_foreign"):
                            relationships.append({
                                "source_table": table,
                                "source_column": col["name"],
                                "target_table": col.get("foreign_table"),
                                "target_column": col.get("foreign_column"),
                            })
            
            return {
                "tables": tables,
                "relationships": relationships
            }
    except Exception as e:
        logger.error(f"Error fetching relationships for {datasource_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch relationships: {str(e)}")
