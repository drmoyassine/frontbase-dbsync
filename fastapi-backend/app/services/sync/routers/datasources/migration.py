"""
Supabase migration endpoints for datasources.
"""

import os
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.services.sync.adapters import get_adapter

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.migration")


@router.get("/{datasource_id}/check-migration")
async def check_datasource_migration(
    datasource_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Check if Frontbase migration has been applied to a Supabase datasource.
    Returns status of required RPC functions.
    """
    result = await db.execute(select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    # Only applicable for Supabase
    if datasource.type.value != "supabase":
        return {"applicable": False, "reason": "Migration only applies to Supabase datasources"}
    
    try:
        adapter = get_adapter(datasource)
        async with adapter:
            if hasattr(adapter, 'check_migration_status'):
                status = await adapter.check_migration_status()
                return {"applicable": True, **status}
            else:
                return {"applicable": False, "reason": "Adapter does not support migration check"}
    except Exception as e:
        logger.error(f"Error checking migration for {datasource_id}: {str(e)}")
        return {"applicable": True, "applied": False, "error": str(e)}


@router.post("/{datasource_id}/apply-migration")
async def apply_datasource_migration(
    datasource_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Apply Frontbase migration SQL to a Supabase datasource.
    Creates required RPC functions for schema introspection, user management, etc.
    """
    result = await db.execute(select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    # Only applicable for Supabase
    if datasource.type.value != "supabase":
        raise HTTPException(status_code=400, detail="Migration only applies to Supabase datasources")
    
    # Read migration SQL file
    migration_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", "supabase_setup.sql")
    migration_path = os.path.abspath(migration_path)
    
    if not os.path.exists(migration_path):
        # Try alternative path
        migration_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", "..", "supabase_setup.sql")
        migration_path = os.path.abspath(migration_path)
    
    if not os.path.exists(migration_path):
        raise HTTPException(status_code=500, detail="Migration SQL file not found")
    
    with open(migration_path, "r", encoding="utf-8") as f:
        migration_sql = f.read()
    
    try:
        adapter = get_adapter(datasource)
        async with adapter:
            if hasattr(adapter, 'apply_migration'):
                result = await adapter.apply_migration(migration_sql)
                if result.get("success"):
                    return {"success": True, "message": "Migration applied successfully", **result}
                else:
                    raise HTTPException(status_code=500, detail=f"Migration failed: {result.get('error')}")
            else:
                raise HTTPException(status_code=400, detail="Adapter does not support migration apply")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error applying migration for {datasource_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to apply migration: {str(e)}")
