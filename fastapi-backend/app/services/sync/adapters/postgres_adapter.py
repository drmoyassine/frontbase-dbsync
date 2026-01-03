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
                ]
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
    ) -> List[Dict[str, Any]]:
        """Read records from table."""
        cols = ", ".join(f'"{c}"' for c in columns) if columns else "*"
        query = f'SELECT {cols} FROM "{table}"'
        
        where_clause, params = self._build_where_clause(where, use_index=True)
        query += where_clause
        
        query += f" LIMIT {limit} OFFSET {offset}"
        
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
    ) -> int:
        """Count records in table."""
        query = f'SELECT COUNT(*) FROM "{table}"'
        
        where_clause, params = self._build_where_clause(where, use_index=True)
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
        limit: int = 100
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
        query_sql = f'SELECT * FROM "{table}" WHERE {where_clause} LIMIT {limit}'
        
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query_sql, *params)
            return [dict(row) for row in rows]
