"""
Saved views management for datasources.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.services.sync.models.view import DatasourceView
from app.services.sync.schemas.datasource import (
    DatasourceViewCreate,
    DatasourceViewResponse
)

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.views")


@router.get("/{datasource_id}/views", response_model=List[DatasourceViewResponse])
async def list_datasource_views(
    datasource_id: str,
    db: AsyncSession = Depends(get_db)
):
    """List all views for a specific datasource."""
    result = await db.execute(select(DatasourceView).where(DatasourceView.datasource_id == datasource_id))
    return result.scalars().all()


@router.post("/{datasource_id}/views", response_model=DatasourceViewResponse, status_code=status.HTTP_201_CREATED)
async def create_datasource_view(
    datasource_id: str,
    view: DatasourceViewCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new view for a datasource."""
    # Verify datasource exists
    ds_result = await db.execute(select(Datasource).where(Datasource.id == datasource_id))
    if not ds_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    # Check for duplicate name
    existing_view = await db.execute(select(DatasourceView).where(DatasourceView.name == view.name))
    if existing_view.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A view with the name '{view.name}' already exists"
        )
        
    db_view = DatasourceView(
        name=view.name,
        description=view.description,
        datasource_id=datasource_id,
        target_table=view.target_table,
        filters=view.filters,
        field_mappings=view.field_mappings,
        linked_views=view.linked_views,
        visible_columns=view.visible_columns,
        pinned_columns=view.pinned_columns,
        column_order=view.column_order,
        webhooks=view.webhooks
    )
    db.add(db_view)
    await db.commit()
    await db.refresh(db_view)
    return db_view
