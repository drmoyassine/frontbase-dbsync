"""
PostgreSQL adapter using asyncpg for direct Postgres connections.
"""

from typing import Any, Dict, List, Optional, Union
import logging
import asyncpg
import ssl

from app.services.sync.adapters.base import SQLAdapter

class PostgresAdapter(SQLAdapter):
    """PostgreSQL database adapter using asyncpg."""
    
    def __init__(self, datasource: "Datasource"):
        super().__init__(datasource)
        self._pool: Optional[asyncpg.Pool] = None
        self.logger = logging.getLogger(f"app.adapters.postgres.{self.datasource.name}")
    
    async def connect(self) -> None:
        """Establish connection pool to PostgreSQL."""
        host = self._sanitize_host(self.datasource.host)
        port = self.datasource.port
        db_name = self.datasource.database
        user = self.datasource.username
        
        self.logger.info(f"Connecting to Postgres: host='{host}', port={port}, database='{db_name}', user='{user}'")
        
        if not host:
            self.logger.error("Connection failed: Host is empty")
            raise ValueError("Database host is required")

        try:
            # First attempt: standard SSL secure connection
            self._pool = await asyncpg.create_pool(
                host=host,
                port=port,
                database=db_name,
                user=user,
                password=self.datasource.password_encrypted,  # TODO: decrypt
                ssl=True,  # Better negotiation for Supabase/Neon
                min_size=1,
                max_size=10,
                command_timeout=60,
                statement_cache_size=0,  # Required for pgbouncer (Supabase pooler)
            )
            self.logger.info(f"Successfully established {self.datasource.type} connection pool to {host} (Secure)")
        except Exception as e:
            # Check if it's an SSL verification error
            error_msg = str(e).lower()
            if "certificate verify failed" in error_msg or "self signed certificate" in error_msg:
                self.logger.warning(f"SSL Certificate verification failed for {host}. Attempting fallback with verification disabled...")
                
                # Fallback: SSL connection but skip certificate verification
                # This is common for Supabase/Neon poolers with self-signed certs
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                
                try:
                    self._pool = await asyncpg.create_pool(
                        host=host,
                        port=port,
                        database=db_name,
                        user=user,
                        password=self.datasource.password_encrypted,
                        ssl=ctx,
                        min_size=1,
                        max_size=10,
                        command_timeout=60,
                        statement_cache_size=0,  # Required for pgbouncer
                    )
                    self.logger.info(f"Successfully established {self.datasource.type} connection pool to {host} (SSL Fallback/Insecure)")
                    return
                except Exception as retry_e:
                    self.logger.error(f"Fallback connection also failed: {str(retry_e)}")
                    raise retry_e
            
            self.logger.error(f"Failed to connect to {self.datasource.type} ({host}:{port}): {str(e)}", exc_info=True)
            raise
    
    async def disconnect(self) -> None:
        """Close the connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None
    
    async def get_tables(self) -> List[str]:
        """Get list of tables in public schema."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE'
                ORDER BY table_name
            """)
            return [row["table_name"] for row in rows]
    
    async def get_schema(self, table: str) -> Dict[str, Any]:
        """Get column information for a table, including foreign key relationships."""
        async with self._pool.acquire() as conn:
            # Get columns with primary key info
            rows = await conn.fetch("""
                SELECT 
                    c.column_name,
                    c.data_type,
                    c.is_nullable,
                    c.column_default,
                    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT ku.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage ku
                        ON tc.constraint_name = ku.constraint_name
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_name = $1
                ) pk ON c.column_name = pk.column_name
                WHERE c.table_name = $1 AND c.table_schema = 'public'
                ORDER BY c.ordinal_position
            """, table)
            
            # Get foreign key relationships
            fk_rows = await conn.fetch("""
                SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
            """, table)
            
            self.logger.info(f"FK discovery for '{table}': found {len(fk_rows)} foreign keys")
            
            
            # Build FK lookup map
            fk_map = {
                fk["column_name"]: {
                    "foreign_table": fk["foreign_table"],
                    "foreign_column": fk["foreign_column"]
                }
                for fk in fk_rows
            }
            
            # Build FK list for return
            foreign_keys_list = []
            for fk in fk_rows:
                foreign_keys_list.append({
                    "constrained_columns": [fk["column_name"]],
                    "referred_table": fk["foreign_table"],
                    "referred_columns": [fk["foreign_column"]]
                })
            
            return {
                "columns": [
                    {
                        "name": row["column_name"],
                        "type": row["data_type"],
                        "nullable": row["is_nullable"] == "YES",
                        "default": row["column_default"],
                        "primary_key": row["is_primary_key"],
                        "is_foreign": row["column_name"] in fk_map,
                        "foreign_table": fk_map.get(row["column_name"], {}).get("foreign_table"),
                        "foreign_column": fk_map.get(row["column_name"], {}).get("foreign_column"),
                    }
                    for row in rows
                ],
                "foreign_keys": foreign_keys_list
            }
    
    async def get_all_relationships(self) -> Dict[str, Any]:
        """Get ALL foreign key relationships across all tables in one query (fast)."""
        async with self._pool.acquire() as conn:
            # Single query to get all FK relationships in the database
            fk_rows = await conn.fetch("""
                SELECT 
                    tc.table_name AS source_table,
                    kcu.column_name AS source_column,
                    ccu.table_name AS target_table,
                    ccu.column_name AS target_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu 
                    ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu 
                    ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                ORDER BY tc.table_name, kcu.column_name
            """)
            
            self.logger.info(f"Found {len(fk_rows)} total FK relationships")
            
            return [
                {
                    "source_table": row["source_table"],
                    "source_column": row["source_column"],
                    "target_table": row["target_table"],
                    "target_column": row["target_column"],
                }
                for row in fk_rows
            ]


    async def read_records(
        self,
        table: str,
        columns: Optional[List[str]] = None,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        limit: int = 100,
        offset: int = 0,
        order_by: Optional[str] = None,
        order_direction: Optional[str] = "asc",
    ) -> List[Dict[str, Any]]:
        """Read records from table with sorting support."""
        cols = ", ".join(f'"{c}"' for c in columns) if columns else "*"
        query = f'SELECT {cols} FROM "{table}"'
        
        where_clause, params = self._build_where_clause(where, use_index=True)
        query += where_clause
        
        # Add ORDER BY clause if sorting requested
        if order_by:
            direction = "DESC" if order_direction and order_direction.lower() == "desc" else "ASC"
            query += f' ORDER BY "{order_by}" {direction}'
        
        query += f" LIMIT {limit} OFFSET {offset}"
        
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]
    
    async def read_records_with_relations(
        self,
        table: str,
        related_specs: List[Dict[str, Any]],  # [{"table": "programs", "columns": ["degree_name"], "fk_col": "program_id", "ref_col": "id"}]
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        limit: int = 100,
        offset: int = 0,
        order_by: Optional[str] = None,
        order_direction: Optional[str] = "asc",
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Read records with LEFT JOINs for related tables.
        Returns flattened records with keys like "programs.degree_name".
        """
        # Build SELECT columns: main.*, related.col AS "related.col"
        select_parts = [f'"{table}".*']
        join_parts = []
        alias_map = {}  # Map table name to alias (e.g., 'programs' -> 'rel_0')
        
        for i, spec in enumerate(related_specs):
            rel_table = spec["table"]
            rel_alias = f"rel_{i}"
            alias_map[rel_table] = rel_alias
            
            fk_col = spec.get("fk_col", f"{rel_table}_id")  # FK column in main table
            ref_col = spec.get("ref_col", "id")  # Reference column in related table (usually id)
            
            # Add SELECT for each related column with alias
            for col in spec["columns"]:
                select_parts.append(f'{rel_alias}."{col}" AS "{rel_table}.{col}"')
            
            # Add LEFT JOIN
            join_parts.append(
                f'LEFT JOIN "{rel_table}" {rel_alias} ON "{table}"."{fk_col}" = {rel_alias}."{ref_col}"'
            )
        
        select_clause = ", ".join(select_parts)
        join_clause = " ".join(join_parts)
        
        query = f'SELECT {select_clause} FROM "{table}" {join_clause}'
        
        # Pre-process WHERE clause to handle dotted keys (related tables)
        # We manually map "table.column" to 'alias"."column' and pass column_prefix="" to _build_where_clause
        processed_where = []
        if where:
            self.logger.info(f"DEBUG: related_specs: {[s['table'] for s in related_specs]}")
            self.logger.info(f"DEBUG: alias_map: {alias_map}")
            self.logger.info(f"DEBUG: Original where: {where}")

            # Normalize to list
            filter_list = where if isinstance(where, list) else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
            
            for f in filter_list:
                # Create a copy to avoid mutating original
                new_f = f.copy()
                field = new_f.get("field")
                if not field: continue
                
                if "." in field:
                    parts = field.split(".")
                    rel_t = parts[0]
                    col = parts[1]
                    
                    if rel_t in alias_map:
                        # Use quote hacking to make _build_where_clause generate "alias"."column"
                        # It generates "{prefix}"{field}"". We set prefix="" and field='alias"."col'
                        new_f["field"] = f'{alias_map[rel_t]}"."{col}'
                        self.logger.info(f"DEBUG: Mapped {field} to {new_f['field']}")
                    else:
                        # Unknown relation or just a dot in column name? 
                        # Fallback to quoting the whole thing or as is?
                        # Assume it might be a json path or similar, but for now stick to simple quoting
                        new_f["field"] = field
                        self.logger.info(f"DEBUG: Failed to map {field}. rel_t '{rel_t}' not in alias_map")
                else:
                    # Main table column
                    new_f["field"] = f'{table}"."{field}' 
                
                processed_where.append(new_f)
            self.logger.info(f"DEBUG: Processed where: {processed_where}")

        # Add WHERE clause
        where_clause, params = self._build_where_clause(processed_where, use_index=True, column_prefix="")
        
        # Add Search Clause (OR across all columns)
        if search:
            # Fetch schema to get columns
            schema = await self.get_schema(table) # Use cached or fresh
            search_cols = [col["name"] for col in schema["columns"]]
            
            if search_cols:
                search_conds = []
                # params has len items. Next param is len+1.
                current_param_idx = len(params) 
                
                for col in search_cols:
                    current_param_idx += 1
                    # Search main table columns
                    search_conds.append(f'CAST("{table}"."{col}" AS TEXT) LIKE ${current_param_idx}')
                    params.append(f"%{search}%")
                
                search_chunk = "(" + " OR ".join(search_conds) + ")"
                
                if where_clause:
                    # Append to existing WHERE
                    where_clause += f" AND {search_chunk}"
                else:
                    where_clause = f" WHERE {search_chunk}"

        if where_clause:
            query += where_clause
        
        # Add ORDER BY with correct alias mapping
        if order_by:
            direction = "DESC" if order_direction and order_direction.lower() == "desc" else "ASC"
            
            if "." in order_by:
                parts = order_by.split(".")
                rel_t = parts[0]
                col = parts[1]
                if rel_t in alias_map:
                    order_expr = f'"{alias_map[rel_t]}"."{col}"'
                else:
                    order_expr = f'"{order_by}"'
            else:
                order_expr = f'"{table}"."{order_by}"'
                
            query += f' ORDER BY {order_expr} {direction}'
        
        query += f" LIMIT {limit} OFFSET {offset}"
        
        self.logger.debug(f"FK JOIN query: {query}")
        
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]
    
    async def read_record_by_key(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> Optional[Dict[str, Any]]:
        """Read a single record by primary key."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                f'SELECT * FROM "{table}" WHERE "{key_column}" = $1',
                key_value
            )
            return dict(row) if row else None
    
    async def upsert_record(
        self,
        table: str,
        record: Dict[str, Any],
        key_column: str,
    ) -> Dict[str, Any]:
        """Insert or update a record using ON CONFLICT."""
        columns = list(record.keys())
        values = list(record.values())
        
        placeholders = ", ".join(f"${i}" for i in range(1, len(values) + 1))
        
        # Build update clause for non-key columns
        update_cols = [c for c in columns if c != key_column]
        update_clause = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in update_cols)
        col_list = ", ".join(f'"{c}"' for c in columns)
        
        query = f"""
            INSERT INTO "{table}" ({col_list})
            VALUES ({placeholders})
            ON CONFLICT ("{key_column}") DO UPDATE SET {update_clause}
            RETURNING *
        """
        
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, *values)
            return dict(row)
    
    async def delete_record(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> bool:
        """Delete a record by key."""
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                f'DELETE FROM "{table}" WHERE "{key_column}" = $1',
                key_value
            )
            return result.split()[-1] != "0"
    
    async def count_records(
        self,
        table: str,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        related_specs: Optional[List[Dict[str, Any]]] = None,
    ) -> int:
        """Count records in table, optionally with related table joins for filtering."""
        join_clause = ""
        alias_map = {}
        
        if related_specs:
            join_parts = []
            for i, spec in enumerate(related_specs):
                rel_table = spec["table"]
                rel_alias = f"rel_{i}"
                alias_map[rel_table] = rel_alias
                fk_col = spec.get("fk_col", f"{rel_table}_id")
                ref_col = spec.get("ref_col", "id")
                join_parts.append(
                    f'LEFT JOIN "{rel_table}" {rel_alias} ON "{table}"."{fk_col}" = {rel_alias}."{ref_col}"'
                )
            join_clause = " ".join(join_parts)

        query = f'SELECT COUNT(*) FROM "{table}" {join_clause}'
        
        # Process WHERE clause with alias mapping
        processed_where = []
        if where:
            filter_list = where if isinstance(where, list) else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
            
            for f in filter_list:
                new_f = f.copy()
                field = new_f.get("field")
                if not field: continue
                
                if "." in field:
                    parts = field.split(".")
                    rel_t = parts[0]
                    col = parts[1]
                    if rel_t in alias_map:
                        new_f["field"] = f'{alias_map[rel_t]}"."{col}'
                    else:
                        new_f["field"] = field
                else:
                    new_f["field"] = f'{table}"."{field}'
                processed_where.append(new_f)
            
            # Use column_prefix="" because fields are already fully qualified
            where_clause, params = self._build_where_clause(processed_where, use_index=True, column_prefix="")
        else:
            where_clause, params = ("", [])
            
        query += where_clause
        
        async with self._pool.acquire() as conn:
            return await conn.fetchval(query, *params)
    
    async def count_search_matches(self, table: str, query: str) -> int:
        """Count records matching search query across all columns."""
        schema = await self.get_schema(table)
        columns = [col["name"] for col in schema["columns"]]
        if not columns:
            return 0
            
        conditions = []
        params = []
        for i, col in enumerate(columns, 1):
            conditions.append(f'CAST("{col}" AS TEXT) LIKE ${i}')
            params.append(f"%{query}%")
            
        where_clause = " OR ".join(conditions)
        sql = f'SELECT COUNT(*) FROM "{table}" WHERE {where_clause}'
        
        async with self._pool.acquire() as conn:
            return await conn.fetchval(sql, *params)

    async def search_records(
        self,
        table: str,
        query: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Search across all columns for matching records."""
        # Get schema to know which columns to search
        schema = await self.get_schema(table)
        columns = [col["name"] for col in schema["columns"]]
        
        if not columns:
            return []
        
        # Build OR conditions for each column using CAST to TEXT
        conditions = []
        params = []
        for i, col in enumerate(columns, 1):
            conditions.append(f'CAST("{col}" AS TEXT) LIKE ${i}')
            params.append(f"%{query}%")
        
        where_clause = " OR ".join(conditions)
        query_sql = f'SELECT * FROM "{table}" WHERE {where_clause} LIMIT {limit} OFFSET {offset}'
        
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query_sql, *params)
            return [dict(row) for row in rows]
