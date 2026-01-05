"""
Data read and search endpoints for datasources.
"""

import json
import logging
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select as sqlalchemy_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.services.sync.adapters import get_adapter
from app.services.sync.services.schema_service import SchemaService

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.data")


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


@router.get("/{datasource_id}/tables/{table}/data")
async def get_datasource_table_data(
    datasource_id: str,
    table: str,
    limit: int = 50,
    offset: int = 0,
    filters: Optional[str] = None,
    sort: Optional[str] = None,
    order: Optional[str] = "asc",
    search: Optional[str] = None,
    search_cols: Optional[str] = None,  # JSON array of column names to restrict search to
    select: Optional[str] = None,  # Support for related columns: "*,programs(degree_name,type)"
    db: AsyncSession = Depends(get_db)
):
    """Get data for a specific table in a datasource with pagination, sorting, search, and related data."""
    result = await db.execute(sqlalchemy_select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    # Parse filters if provided
    where = None
    if filters:
        try:
            where = json.loads(filters)
            if not isinstance(where, list):
                where = None
        except Exception:
            where = None

    # Parse search_cols if provided
    parsed_search_cols = None
    if search_cols:
        try:
            parsed_search_cols = json.loads(search_cols)
            if not isinstance(parsed_search_cols, list):
                parsed_search_cols = None
        except Exception:
            parsed_search_cols = None

    # Parse select for related columns (format: "*,table(col1,col2)" or "table.column,other_table.column")
    related_specs = []  # List of {"table": str, "columns": [str], "local_fk": str}
    if select:
        import re
        # Match patterns like "programs(degree_name,type,level)"
        pattern = r'(\w+)\(([^)]+)\)'
        for match in re.finditer(pattern, select):
            related_table = match.group(1)
            related_cols = [c.strip() for c in match.group(2).split(',')]
            related_specs.append({
                "table": related_table,
                "columns": related_cols,
                "local_fk": None  # Will be determined from schema
            })

    try:
        adapter = get_adapter(datasource)
        async with adapter:
            # If search is provided, use search_records method
            # If search is provided, use search_records method unless we have relations logic
            enriched_specs = None
            use_generic_search = bool(search)
            if search and related_specs and hasattr(adapter, 'read_records_with_relations'):
                # We want to use read_records_with_relations to get enriched data AND filter by search
                use_generic_search = False

            if use_generic_search:
                records = await adapter.search_records(table, search, limit=limit, offset=offset)
                # Estimate total for search (may not be exact)
                total = len(records) + offset
                if len(records) == limit:
                    total += 1  # Indicate there may be more
            else:
                # Check if we need to use relations (FK enrichment)
                if related_specs and hasattr(adapter, 'read_records_with_relations'):
                    # Get schema from cache (single source of truth)
                    try:
                        schema = await SchemaService.get_cached_schema(db, datasource_id, table)
                        logger.info(f"[FK DEBUG] Cached schema for {table}: {bool(schema)}")
                        if not schema:
                            logger.warning(f"No cached schema for {table}. Skipping FK enrichment.")
                            schema = {"columns": [], "foreign_keys": []}
                        
                        # Build FK map from cached foreign_keys
                        fk_map = {}
                        fk_list = schema.get("foreign_keys", [])
                        logger.info(f"[FK DEBUG] FKs in cache: {len(fk_list)}")
                        for fk in fk_list:
                            ref_table = fk.get("referred_table")
                            if ref_table:
                                constrained_cols = fk.get("constrained_columns", [])
                                referred_cols = fk.get("referred_columns", [])
                                fk_col = constrained_cols[0] if constrained_cols else None
                                ref_col = referred_cols[0] if referred_cols else "id"
                                if fk_col:
                                    fk_map[ref_table] = {"fk_col": fk_col, "ref_col": ref_col}
                                    logger.info(f"[FK DEBUG] Found FK: {table}.{fk_col} -> {ref_table}.{ref_col}")
                        
                        logger.info(f"[FK DEBUG] FK map keys: {list(fk_map.keys())}")
                        logger.info(f"[FK DEBUG] Related specs requested: {[s['table'] for s in related_specs]}")
                        
                        # Build related_specs with FK column info
                        enriched_specs = []
                        for spec in related_specs:
                            rel_table = spec["table"]
                            if rel_table in fk_map:
                                enriched_specs.append({
                                    "table": rel_table,
                                    "columns": spec["columns"],
                                    "fk_col": fk_map[rel_table]["fk_col"],
                                    "ref_col": fk_map[rel_table]["ref_col"]
                                })
                            else:
                                logger.info(f"[FK DEBUG] No FK found for requested table: {rel_table}")
                        
                        logger.info(f"[FK DEBUG] Enriched specs: {enriched_specs}")
                        
                        if enriched_specs:
                            # Check adapter type - Supabase uses select_param, others use related_specs
                            adapter_name = adapter.__class__.__name__
                            logger.info(f"[FK DEBUG] Adapter: {adapter_name}")
                            
                            if adapter_name == "SupabaseAdapter":
                                # Supabase uses PostgREST select format directly
                                records = await adapter.read_records_with_relations(
                                    table,
                                    select_param=select,  # Pass original select param
                                    where=where,
                                    limit=limit,
                                    offset=offset,
                                    order_by=sort,
                                    order_direction=order,
                                    search=search,
                                    related_specs=enriched_specs
                                )
                            else:
                                # Postgres/MySQL use related_specs
                                records = await adapter.read_records_with_relations(
                                    table,
                                    related_specs=enriched_specs,
                                    where=where,
                                    limit=limit,
                                    offset=offset,
                                    order_by=sort,
                                    order_direction=order,
                                    search=search,
                                    search_cols=parsed_search_cols
                                )
                            logger.info(f"[FK DEBUG] Got {len(records)} records with relations")
                        else:
                            # No valid FK relationships found - use regular read
                            logger.info("[FK DEBUG] No enriched specs, using regular read")
                            records = await adapter.read_records(
                                table, limit=limit, offset=offset, where=where,
                                order_by=sort, order_direction=order
                            )

                    except Exception as e:
                        logger.error(f"Failed to use relations: {e}")
                        import traceback
                        logger.error(traceback.format_exc())
                        raise e # Force crash to see trace
                        # records = await adapter.read_records(
                        #     table, limit=limit, offset=offset, where=where,
                        #     order_by=sort, order_direction=order,
                        #     search=search
                        # )
                else:
                    # No related specs or adapter doesn't support relations
                    try:
                        records = await adapter.read_records(
                            table, 
                            limit=limit, 
                            offset=offset, 
                            where=where,
                            order_by=sort,
                            order_direction=order
                        )
                    except TypeError:
                        # Adapter doesn't support sorting params - call without them
                        records = await adapter.read_records(table, limit=limit, offset=offset, where=where)
                
                try:
                    # Try passing related_specs if available (supported by Postgres/Supabase adapters)
                    total = await adapter.count_records(
                        table, 
                        where=where, 
                        related_specs=enriched_specs if enriched_specs else None,
                        search=search
                    )
                except TypeError:
                    # Adapter doesn't support related_specs argument
                    total = await adapter.count_records(table, where=where)
            
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
        import traceback
        logger.error(f"Error fetching data for {datasource_id} table {table}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to fetch sample data: {str(e)}")


@router.get("/{datasource_id}/tables/{table}/distinct/{column}")
async def get_distinct_values(
    datasource_id: str,
    table: str,
    column: str,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Get distinct values for a column (for dropdown filter options)."""
    result = await db.execute(sqlalchemy_select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    try:
        adapter = get_adapter(datasource)
        async with adapter:
            if hasattr(adapter, 'get_distinct_values'):
                values = await adapter.get_distinct_values(table, column, limit)
                return {"success": True, "data": values}
            else:
                # Fallback: read records and extract distinct values
                records = await adapter.read_records(table, columns=[column], limit=limit)
                values = list(set(str(r.get(column)) for r in records if r.get(column) is not None))
                return {"success": True, "data": sorted(values)[:limit]}
    except Exception as e:
        logger.error(f"Error fetching distinct values: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch distinct values: {str(e)}")


@router.post("/{datasource_id}/tables/{table}/records")
async def create_record(
    datasource_id: str,
    table: str,
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_db)
):
    """Create a new record in a table."""
    result = await db.execute(sqlalchemy_select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    data = body.get("data", {})
    if not data:
        raise HTTPException(status_code=400, detail="No data provided")
    
    try:
        adapter = get_adapter(datasource)
        async with adapter:
            if hasattr(adapter, 'create_record'):
                record = await adapter.create_record(table, data)
                return {"success": True, "record": record}
            else:
                raise HTTPException(status_code=501, detail="Adapter does not support record creation")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating record: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create record: {str(e)}")


@router.patch("/{datasource_id}/tables/{table}/records/{record_id}")
async def update_record(
    datasource_id: str,
    table: str,
    record_id: str,
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_db)
):
    """Update an existing record in a table."""
    result = await db.execute(sqlalchemy_select(Datasource).where(Datasource.id == datasource_id))
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    
    data = body.get("data", {})
    if not data:
        raise HTTPException(status_code=400, detail="No data provided")
    
    try:
        adapter = get_adapter(datasource)
        async with adapter:
            if hasattr(adapter, 'update_record'):
                record = await adapter.update_record(table, record_id, data)
                return {"success": True, "record": record}
            else:
                raise HTTPException(status_code=501, detail="Adapter does not support record updates")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating record: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update record: {str(e)}")


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
                for table in tables:
                    try:
                        records = await adapter.search_records(table, q, limit=limit)
                        for record in records:
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
                sem = asyncio.Semaphore(10)
                
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
                    for table in tables:
                        try:
                            records = await adapter.search_records(table, q, limit=limit)
                            for record in records:
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
