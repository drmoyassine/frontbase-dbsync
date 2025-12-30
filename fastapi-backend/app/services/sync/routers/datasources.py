"""
Datasources API router - CRUD operations for database connections.
"""

import logging
import json
from datetime import datetime, timezone
from typing import List, Optional, Union, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.services.sync.models.view import DatasourceView
from app.services.sync.schemas.datasource import (
    DatasourceCreate,
    DatasourceUpdate,
    DatasourceResponse,
    DatasourceTestResult,
    DatasourceTestRequest,
    TableSchema,
    DatasourceViewCreate, 
    DatasourceViewResponse
)
from app.services.sync.adapters import get_adapter
from app.services.sync.config import settings
from app.services.sync.redis_client import cache_get, cache_set, cache_delete_pattern


from sqlalchemy.orm import selectinload

router = APIRouter()
logger = logging.getLogger("app.routers.datasources")


@router.post("", response_model=DatasourceResponse, status_code=status.HTTP_201_CREATED)
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


@router.get("", response_model=List[DatasourceResponse])
async def list_datasources(
    db: AsyncSession = Depends(get_db)
):
    """List all registered datasources."""
    import time
    start_time = time.time()
    
    # Fetch datasources with views using selectinload for efficiency
    # This avoids the N+1 problem and handles lazy loading correctly in async
    # Fetch datasources with views using selectinload for efficiency
    # This avoids the N+1 problem and handles lazy loading correctly in async
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


@router.post("/{datasource_id}/test", response_model=DatasourceTestResult)
async def test_datasource(
    datasource_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Test a datasource connection."""
    logger.info(f"Testing connection for saved datasource: {datasource_id}")
    result = await db.execute(
        select(Datasource).where(Datasource.id == datasource_id)
    )
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Datasource not found"
        )
    
    try:
        # Get appropriate adapter and test connection
        adapter = get_adapter(datasource)
        await adapter.connect()
        tables = await adapter.get_tables()
        await adapter.disconnect()
        
        # Update test status
        datasource.last_tested_at = datetime.now(timezone.utc)
        datasource.last_test_success = True
        await db.commit()
        
        return DatasourceTestResult(
            success=True,
            message="Connection successful",
            tables=tables
        )
    except Exception as e:
        logger.error(f"Error testing datasource {datasource_id}: {str(e)}", exc_info=True)
        # Update test status
        datasource.last_tested_at = datetime.now(timezone.utc)
        datasource.last_test_success = False
        await db.commit()
        
        return DatasourceTestResult(
            success=False,
            message="Connection failed",
            error=str(e),
            suggestion=_get_error_suggestion(e)
        )
@router.post("/test-raw", response_model=DatasourceTestResult)
async def test_new_datasource(
    data: DatasourceTestRequest,
):
    """Test a new datasource connection with raw credentials without saving."""
    logger.info(f"Testing raw connection for new datasource: {data.name or 'Unnamed'} (Type: {data.type})")
    try:
        # Create a transient datasource object
        datasource = Datasource(
            name=data.name,
            type=data.type,
            host=data.host,
            port=data.port,
            database=data.database,
            username=data.username,
            password_encrypted=data.password,
            api_url=data.api_url,
            api_key_encrypted=data.api_key,
            table_prefix=data.table_prefix,
            extra_config=str(data.extra_config) if data.extra_config else None,
        )
        
        # Get appropriate adapter and test connection
        adapter = get_adapter(datasource)
        await adapter.connect()
        tables = await adapter.get_tables()
        await adapter.disconnect()
        
        return DatasourceTestResult(
            success=True,
            message="Connection successful",
            tables=tables
        )
    except Exception as e:
        logger.error(f"Error testing raw datasource {data.name}: {str(e)}", exc_info=True)
        return DatasourceTestResult(
            success=False,
            message="Connection failed",
            error=str(e),
            suggestion=_get_error_suggestion(e)
        )


@router.post("/{datasource_id}/test-update", response_model=DatasourceTestResult)
async def test_datasource_update(
    datasource_id: str,
    data: DatasourceUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Test a datasource connection with proposed updates merged into existing config."""
    logger.info(f"Testing connection update for datasource: {datasource_id}")
    result = await db.execute(
        select(Datasource).where(Datasource.id == datasource_id)
    )
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Datasource not found"
        )
    
    # Create a copy of the datasource to test without saving changes to DB
    # We use the existing values and override with provided update data
    test_ds = Datasource(
        name=data.name or datasource.name,
        type=datasource.type, # Type shouldn't change
        host=data.host or datasource.host,
        port=data.port or datasource.port,
        database=data.database or datasource.database,
        username=data.username or datasource.username,
        password_encrypted=data.password or datasource.password_encrypted,
        api_url=data.api_url or datasource.api_url,
        api_key_encrypted=data.api_key or datasource.api_key_encrypted,
        table_prefix=data.table_prefix or datasource.table_prefix,
    )
    
    try:
        adapter = get_adapter(test_ds)
        await adapter.connect()
        tables = await adapter.get_tables()
        await adapter.disconnect()
        
        return DatasourceTestResult(
            success=True,
            message="Connection successful (updates validated)",
            tables=tables
        )
    except Exception as e:
        logger.error(f"Error testing update for datasource {datasource_id}: {str(e)}", exc_info=True)
        return DatasourceTestResult(
            success=False,
            message="Connection failed with these settings",
            error=str(e),
            suggestion=_get_error_suggestion(e)
        )
@router.get("/{datasource_id}/tables", response_model=List[str])
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


@router.get("/{datasource_id}/tables/{table}/schema", response_model=TableSchema)
async def get_table_schema(
    datasource_id: str,
    table: str,
    refresh: bool = False,  # Query param to force refresh
    db: AsyncSession = Depends(get_db)
):
    """
    Get schema for a specific table in a datasource.
    
    Schema is cached in SQLite for instant subsequent loads.
    Use ?refresh=true to force a fresh fetch from the source.
    """
    from app.services.sync.models.table_schema import TableSchemaCache
    from sqlalchemy import delete
    
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
            return TableSchema(columns=cached.columns)
    
    # No cache or refresh requested - fetch from source
    try:
        adapter = get_adapter(datasource)
        async with adapter:
            schema = await adapter.get_schema(table)
        
        # Store in cache (upsert)
        if refresh:
            # Delete old cache entry if exists
            await db.execute(
                delete(TableSchemaCache).where(
                    TableSchemaCache.datasource_id == datasource_id,
                    TableSchemaCache.table_name == table
                )
            )
        
        new_cache = TableSchemaCache(
            datasource_id=datasource_id,
            table_name=table,
            columns=schema["columns"]
        )
        db.add(new_cache)
        await db.commit()
        
        logger.info(f"Schema fetched and cached for {datasource_id}/{table}")
        return TableSchema(**schema)
    except Exception as e:
        logger.error(f"Error fetching schema for {datasource_id} table {table}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch schema: {str(e)}")

@router.get("/{datasource_id}/tables/{table}/data")
async def get_datasource_table_data(
    datasource_id: str,
    table: str,
    limit: int = 50,
    offset: int = 0,  # For pagination / infinite scroll
    filters: Optional[str] = None,  # JSON string of filters
    db: AsyncSession = Depends(get_db)
):
    """Get data for a specific table in a datasource with pagination."""
    result = await db.execute(select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    # Parse filters if provided
    where = None
    if filters:
        try:
            where = json.loads(filters)
            # Ensure it's a list of dicts
            if not isinstance(where, list):
                where = None
        except Exception:
            where = None

    try:
        adapter = get_adapter(datasource)
        async with adapter:
            records = await adapter.read_records(table, limit=limit, offset=offset, where=where)
            total = await adapter.count_records(table, where=where)
            # Ensure total is never less than actual records returned
            total = max(total, len(records) + offset)
            has_more = (offset + len(records)) < total
            return {
                "records": records,
                "total": total,
                "offset": offset,
                "limit": limit,
                "has_more": has_more,
                "timestamp_utc": datetime.utcnow().isoformat() + "Z"
            }
    except Exception as e:
        logger.error(f"Error fetching data for {datasource_id} table {table}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch sample data: {str(e)}")



@router.get("/{datasource_id}/search")
async def search_datasource_tables(
    datasource_id: str,
    q: str,
    detailed: bool = False,
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
):
    """Search for a string across all tables in a specific datasource."""
    result = await db.execute(select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    matches = []
    try:
        adapter = get_adapter(datasource)
        async with adapter:
            tables = await adapter.get_tables()
            
            if detailed:
                # Return detailed results with row data
                for table in tables:
                    try:
                        records = await adapter.search_records(table, q, limit=limit)
                        for record in records:
                            # Find which fields matched
                            matched_fields = _find_matched_fields(record, q)
                            if matched_fields:
                                matches.append({
                                    "table": table,
                                    "datasource_id": datasource_id,
                                    "datasource_name": datasource.name,
                                    "record": record,
                                    "matched_fields": matched_fields,
                                    "row_id": _extract_row_id(record)
                                })
                    except Exception as e:
                        logger.warning(f"Error searching table {table}: {str(e)}")
                        continue
            else:
                # Parallel count-based implementation
                import asyncio
                sem = asyncio.Semaphore(10) # Process 10 tables at a time
                
                async def search_table(table_name):
                    async with sem:
                        try:
                            count = await adapter.count_search_matches(table_name, q)
                            if count > 0:
                                return {
                                    "table": table_name,
                                    "datasource_id": datasource_id,
                                    "datasource_name": datasource.name,
                                    "count": count
                                }
                        except Exception as e:
                            logger.warning(f"Error counting in table {table_name}: {str(e)}")
                        return None
                
                results = await asyncio.gather(*(search_table(t) for t in tables))
                matches = [r for r in results if r]
        return matches
    except Exception as e:
        logger.error(f"Error searching datasource {datasource_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/search-all")
async def search_all_datasources(
    q: str,
    detailed: bool = False,
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
):
    """Search for a string across all tables in ALL datasources."""
    result = await db.execute(select(Datasource))
    datasources = result.scalars().all()
    
    all_matches = []
    for ds in datasources:
        try:
            adapter = get_adapter(ds)
            async with adapter:
                tables = await adapter.get_tables()
                
                if detailed:
                    # Return detailed results with row data
                    for table in tables:
                        try:
                            records = await adapter.search_records(table, q, limit=limit)
                            for record in records:
                                # Find which fields matched
                                matched_fields = _find_matched_fields(record, q)
                                if matched_fields:
                                    all_matches.append({
                                        "table": table,
                                        "datasource_id": str(ds.id),
                                        "datasource_name": ds.name,
                                        "record": record,
                                        "matched_fields": matched_fields,
                                        "row_id": _extract_row_id(record)
                                    })
                        except Exception as e:
                            logger.warning(f"Error searching table {table} in {ds.name}: {str(e)}")
                            continue
                else:
                    # Parallel count-based implementation per datasource
                    import asyncio
                    sem = asyncio.Semaphore(10)
                    
                    async def search_table_in_ds(t_name):
                        async with sem:
                            try:
                                count = await adapter.count_search_matches(t_name, q)
                                if count > 0:
                                    return {
                                        "table": t_name,
                                        "datasource_id": str(ds.id),
                                        "datasource_name": ds.name,
                                        "count": count
                                    }
                            except Exception as e:
                                logger.warning(f"Error counting in table {t_name}: {str(e)}")
                            return None

                    results = await asyncio.gather(*(search_table_in_ds(t) for t in tables))
                    all_matches.extend([r for r in results if r])
        except Exception as e:
            logger.warning(f"Skipping search for datasource {ds.id}: {str(e)}")
            continue
            
    return all_matches


def _find_matched_fields(record: Dict[str, Any], query: str) -> List[str]:
    """Identify which fields in the record match the search query."""
    matched = []
    query_lower = query.lower()
    for field, value in record.items():
        if value is not None:
            str_val = str(value).lower()
            if query_lower in str_val:
                matched.append(field)
    return matched

def _extract_row_id(record: Dict[str, Any]) -> Any:
    """Extract a row identifier from the record (try id, then first field)."""
    if "id" in record:
        return record["id"]
    return list(record.values())[0] if record else None


def _get_error_suggestion(e: Exception) -> Optional[str]:
    """Helper to provide diagnostic suggestions for common connection errors."""
    msg = str(e).lower()
    if "2003" in msg or "can't connect to mysql server" in msg:
        return "This usually means the MySQL port (typically 3306) is blocked or the host is incorrect. Ensure Remote MySQL access is enabled in your hosting panel and your IP is whitelisted."
    if "getaddrinfo failed" in msg:
        return "The hostname could not be resolved. Ensure you aren't including 'http://' in the host field and check for typos."
    if "access denied" in msg or "password" in msg:
        return "Authentication failed. Verify your username and password are correct for remote access."
    if "timeout" in msg:
        return "The connection timed out. Check your firewall settings and ensure the server is listening on the correct port."
    if "'nonetype' object has no attribute 'group'" in msg or "authentication" in msg:
        return "This is a known issue with asyncpg during the authentication handshake. If using Supabase/Neon, ensure you are using the DIRECT port (5432) instead of the pooled port (6543), as the pooler sometimes interferes with the SASL handshake."
    return None


@router.post("/{datasource_id}/tables/{table_name}/session")
async def save_table_session(datasource_id: str, table_name: str, session_data: Dict[str, Any]):
    """Save draft layout/config to Redis session."""
    key = f"session:{datasource_id}:{table_name}"
    ttl = settings.sync_state_ttl
    success = await cache_set(settings.redis_url, key, session_data, ttl=ttl)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save session to Redis")
    return {"status": "ok"}


@router.get("/{datasource_id}/tables/{table_name}/session")
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
