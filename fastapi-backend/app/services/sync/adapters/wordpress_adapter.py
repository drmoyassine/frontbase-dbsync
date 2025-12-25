"""
WordPress adapter - MySQL adapter for WordPress databases.
"""

from typing import Any, Dict, List, Optional, Union
import aiomysql
import json

from app.services.sync.adapters.base import DatabaseAdapter
from app.services.sync.models.datasource import Datasource


from app.services.sync.adapters.base import SQLAdapter

class WordPressAdapter(SQLAdapter):
    """
    WordPress/MySQL database adapter using aiomysql.
    
    Handles WordPress-specific table structures like wp_posts and wp_postmeta.
    """
    
    def __init__(self, datasource: "Datasource"):
        super().__init__(datasource)
        import logging
        self.logger = logging.getLogger(f"app.adapters.wordpress.{self.datasource.name}")
        
        self._pool: Optional[aiomysql.Pool] = None
        self._prefix = datasource.table_prefix or "wp_"
    
    async def connect(self) -> None:
        """Establish connection pool to MySQL."""
        host = self._sanitize_host(self.datasource.host)
        port = self.datasource.port
        
        self._pool = await aiomysql.create_pool(
            host=host,
            port=port,
            db=self.datasource.database,
            user=self.datasource.username,
            password=self.datasource.password_encrypted or "",  # TODO: decrypt
            minsize=1,
            maxsize=10,
            autocommit=True,
        )
    
    async def disconnect(self) -> None:
        """Close the connection pool."""
        if self._pool:
            self._pool.close()
            await self._pool.wait_closed()
            self._pool = None
    
    async def get_tables(self) -> List[str]:
        """Get list of WordPress tables."""
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SHOW TABLES")
                rows = await cur.fetchall()
                return [row[0] for row in rows]
    
    async def get_schema(self, table: str) -> Dict[str, Any]:
        """Get column information for a table."""
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(f"DESCRIBE `{table}`")
                rows = await cur.fetchall()
                
                columns = []
                for row in rows:
                    # Robust key access (some MySQL versions return lowercase)
                    r = {k.lower(): v for k, v in row.items()}
                    columns.append({
                        "name": r.get("field"),
                        "type": r.get("type"),
                        "nullable": r.get("null") == "YES",
                        "default": r.get("default"),
                        "primary_key": r.get("key") == "PRI",
                    })
                
                return {"columns": columns}
    
    async def _build_filtered_query(
        self,
        table: str,
        base_select: str,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
    ) -> tuple[str, List[Any]]:
        """
        Build a query with intelligent WordPress meta joining.
        """
        query = f"{base_select} FROM `{table}`"
        params = []
        conditions = []
        
        if not where:
            return query, []
            
        filter_list = where if isinstance(where, list) else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
        
        # Determine if we are querying the posts table
        is_posts = table.endswith("posts")
        meta_table = f"{self._prefix}postmeta" if is_posts else None
        
        meta_joins = 0
        for f in filter_list:
            k, v, op = f.get("field"), f.get("value"), f.get("operator", "==")
            if not k or v is None: continue
            
            # Detect if field is likely a meta field (not in posts table or starts with _)
            # For posts table, we support dynamic joining
            if is_posts and (k.startswith("_") or k not in ["ID", "post_author", "post_date", "post_content", "post_title", "post_status", "post_type"]):
                alias = f"m{meta_joins}"
                query += f" JOIN `{meta_table}` {alias} ON {alias}.post_id = `{table}`.ID"
                
                if op == "==":
                    conditions.append(f"{alias}.meta_key = %s AND {alias}.meta_value = %s")
                    params.extend([k, v])
                elif op == "contains":
                    conditions.append(f"{alias}.meta_key = %s AND {alias}.meta_value LIKE %s")
                    params.extend([k, f"%{v}%"])
                # ... add other ops if needed
                meta_joins += 1
            else:
                # Standard column filter
                if op == "==":
                    conditions.append(f"`{k}` = %s")
                    params.append(v)
                elif op == "contains":
                    conditions.append(f"`{k}` LIKE %s")
                    params.append(f"%{v}%")
                elif op == ">":
                    conditions.append(f"`{k}` > %s")
                    params.append(v)
                elif op == "<":
                    conditions.append(f"`{k}` < %s")
                    params.append(v)
        
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
            
        return query, params

    async def count_search_matches(self, table: str, query: str) -> int:
        """
        Count records matching search query. Optimized for WordPress.
        """
        sql = f"SELECT COUNT(*) FROM `{table}` WHERE "
        params = []
        
        is_posts = (table == f"{self._prefix}posts")
        is_users = (table == f"{self._prefix}users")
        
        if is_posts:
            sql += "(post_title LIKE %s OR post_content LIKE %s)"
            params.extend([f"%{query}%", f"%{query}%"])
        elif is_users:
            sql += "(user_login LIKE %s OR user_email LIKE %s OR display_name LIKE %s)"
            params.extend([f"%{query}%", f"%{query}%", f"%{query}%"])
        else:
            try:
                schema = await self.get_schema(table)
                # Only search in string-like columns to avoid errors and improve performance
                cols = [c["name"] for c in schema["columns"] if any(t in c["type"].lower() for t in ["char", "text", "string"])]
                
                if not cols: return 0
                
                # Limit number of columns to search to avoid extremely long queries
                max_cols = 15
                search_cols = cols[:max_cols]
                
                conditions = [f"`{c}` LIKE %s" for c in search_cols]
                sql += " OR ".join(conditions)
                params.extend([f"%{query}%"] * len(search_cols))
            except Exception:
                return 0
        
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, params)
                row = await cur.fetchone()
                return row[0] if row else 0

    async def search_records(self, table: str, query: str) -> List[Dict[str, Any]]:
        """
        Search for records by text content. 
        For WordPress, we search post_title and post_content.
        """
        # Determine table alias
        t_alias = "t"
        
        sql = f"SELECT * FROM `{table}` {t_alias} WHERE "
        params = []
        
        is_posts = (table == f"{self._prefix}posts")
        is_users = (table == f"{self._prefix}users")
        
        # Build search conditions - target common text columns
        # In a generic SQL adapter, we might need schema info to know which columns are text
        # For WP, we know the schema roughly
        if is_posts:
            sql += f"({t_alias}.post_title LIKE %s OR {t_alias}.post_content LIKE %s)"
            params.extend([f"%{query}%", f"%{query}%"])
        elif is_users:
             sql += f"({t_alias}.user_login LIKE %s OR {t_alias}.user_email LIKE %s OR {t_alias}.display_name LIKE %s)"
             params.extend([f"%{query}%", f"%{query}%", f"%{query}%"])   
        else:
             # Fallback for other tables - search text-like columns
             try:
                 schema = await self.get_schema(table)
                 cols = [c["name"] for c in schema["columns"] if any(t in c["type"].lower() for t in ["char", "text", "string"])]
                 
                 if not cols:
                     return []
                     
                 # Limit number of columns to search
                 max_cols = 15
                 search_cols = cols[:max_cols]
                 
                 sql += " OR ".join([f"{t_alias}.`{c}` LIKE %s" for c in search_cols])
                 params.extend([f"%{query}%"] * len(search_cols))
             except Exception:
                 return []
             
        limit = 50
        sql += f" LIMIT {limit}"
        
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, params)
                return await cur.fetchall()

    async def read_records(
        self,
        table: str,
        columns: Optional[List[str]] = None,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """Read records from table with meta-aware filtering."""
        cols = ", ".join(f"`{table}`.`{c}`" for c in columns) if columns else f"`{table}`.*"
        
        query, params = await self._build_filtered_query(table, f"SELECT {cols}", where)
        
        query += f" LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(query, params)
                return list(await cur.fetchall())

    async def count_records(
        self,
        table: str,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
    ) -> int:
        """Count records with meta-aware filtering."""
        query, params = await self._build_filtered_query(table, "SELECT COUNT(*)", where)
        
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, params)
                row = await cur.fetchone()
                return row[0] if row else 0
    
    async def read_record_by_key(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> Optional[Dict[str, Any]]:
        """Read a single record by primary key."""
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    f"SELECT * FROM `{table}` WHERE `{key_column}` = %s",
                    (key_value,)
                )
                return await cur.fetchone()
    
    async def upsert_record(
        self,
        table: str,
        record: Dict[str, Any],
        key_column: str,
    ) -> Dict[str, Any]:
        """Insert or update a record using ON DUPLICATE KEY UPDATE."""
        columns = list(record.keys())
        values = list(record.values())
        
        placeholders = ", ".join(["%s"] * len(values))
        col_list = ", ".join(f"`{c}`" for c in columns)
        
        # Build update clause for non-key columns
        update_cols = [c for c in columns if c != key_column]
        update_clause = ", ".join(f"`{c}` = VALUES(`{c}`)" for c in update_cols)
        
        query = f"""
            INSERT INTO `{table}` ({col_list})
            VALUES ({placeholders})
            ON DUPLICATE KEY UPDATE {update_clause}
        """
        
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(query, values)
                
                # Fetch the updated/inserted record
                key_value = record.get(key_column)
                if key_value:
                    await cur.execute(
                        f"SELECT * FROM `{table}` WHERE `{key_column}` = %s",
                        (key_value,)
                    )
                    return await cur.fetchone() or record
                return record
    
    async def delete_record(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> bool:
        """Delete a record by key."""
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                result = await cur.execute(
                    f"DELETE FROM `{table}` WHERE `{key_column}` = %s",
                    (key_value,)
                )
                return result > 0
    

    
    # WordPress-specific helper methods
    
    async def get_posts(
        self,
        post_type: str = "post",
        status: str = "publish",
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Get WordPress posts with their metadata."""
        posts_table = f"{self._prefix}posts"
        meta_table = f"{self._prefix}postmeta"
        
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                # Get posts
                await cur.execute(f"""
                    SELECT * FROM `{posts_table}`
                    WHERE post_type = %s AND post_status = %s
                    ORDER BY post_date DESC
                    LIMIT %s
                """, (post_type, status, limit))
                posts = await cur.fetchall()
                
                # Get metadata for each post
                for post in posts:
                    await cur.execute(f"""
                        SELECT meta_key, meta_value
                        FROM `{meta_table}`
                        WHERE post_id = %s
                    """, (post["ID"],))
                    meta_rows = await cur.fetchall()
                    post["meta"] = {row["meta_key"]: row["meta_value"] for row in meta_rows}
                
                return posts
    
    async def upsert_post_with_meta(
        self,
        post_data: Dict[str, Any],
        meta_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Upsert a WordPress post with its metadata."""
        posts_table = f"{self._prefix}posts"
        meta_table = f"{self._prefix}postmeta"
        
        # Extract meta from post_data if present
        if "meta" in post_data:
            meta_data = {**post_data.pop("meta"), **meta_data}
        
        # Upsert the post
        post = await self.upsert_record(posts_table, post_data, "ID")
        post_id = post.get("ID")
        
        if post_id and meta_data:
            async with self._pool.acquire() as conn:
                async with conn.cursor() as cur:
                    for key, value in meta_data.items():
                        # Serialize objects/arrays
                        if isinstance(value, (dict, list)):
                            value = json.dumps(value)
                        
                        await cur.execute(f"""
                            INSERT INTO `{meta_table}` (post_id, meta_key, meta_value)
                            VALUES (%s, %s, %s)
                            ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)
                        """, (post_id, key, value))
        
        post["meta"] = meta_data
        return post
