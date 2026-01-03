"""
CRUD operations for datasources.
"""

import logging
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.services.sync.schemas.datasource import (
    DatasourceCreate,
    DatasourceUpdate,
    DatasourceResponse,
)
from app.services.sync.adapters import get_adapter

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.crud")


@router.post("/", response_model=DatasourceResponse, status_code=status.HTTP_201_CREATED)
async def create_datasource(
    data: DatasourceCreate,
    db: AsyncSession = Depends(get_db)
):
    """Register a new datasource."""
    # Check for duplicate name
    existing_result = await db.execute(
        select(Datasource).where(Datasource.name == data.name)
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Datasource with name '{data.name}' already exists"
        )

    # TODO: Encrypt password and api_key before storing
    datasource = Datasource(
        name=data.name,
        type=data.type,
        host=data.host,
        port=data.port,
        database=data.database,
        username=data.username,
        password_encrypted=data.password,  # TODO: encrypt
        api_url=data.api_url,
        api_key_encrypted=data.api_key,  # Service role key
        anon_key_encrypted=data.anon_key,  # Anon key
        table_prefix=data.table_prefix,
        extra_config=json.dumps(data.extra_config) if data.extra_config else None,
    )
    
    db.add(datasource)
    await db.commit()
    
    # Sync Supabase credentials to Frontbase project_settings
    if data.type.value == "supabase" and data.api_url:
        try:
            from app.database.config import SessionLocal
            from app.database.utils import update_project_settings, encrypt_data
            
            with SessionLocal() as frontbase_db:
                update_data = {
                    "supabase_url": data.api_url,
                }
                if data.anon_key:
                    update_data["supabase_anon_key"] = data.anon_key
                if data.api_key:  # Service role key
                    update_data["supabase_service_key_encrypted"] = encrypt_data(data.api_key)
                
                update_project_settings(frontbase_db, "default", update_data)
                logger.info(f"Synced Supabase credentials to Frontbase project_settings")
        except Exception as e:
            logger.warning(f"Failed to sync Supabase credentials to Frontbase: {e}")
    
    # Re-fetch with relationships to avoid 500 in serialization
    result = await db.execute(
        select(Datasource)
        .options(selectinload(Datasource.views))
        .where(Datasource.id == datasource.id)
    )
    datasource = result.scalar_one()
    
    return datasource


@router.get("/", response_model=List[DatasourceResponse])
async def list_datasources(
    db: AsyncSession = Depends(get_db)
):
    """List all registered datasources."""
    import time
    start_time = time.time()
    
    result = await db.execute(
        select(Datasource)
        .options(selectinload(Datasource.views))
        .order_by(Datasource.created_at.desc())
    )
    datasources = result.scalars().all()
    
    duration = time.time() - start_time
    logger.info(f"list_datasources took {duration:.4f}s for {len(datasources)} records")
    
    return datasources


@router.get("/{datasource_id}", response_model=DatasourceResponse)
async def get_datasource(
    datasource_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific datasource by ID."""
    result = await db.execute(
        select(Datasource)
        .options(selectinload(Datasource.views))
        .where(Datasource.id == datasource_id)
    )
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Datasource not found"
        )
    
    return datasource


@router.put("/{datasource_id}", response_model=DatasourceResponse)
async def update_datasource(
    datasource_id: str,
    data: DatasourceUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a datasource."""
    result = await db.execute(
        select(Datasource).where(Datasource.id == datasource_id)
    )
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Datasource not found"
        )
    
    # Update fields if provided
    update_data = data.model_dump(exclude_unset=True)
    sensitive_fields = ["host", "port", "database", "username", "password", "connection_uri", "api_url", "api_key"]
    should_reset_test = any(field in update_data for field in sensitive_fields)
    
    for field, value in update_data.items():
        if field == "password" and value:
            setattr(datasource, "password_encrypted", value)  # TODO: encrypt
        elif field == "api_key" and value:
            setattr(datasource, "api_key_encrypted", value)  # TODO: encrypt
        elif hasattr(datasource, field):
            setattr(datasource, field, value)
            
    if should_reset_test:
        datasource.last_test_success = None
        datasource.last_tested_at = None
    
    await db.commit()
    await db.refresh(datasource)
    
    return datasource


@router.delete("/{datasource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_datasource(
    datasource_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a datasource."""
    result = await db.execute(
        select(Datasource).where(Datasource.id == datasource_id)
    )
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Datasource not found"
        )
    
    await db.delete(datasource)
    await db.commit()
