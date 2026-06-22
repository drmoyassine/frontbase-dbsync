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

from app.middleware.tenant_context import TenantContext, get_tenant_context
from app.models.models import Project

from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.services.sync.schemas.datasource import (
    DatasourceCreate,
    DatasourceUpdate,
    DatasourceResponse,
)
from app.services.sync.adapters import get_adapter
from app.services.sync.services.schema_service import SchemaService

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.crud")


@router.post("/", response_model=DatasourceResponse, status_code=status.HTTP_201_CREATED)
async def create_datasource(
    data: DatasourceCreate,
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """Register a new datasource."""
    project_id: str | None = None
    if ctx and ctx.tenant_id:
        project_result = await db.execute(
            select(Project).where(Project.tenant_id == ctx.tenant_id)
        )
        project = project_result.scalar_one_or_none()
        if project:
            project_id = str(project.id)
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant project not found"
            )

    # Check datasources capacity quota limit (F1)
    if ctx and ctx.tenant_id and not ctx.is_master:
        from app.database.config import SessionLocal as PubSessionLocal
        from app.services.plan_limits import check_quota
        from app.services.sync.models.datasource import Datasource as SyncDatasource
        with PubSessionLocal() as sync_db:
            ds_count = sync_db.query(SyncDatasource).filter(
                SyncDatasource.project_id == project_id
            ).count()
            check_quota(sync_db, ctx, "datasources", ds_count)

    # Check for duplicate name within the same project scope
    existing_result = await db.execute(
        select(Datasource).where(
            Datasource.name == data.name,
            Datasource.project_id == project_id
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Datasource with name '{data.name}' already exists"
        )

    from app.core.security import encrypt_field
    from sqlalchemy import inspect

    # Get actual database columns to avoid setting fields that don't exist in the DB
    # This handles cases where the model has a field but the migration hasn't been applied yet
    db_columns = {col.name for col in inspect(Datasource).columns}

    # Build datasource kwargs, only including fields that exist in the database
    datasource_kwargs = {
        "name": data.name,
        "type": data.type,
        "host": data.host,
        "port": data.port,
        "database": data.database,
        "username": data.username,
        "password_encrypted": encrypt_field(data.password),
        "api_url": data.api_url,
        "api_key_encrypted": encrypt_field(data.api_key),
        "anon_key_encrypted": encrypt_field(data.anon_key),
        "table_prefix": data.table_prefix,
        "extra_config": json.dumps(data.extra_config) if data.extra_config else None,
        "project_id": project_id,
    }

    # Only add provider_account_id if the column exists in the database
    if "provider_account_id" in db_columns and data.provider_account_id:
        datasource_kwargs["provider_account_id"] = data.provider_account_id

    datasource = Datasource(**datasource_kwargs)

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
                
                update_project_settings(frontbase_db, project_id or "default", update_data)
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
    
    # Trigger eager schema discovery (all tables + FKs)
    try:
        logger.info(f"Triggering schema discovery for new datasource {datasource.name}")
        discovery_result = await SchemaService.discover_all_schemas(db, datasource)
        logger.info(f"Discovered {discovery_result['tables_discovered']} tables, {discovery_result['foreign_keys_discovered']} FKs")
    except Exception as e:
        logger.warning(f"Schema discovery failed for {datasource.name}: {e}")
        # Don't fail the create - schema can be discovered later via /relationships?refresh=true
    
    return datasource


@router.get("/", response_model=List[DatasourceResponse])
async def list_datasources(
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    """List all registered datasources."""
    import time
    start_time = time.time()
    
    query = select(Datasource).options(selectinload(Datasource.views))
    
    if ctx and ctx.tenant_id and not ctx.is_master:
        project_result = await db.execute(
            select(Project).where(Project.tenant_id == ctx.tenant_id)
        )
        project = project_result.scalar_one_or_none()
        if project:
            query = query.where(Datasource.project_id == str(project.id))
        else:
            return []
    elif ctx and ctx.is_master:
        # Master admin: only their own (unassigned) datasources
        query = query.where(Datasource.project_id == None)
            
    result = await db.execute(query.order_by(Datasource.created_at.desc()))
    datasources = result.scalars().all()
    
    duration = time.time() - start_time
    logger.info(f"list_datasources took {duration:.4f}s for {len(datasources)} records")
    
    return datasources


@router.get("/{datasource_id}/", response_model=DatasourceResponse)
async def get_datasource(
    datasource_id: str,
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
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
        
    if ctx and ctx.tenant_id and not ctx.is_master:
        project_result = await db.execute(
            select(Project).where(Project.tenant_id == ctx.tenant_id)
        )
        project = project_result.scalar_one_or_none()
        if not project or datasource.project_id != str(project.id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Datasource not found"
            )
    elif ctx and ctx.is_master:
        if datasource.project_id is not None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Datasource not found"
            )
    
    return datasource


@router.put("/{datasource_id}/", response_model=DatasourceResponse)
async def update_datasource(
    datasource_id: str,
    data: DatasourceUpdate,
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
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
        
    if ctx and ctx.tenant_id and not ctx.is_master:
        project_result = await db.execute(
            select(Project).where(Project.tenant_id == ctx.tenant_id)
        )
        project = project_result.scalar_one_or_none()
        if not project or datasource.project_id != str(project.id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Datasource not found"
            )
    elif ctx and ctx.is_master:
        if datasource.project_id is not None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Datasource not found"
            )
    
    # Update fields if provided
    update_data = data.model_dump(exclude_unset=True)
    sensitive_fields = ["host", "port", "database", "username", "password", "connection_uri", "api_url", "api_key"]
    should_reset_test = any(field in update_data for field in sensitive_fields)

    from app.core.security import encrypt_field
    from sqlalchemy import inspect

    # Get actual database columns to avoid setting fields that don't exist in the DB
    # This handles cases where the model has a field but the migration hasn't been applied yet
    db_columns = {col.name for col in inspect(Datasource).columns}

    for field, value in update_data.items():
        if field == "password" and value:
            setattr(datasource, "password_encrypted", encrypt_field(value))
        elif field == "api_key" and value:
            setattr(datasource, "api_key_encrypted", encrypt_field(value))
        elif hasattr(datasource, field) and field in db_columns:
            setattr(datasource, field, value)
            
    if should_reset_test:
        datasource.last_test_success = None
        datasource.last_tested_at = None
    
    await db.commit()
    await db.refresh(datasource)
    
    return datasource


@router.delete("/{datasource_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_datasource(
    datasource_id: str,
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
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
        
    if ctx and ctx.tenant_id and not ctx.is_master:
        project_result = await db.execute(
            select(Project).where(Project.tenant_id == ctx.tenant_id)
        )
        project = project_result.scalar_one_or_none()
        if not project or datasource.project_id != str(project.id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Datasource not found"
            )
    elif ctx and ctx.is_master:
        if datasource.project_id is not None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Datasource not found"
            )
    
    await db.delete(datasource)
    await db.commit()
