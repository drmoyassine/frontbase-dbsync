"""
Data read and search endpoints for datasources.
"""

import json
import logging
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.services.sync.adapters import get_adapter

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
            if not isinstance(where, list):
                where = None
        except Exception:
            where = None

    try:
        adapter = get_adapter(datasource)
        async with adapter:
            records = await adapter.read_records(table, limit=limit, offset=offset, where=where)
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
