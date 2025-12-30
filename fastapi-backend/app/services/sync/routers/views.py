"""
Router for Datasource Views.
"""

import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.services.sync.database import get_db
from app.services.sync.models.view import DatasourceView
from app.services.sync.models.datasource import Datasource
from app.services.sync.schemas.datasource import DatasourceViewCreate, DatasourceViewUpdate, DatasourceViewResponse
from app.services.sync.adapters import get_adapter
from app.services.sync.services.expression_engine import ExpressionEngine

engine = ExpressionEngine()
logger = logging.getLogger(__name__)

router = APIRouter()




@router.get("/views/{view_id}", response_model=DatasourceViewResponse)
async def get_datasource_view(
    view_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific datasource view."""
    result = await db.execute(select(DatasourceView).where(DatasourceView.id == view_id))
    db_view = result.scalar_one_or_none()
    
    if not db_view:
        raise HTTPException(status_code=404, detail="View not found")
        
    return db_view


@router.patch("/views/{view_id}", response_model=DatasourceViewResponse)
async def update_datasource_view(
    view_id: str,
    view_update: DatasourceViewUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update an existing datasource view."""
    result = await db.execute(select(DatasourceView).where(DatasourceView.id == view_id))
    db_view = result.scalar_one_or_none()
    
    if not db_view:
        raise HTTPException(status_code=404, detail="View not found")
        
    # Update fields
    update_data = view_update.model_dump(exclude_unset=True)
    
    # Check for duplicate name if name is being updated
    if "name" in update_data and update_data["name"] != db_view.name:
        existing_view = await db.execute(select(DatasourceView).where(DatasourceView.name == update_data["name"]))
        if existing_view.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A view with the name '{update_data['name']}' already exists"
            )

    for key, value in update_data.items():
        setattr(db_view, key, value)
        
    await db.commit()
    await db.refresh(db_view)
    return db_view


@router.get("/views/{view_id}/records")
async def get_view_records(
    view_id: str,
    page: int = 1,
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
):
    """
    Get data matching the view's filters with pagination.
    
    - **page**: Page number (1-indexed, default 1)
    - **limit**: Records per page (default 10)
    
    Returns paginated records with total count and page info.
    """
    if page < 1:
        page = 1
    if limit < 1:
        limit = 10
    if limit > 100:
        limit = 100  # Cap at 100 records per page
    
    offset = (page - 1) * limit
    
    # 1. Get the view definition
    result = await db.execute(select(DatasourceView).where(DatasourceView.id == view_id))
    db_view = result.scalar_one_or_none()
    
    if not db_view:
        raise HTTPException(status_code=404, detail="View not found")
        
    # 2. Get the datasource
    ds_result = await db.execute(select(Datasource).where(Datasource.id == db_view.datasource_id))
    ds = ds_result.scalar_one_or_none()
    
    if not ds:
        raise HTTPException(status_code=404, detail="Associated datasource not found")
        
    # 3. Get adapter and fetch data
    adapter = get_adapter(ds)
    async with adapter:
        records = await adapter.read_records(
            table=db_view.target_table, 
            limit=limit,
            offset=offset,
            where=db_view.filters
        )
        total = await adapter.count_records(
            table=db_view.target_table, 
            where=db_view.filters
        )
        # Ensure total is never less than actual records returned
        total = max(total, len(records) + offset)
    
    # 4. Apply transformations & handle Linked Views (Backend Join)
    enriched_records = []
    for record in records:
        enriched_record = dict(record)
        
        # Apply Field Mappings / Transformations using ExpressionEngine
        if db_view.field_mappings:
            for target_col, expression in db_view.field_mappings.items():
                value = engine.evaluate(expression, enriched_record)
                if value is not None:
                    enriched_record[target_col] = value
        
        # Handle Linked Views
        if db_view.linked_views:
            for key, link_config in db_view.linked_views.items():
                linked_view_id = link_config.get("view_id")
                join_on = enriched_record.get(link_config.get("join_on", "id"))
                
                if linked_view_id and join_on:
                    try:
                        # Recursive call (or fetch directly) to get linked data
                        # For now, we'll do a simple fetch to avoid deep nesting complexity
                        linked_result = await db.execute(select(DatasourceView).where(DatasourceView.id == linked_view_id))
                        l_view = linked_result.scalar_one_or_none()
                        if l_view:
                            l_ds_result = await db.execute(select(Datasource).where(Datasource.id == l_view.datasource_id))
                            l_ds = l_ds_result.scalar_one_or_none()
                            if l_ds:
                                l_adapter = get_adapter(l_ds)
                                async with l_adapter:
                                    linked_data = await l_adapter.read_records(
                                        table=l_view.target_table,
                                        limit=1,
                                        where=[{"field": link_config.get("target_key", "id"), "operator": "==", "value": str(join_on)}]
                                    )
                                    if linked_data:
                                        enriched_record[key] = linked_data[0]
                    except Exception as e:
                        logger.warning(f"Failed to fetch linked record for {key}: {e}")
        
        enriched_records.append(enriched_record)
    
    # 5. Filter to visible columns only (if configured)
    if db_view.visible_columns and len(db_view.visible_columns) > 0:
        filtered_records = []
        for rec in enriched_records:
            filtered_rec = {k: v for k, v in rec.items() if k in db_view.visible_columns}
            filtered_records.append(filtered_rec)
        enriched_records = filtered_records
    
    # Calculate pagination info
    import math
    from datetime import datetime, timezone
    total_pages = math.ceil(total / limit) if limit > 0 else 1
        
    return {
        "records": enriched_records,
        "total_records": total,
        "current_page": page,
        "total_pages": total_pages,
        "per_page": limit,
        "view_name": db_view.name,
        "datasource_name": ds.name,
        "target_table": db_view.target_table,
        "visible_columns": db_view.visible_columns or [],
        "timestamp_utc": datetime.now(timezone.utc).isoformat()
    }


@router.get("/views/{view_id}/count")
async def get_view_count(
    view_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get the total number of records matching a view's filters.
    
    This is a lightweight endpoint that only returns the count,
    useful for displaying totals without fetching all data.
    """
    # 1. Get the view definition
    result = await db.execute(select(DatasourceView).where(DatasourceView.id == view_id))
    db_view = result.scalar_one_or_none()
    
    if not db_view:
        raise HTTPException(status_code=404, detail="View not found")
        
    # 2. Get the datasource
    ds_result = await db.execute(select(Datasource).where(Datasource.id == db_view.datasource_id))
    ds = ds_result.scalar_one_or_none()
    
    if not ds:
        raise HTTPException(status_code=404, detail="Associated datasource not found")
        
    # 3. Get adapter and count records
    adapter = get_adapter(ds)
    async with adapter:
        total = await adapter.count_records(
            table=db_view.target_table, 
            where=db_view.filters
        )
        
    from datetime import datetime, timezone
    return {
        "view_id": view_id,
        "view_name": db_view.name,
        "total_records": total,
        "target_table": db_view.target_table,
        "datasource_name": ds.name,
        "timestamp_utc": datetime.now(timezone.utc).isoformat()
    }


@router.post("/views/{view_id}/records", status_code=status.HTTP_201_CREATED)
async def create_view_record(
    view_id: str,
    record: Dict[str, Any],
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new record in the table associated with this view.
    """
    result = await db.execute(select(DatasourceView).where(DatasourceView.id == view_id))
    db_view = result.scalar_one_or_none()
    
    if not db_view:
        raise HTTPException(status_code=404, detail="View not found")
        
    ds_result = await db.execute(select(Datasource).where(Datasource.id == db_view.datasource_id))
    ds = ds_result.scalar_one_or_none()
    
    adapter = get_adapter(ds)
    async with adapter:
        # Note: adapters use upsert, but we can call it POST for semantic clarity
        success = await adapter.upsert_record(
            table=db_view.target_table,
            record=record
        )
        
    if not success:
        raise HTTPException(status_code=500, detail="Failed to create record")
        
    return {"success": True, "message": "Record created successfully"}


@router.patch("/views/{view_id}/records")
async def patch_view_record(
    view_id: str,
    record: Dict[str, Any],
    key_column: str = "id",
    db: AsyncSession = Depends(get_db)
):
    """
    Partially update an existing record in the table associated with this view.
    """
    result = await db.execute(select(DatasourceView).where(DatasourceView.id == view_id))
    db_view = result.scalar_one_or_none()
    
    if not db_view:
        raise HTTPException(status_code=404, detail="View not found")
        
    ds_result = await db.execute(select(Datasource).where(Datasource.id == db_view.datasource_id))
    ds = ds_result.scalar_one_or_none()
    
    adapter = get_adapter(ds)
    async with adapter:
        # For patch, we might want to fetch existing record first or rely on adapter's upsert
        # Most our current adapters (SQL) handle upsert as 'merge'
        success = await adapter.upsert_record(
            table=db_view.target_table,
            record=record,
            key_column=key_column
        )
        
    if not success:
        raise HTTPException(status_code=500, detail="Failed to patch record")
        
    return {"success": True, "message": "Record patched successfully"}


async def forward_webhook(url: str, payload: Dict[str, Any]):
    """Helper to forward payload to an external URL."""
    try:
        async with httpx.AsyncClient() as client:
            await client.post(url, json=payload, timeout=10.0)
    except Exception as e:
        logger.error(f"Failed to forward webhook to {url}: {e}")


@router.post("/views/{view_id}/trigger")
async def trigger_view_webhook(
    view_id: str,
    payload: Dict[str, Any],
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually trigger the view logic and forward to registered webhooks.
    Can be used by external sources to route data through db-synchronizer.
    """
    result = await db.execute(select(DatasourceView).where(DatasourceView.id == view_id))
    db_view = result.scalar_one_or_none()
    
    if not db_view:
        raise HTTPException(status_code=404, detail="View not found")
    
    # Logic: If payload contains data, we transform it.
    # In a real scenario, we might want to check if the payload matches view filters.
    # For now, we apply mappings to the payload and forward to all registered webhooks.
    
    transformed_data = {}
    if db_view.field_mappings:
        # Simple mapping logic
        for target, source_template in db_view.field_mappings.items():
            # If source_template is a field name in payload
            if source_template in payload:
                transformed_data[target] = payload[source_template]
            else:
                # Handle templates or jinja if engine is available
                try:
                    transformed_data[target] = engine.render(source_template, payload)
                except:
                    transformed_data[target] = source_template
    else:
        transformed_data = payload

    # Forward to all registered webhooks for this view
    if db_view.webhooks:
        for webhook in db_view.webhooks:
            if webhook.get("url"):
                background_tasks.add_task(forward_webhook, webhook["url"], transformed_data)
                
    return {
        "success": True, 
        "message": f"Processed and routed to {len(db_view.webhooks)} webhooks",
        "data": transformed_data
    }


@router.delete("/views/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_datasource_view(
    view_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a datasource view."""
    result = await db.execute(select(DatasourceView).where(DatasourceView.id == view_id))
    db_view = result.scalar_one_or_none()
    
    if not db_view:
        raise HTTPException(status_code=404, detail="View not found")
        
    await db.delete(db_view)
    await db.commit()
    return None
