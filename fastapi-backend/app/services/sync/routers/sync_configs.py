"""
Sync Configs API router - CRUD operations for sync configurations.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.services.sync.database import get_db
from app.services.sync.models.sync_config import SyncConfig, FieldMapping
from app.services.sync.models.datasource import Datasource
from app.services.sync.schemas.sync_config import (
    SyncConfigCreate,
    SyncConfigUpdate,
    SyncConfigResponse,
)


router = APIRouter()


@router.post("/", response_model=SyncConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_sync_config(
    data: SyncConfigCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new sync configuration."""
    # Verify datasources exist
    for ds_id in [data.master_datasource_id, data.slave_datasource_id]:
        result = await db.execute(
            select(Datasource).where(Datasource.id == ds_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Datasource {ds_id} not found"
            )
    
    # Create sync config
    sync_config = SyncConfig(
        name=data.name,
        description=data.description,
        master_datasource_id=data.master_datasource_id,
        slave_datasource_id=data.slave_datasource_id,
        master_view_id=data.master_view_id,
        slave_view_id=data.slave_view_id,
        master_table=data.master_table,
        slave_table=data.slave_table,
        master_pk_column=data.master_pk_column,
        slave_pk_column=data.slave_pk_column,
        conflict_strategy=data.conflict_strategy,
        webhook_url=data.webhook_url,
        sync_deletes=data.sync_deletes,
        batch_size=data.batch_size,
        cron_schedule=data.cron_schedule,
    )
    
    # Add field mappings
    for mapping_data in data.field_mappings:
        mapping = FieldMapping(
            master_column=mapping_data.master_column,
            slave_column=mapping_data.slave_column,
            transform=mapping_data.transform,
            is_key_field=mapping_data.is_key_field,
            skip_sync=mapping_data.skip_sync,
        )
        sync_config.field_mappings.append(mapping)
    
    db.add(sync_config)
    await db.commit()
    await db.refresh(sync_config)
    
    return sync_config


@router.get("/", response_model=List[SyncConfigResponse])
async def list_sync_configs(
    db: AsyncSession = Depends(get_db)
):
    """List all sync configurations."""
    result = await db.execute(
        select(SyncConfig)
        .options(selectinload(SyncConfig.field_mappings))
        .order_by(SyncConfig.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{config_id}", response_model=SyncConfigResponse)
async def get_sync_config(
    config_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific sync configuration."""
    result = await db.execute(
        select(SyncConfig)
        .options(selectinload(SyncConfig.field_mappings))
        .where(SyncConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sync config not found"
        )
    
    return config


@router.put("/{config_id}", response_model=SyncConfigResponse)
async def update_sync_config(
    config_id: str,
    data: SyncConfigUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a sync configuration."""
    result = await db.execute(
        select(SyncConfig)
        .options(selectinload(SyncConfig.field_mappings))
        .where(SyncConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sync config not found"
        )
    
    # Update fields
    update_data = data.model_dump(exclude_unset=True, exclude={"field_mappings"})
    for field, value in update_data.items():
        if hasattr(config, field):
            setattr(config, field, value)
    
    # Update field mappings if provided
    if data.field_mappings is not None:
        # Clear existing mappings
        config.field_mappings.clear()
        
        # Add new mappings
        for mapping_data in data.field_mappings:
            mapping = FieldMapping(
                sync_config_id=config.id,
                master_column=mapping_data.master_column,
                slave_column=mapping_data.slave_column,
                transform=mapping_data.transform,
                is_key_field=mapping_data.is_key_field,
                skip_sync=mapping_data.skip_sync,
            )
            config.field_mappings.append(mapping)
    
    await db.commit()
    await db.refresh(config)
    
    return config


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sync_config(
    config_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a sync configuration."""
    result = await db.execute(
        select(SyncConfig).where(SyncConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sync config not found"
        )
    
    await db.delete(config)
    await db.commit()
