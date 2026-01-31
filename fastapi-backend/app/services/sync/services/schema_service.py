"""
SchemaService - Single source of truth for table schema access.

All schema operations go through this service:
- Schemas are cached in SQLite (TableSchemaCache)
- Discovery happens on datasource save (eager)
- Refresh is user-triggered
"""

import logging
from typing import Dict, List, Any, Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.models.table_schema import TableSchemaCache
from app.services.sync.models.datasource import Datasource
from app.services.sync.adapters import get_adapter

logger = logging.getLogger("app.services.schema_service")


class SchemaService:
    """Centralized service for table schema access."""
    
    @staticmethod
    async def get_cached_schema(
        db: AsyncSession,
        datasource_id: str,
        table: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get schema from SQLite cache.
        
        Returns None if not cached (caller should handle this case).
        """
        result = await db.execute(
            select(TableSchemaCache).where(
                TableSchemaCache.datasource_id == datasource_id,
                TableSchemaCache.table_name == table
            )
        )
        cached = result.scalar_one_or_none()
        
        if cached:
            return {
                "columns": cached.columns,
                "foreign_keys": cached.foreign_keys or []
            }
        return None
    
    @staticmethod
    async def get_all_cached_schemas(
        db: AsyncSession,
        datasource_id: str
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get all cached schemas for a datasource.
        
        Returns dict mapping table_name -> schema.
        """
        result = await db.execute(
            select(TableSchemaCache).where(
                TableSchemaCache.datasource_id == datasource_id
            )
        )
        cached_list = result.scalars().all()
        
        return {
            cached.table_name: {
                "columns": cached.columns,
                "foreign_keys": cached.foreign_keys or []
            }
            for cached in cached_list
        }
    
    @staticmethod
    async def discover_all_schemas(
        db: AsyncSession,
        datasource: Datasource
    ) -> Dict[str, Any]:
        """
        Discover and cache ALL table schemas for a datasource.
        
        Uses parallel fetching for performance.
        Called on datasource save. Fetches all tables and their schemas
        from the external datasource and stores in SQLite.
        
        Returns summary of discovered tables.
        """
        import asyncio
        
        logger.info(f"Discovering schemas for datasource {datasource.name} ({datasource.id})")
        
        adapter = get_adapter(datasource)
        discovered_tables = []
        discovered_fks = 0
        
        try:
            async with adapter:
                # Get all tables
                tables = await adapter.get_tables()
                logger.info(f"Found {len(tables)} tables in {datasource.name}")
                
                # Define helper to fetch single table schema
                async def fetch_table_schema(table: str):
                    try:
                        schema = await adapter.get_schema(table)
                        return (table, schema)
                    except Exception as e:
                        logger.warning(f"Failed to get schema for {table}: {e}")
                        return (table, None)
                
                # Fetch all schemas in parallel (batch of 10 for rate limiting)
                batch_size = 10
                all_schemas = []
                
                for i in range(0, len(tables), batch_size):
                    batch = tables[i:i + batch_size]
                    batch_results = await asyncio.gather(*[fetch_table_schema(t) for t in batch])
                    all_schemas.extend(batch_results)
                
                # Store all schemas in cache
                for table, schema in all_schemas:
                    if schema is None:
                        continue
                        
                    columns = schema.get("columns", [])
                    foreign_keys = schema.get("foreign_keys", [])
                    
                    # Upsert into cache
                    await db.execute(
                        delete(TableSchemaCache).where(
                            TableSchemaCache.datasource_id == datasource.id,
                            TableSchemaCache.table_name == table
                        )
                    )
                    
                    new_cache = TableSchemaCache(
                        datasource_id=datasource.id,
                        table_name=table,
                        columns=columns,
                        foreign_keys=foreign_keys
                    )
                    db.add(new_cache)
                    
                    discovered_tables.append(table)
                    discovered_fks += len(foreign_keys)
                
                await db.commit()
                
        except Exception as e:
            logger.error(f"Failed to discover schemas: {e}")
            raise
        
        logger.info(f"Discovered {len(discovered_tables)} tables, {discovered_fks} FKs for {datasource.name}")
        
        return {
            "tables_discovered": len(discovered_tables),
            "foreign_keys_discovered": discovered_fks,
            "tables": discovered_tables
        }
    
    @staticmethod
    async def refresh_all_schemas(
        db: AsyncSession,
        datasource: Datasource
    ) -> Dict[str, Any]:
        """
        Clear and re-discover all schemas (user-triggered refresh).
        
        Deletes all cached schemas for the datasource and re-discovers.
        """
        logger.info(f"Refreshing all schemas for datasource {datasource.name}")
        
        # Delete all cached schemas for this datasource
        await db.execute(
            delete(TableSchemaCache).where(
                TableSchemaCache.datasource_id == datasource.id
            )
        )
        await db.commit()
        
        # Re-discover
        return await SchemaService.discover_all_schemas(db, datasource)
    
    @staticmethod
    async def get_all_relationships(
        db: AsyncSession,
        datasource_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all FK relationships from cached schemas.
        
        Aggregates foreign_keys from all cached table schemas.
        """
        import json
        
        result = await db.execute(
            select(TableSchemaCache).where(
                TableSchemaCache.datasource_id == datasource_id
            )
        )
        cached_list = result.scalars().all()
        
        relationships = []
        for cached in cached_list:
            table_name = cached.table_name
            
            # Defensive: handle foreign_keys as string (legacy) or list
            fk_data = cached.foreign_keys or []
            if isinstance(fk_data, str):
                try:
                    fk_data = json.loads(fk_data)
                except (json.JSONDecodeError, TypeError):
                    fk_data = []
            
            for fk in fk_data:
                # Skip if fk is not a dict (shouldn't happen, but defensive)
                if not isinstance(fk, dict):
                    continue
                    
                # Normalize FK format
                constrained_cols = fk.get("constrained_columns", [])
                referred_cols = fk.get("referred_columns", [])
                
                # Handle single column FKs
                source_col = constrained_cols[0] if constrained_cols else None
                target_col = referred_cols[0] if referred_cols else None
                
                if source_col and fk.get("referred_table"):
                    relationships.append({
                        "source_table": table_name,
                        "source_column": source_col,
                        "target_table": fk.get("referred_table"),
                        "target_column": target_col or "id"
                    })
        
        return relationships
