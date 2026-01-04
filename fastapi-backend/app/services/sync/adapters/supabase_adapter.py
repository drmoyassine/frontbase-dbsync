"""
Supabase adapter - API-first with optional direct DB connection.

Primary: REST API (required) - for CRUD, RLS-aware queries, schema via RPC
Secondary: Direct PostgreSQL (optional) - for bulk ops, bypassing RLS
"""

from typing import Any, Dict, List, Optional, Union
import logging
import httpx

from app.services.sync.adapters.postgres_adapter import PostgresAdapter
from app.services.sync.adapters.base import SQLAdapter
from app.services.sync.models.datasource import Datasource


class SupabaseAdapter(SQLAdapter):
    """
    Supabase database adapter.
    
    API URL + Secret Key = Required (for REST API, RPC functions)
    DB URI = Optional (for direct PostgreSQL when performance matters)
    
    Supports both legacy (anon/service_role) and new (publishable/secret) API keys.
    """
    
    def __init__(self, datasource: "Datasource"):
        super().__init__(datasource)
        self._client: Optional[httpx.AsyncClient] = None
        self._postgres_adapter: Optional[PostgresAdapter] = None
        self._has_db_connection = False
        self._schema_cache: Optional[Dict] = None
        self.logger = logging.getLogger(f"app.adapters.supabase.{self.datasource.name}")
    
    @property
    def has_db_connection(self) -> bool:
        """Check if direct DB connection is available."""
        return self._has_db_connection
    
    def _get_api_key(self) -> Optional[str]:
        """Get API key - supports both legacy and new key naming."""
        # Try service_role/secret key first (bypasses RLS)
        return self.datasource.api_key_encrypted  # TODO: decrypt
    
    async def connect(self) -> None:
        """Connect to Supabase - REST API required, DB optional."""
        self.logger.info(f"Initializing Supabase adapter for {self.datasource.name}")
        
        api_key = self._get_api_key()
        
        # REST API client (required)
        if self.datasource.api_url and api_key:
            self.logger.info(f"Setting up Supabase REST client: {self.datasource.api_url}")
            self._client = httpx.AsyncClient(
                base_url=self.datasource.api_url,
                headers={
                    "apikey": api_key,
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                },
                timeout=30.0
            )
        else:
            raise ValueError("Supabase requires API URL and API Key")
        
        # Direct PostgreSQL connection (optional)
        if self._has_connection_uri():
            try:
                self.logger.info("Setting up direct PostgreSQL connection...")
                self._postgres_adapter = PostgresAdapter(self.datasource)
                await self._postgres_adapter.connect()
                self._has_db_connection = True
                self.logger.info("Direct DB connection established")
            except Exception as e:
                self.logger.warning(f"Direct DB connection failed (using API only): {e}")
                self._has_db_connection = False
    
    def _has_connection_uri(self) -> bool:
        """Check if we have DB connection details."""
        ds = self.datasource
        # Check for connection URI or individual connection params
        # Use getattr since connection_uri may not exist on all models
        if getattr(ds, 'connection_uri', None):
            return True
        if ds.host and ds.database and ds.username:
            return True
        return False
    
    async def disconnect(self) -> None:
        """Close all connections."""
        if self._client:
            await self._client.aclose()
            self._client = None
        if self._postgres_adapter:
            await self._postgres_adapter.disconnect()
            self._postgres_adapter = None
        self._has_db_connection = False
    
    # =========================================================================
    # Schema & Table Discovery
    # =========================================================================
    
    async def get_tables(self) -> List[str]:
        """Get list of tables - uses DB if available, else RPC."""
        if self._has_db_connection and self._postgres_adapter:
            return await self._postgres_adapter.get_tables()
        
        # Use RPC function
        return await self._get_tables_via_rpc()
    
    async def _get_tables_via_rpc(self) -> List[str]:
        """Get tables via frontbase_get_schema_info RPC."""
        schema_info = await self._get_schema_info()
        if schema_info and "tables" in schema_info:
            return [t["table_name"] for t in schema_info["tables"] if t.get("table_name")]
        return []
    
    async def get_schema(self, table: str) -> Dict[str, Any]:
        """Get table schema - uses DB if available, else RPC."""
        if self._has_db_connection and self._postgres_adapter:
            return await self._postgres_adapter.get_schema(table)
        
        # Use RPC function
        return await self._get_schema_via_rpc(table)
    
    async def _get_schema_via_rpc(self, table: str) -> Dict[str, Any]:
        """Get schema for a specific table via RPC."""
        schema_info = await self._get_schema_info()
        if not schema_info or "tables" not in schema_info:
            return {"columns": []}
        
        # Find the table
        for t in schema_info["tables"]:
            if t.get("table_name") == table:
                columns = t.get("columns") or []
                # Also get FK info
                fk_map = {}
                for fk in schema_info.get("foreign_keys") or []:
                    if fk.get("table_name") == table:
                        fk_map[fk["column_name"]] = {
                            "foreign_table": fk.get("foreign_table_name"),
                            "foreign_column": fk.get("foreign_column_name")
                        }
                
                # Prepare FK list for return
                table_fks = []
                for fk in schema_info.get("foreign_keys") or []:
                    if fk.get("table_name") == table:
                        table_fks.append({
                            "constrained_columns": [fk.get("column_name")],
                            "referred_table": fk.get("foreign_table_name"),
                            "referred_columns": [fk.get("foreign_column_name")]
                        })

                # Enrich columns with FK info
                for col in columns:
                    col_name = col.get("column_name")
                    if col_name in fk_map:
                        col["is_foreign"] = True
                        col["foreign_table"] = fk_map[col_name]["foreign_table"]
                        col["foreign_column"] = fk_map[col_name]["foreign_column"]
                    else:
                        col["is_foreign"] = False
                    
                    # Normalize field names
                    col["name"] = col.get("column_name")
                    col["type"] = col.get("data_type")
                    col["nullable"] = col.get("is_nullable") == "YES"
                
                return {"columns": columns, "foreign_keys": table_fks}
        
        return {"columns": []}
    
    async def get_all_relationships(self) -> List[Dict[str, Any]]:
        """Get all FK relationships - uses DB if available, else RPC."""
        if self._has_db_connection and self._postgres_adapter:
            return await self._postgres_adapter.get_all_relationships()
        
        # Use RPC function
        return await self._get_relationships_via_rpc()
    
    async def _get_relationships_via_rpc(self) -> List[Dict[str, Any]]:
        """Get all relationships via RPC."""
        schema_info = await self._get_schema_info()
        if not schema_info or "foreign_keys" not in schema_info:
            return []
        
        return [
            {
                "source_table": fk.get("table_name"),
                "source_column": fk.get("column_name"),
                "target_table": fk.get("foreign_table_name"),
                "target_column": fk.get("foreign_column_name"),
            }
            for fk in schema_info.get("foreign_keys") or []
        ]
    
    async def _get_schema_info(self) -> Optional[Dict]:
        """Call frontbase_get_schema_info RPC (cached)."""
        if self._schema_cache:
            return self._schema_cache
        
        try:
            response = await self._client.post(
                "/rest/v1/rpc/frontbase_get_schema_info",
                json={}
            )
            if response.status_code == 200:
                self._schema_cache = response.json()
                return self._schema_cache
            else:
                self.logger.warning(f"RPC frontbase_get_schema_info failed: {response.status_code}")
        except Exception as e:
            self.logger.error(f"Failed to call frontbase_get_schema_info: {e}")
        
        return None
    
    # =========================================================================
    # CRUD Operations
    # =========================================================================
    
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
        """Read records - uses DB if available, else REST API."""
        if self._has_db_connection and self._postgres_adapter:
            return await self._postgres_adapter.read_records(table, columns, where, limit, offset, order_by, order_direction)
        
        return await self._read_records_via_api(table, columns, where, limit, offset, order_by, order_direction)
    
    async def read_records_with_relations(
        self,
        table: str,
        select_param: str,  # PostgREST format: "*,programs(degree_name,type,level)"
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        limit: int = 100,
        offset: int = 0,
        order_by: Optional[str] = None,
        order_direction: Optional[str] = "asc",
        search: Optional[str] = None,
        related_specs: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Read records with related table data using PostgREST nested select.
        
        This uses Supabase's native embedding feature where foreign key relationships
        are resolved in a single request. Returns flattened records with keys like "programs.degree_name".
        """
        # Use REST API with nested select - Supabase handles JOINs automatically
        records = await self._read_records_via_api(
            table, 
            columns=None, 
            where=where, 
            limit=limit,
            offset=offset,
            order_by=order_by,
            order_direction=order_direction,
            select_param=select_param,
            search=search,
            related_specs=related_specs
        )
        
        
        # Flatten nested objects to "table.column" format
        flattened = []
        for record in records:
            flat_record = {}
            for key, value in record.items():
                if isinstance(value, dict):
                    # Nested object from related table
                    for sub_key, sub_value in value.items():
                        flat_record[f"{key}.{sub_key}"] = sub_value
                else:
                    flat_record[key] = value
            flattened.append(flat_record)
        
        return flattened
    
    async def _read_records_via_api(
        self,
        table: str,
        columns: Optional[List[str]] = None,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        limit: int = 100,
        offset: int = 0,
        order_by: Optional[str] = None,
        order_direction: Optional[str] = "asc",
        select_param: Optional[str] = None,  # PostgREST format: "*,programs(degree_name,type)"
        search: Optional[str] = None,
        related_specs: Optional[List[Dict[str, Any]]] = None, # Added to support related search
    ) -> List[Dict[str, Any]]:
        """Read records using REST API."""
        params = {}
        
        # Use select_param if provided, else columns
        final_select = select_param if select_param else (",".join(columns) if columns else "*")
        
        # Detect filters on related tables to enforce !inner join
        related_filters = set()
        if where:
            filter_list = where if isinstance(where, list) else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
            for f in filter_list:
                k = f.get("field")
                if k and "." in k:
                    related_filters.add(k.split(".")[0])
        
        if related_filters and final_select:
             for t in related_filters:
                  # Inject !inner if not present
                  if f"{t}(" in final_select and f"{t}!inner(" not in final_select:
                       final_select = final_select.replace(f"{t}(", f"{t}!inner(")
        
        params["select"] = final_select
        
        if where:
            filter_list = where if isinstance(where, list) else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
            for f in filter_list:
                k = f.get("field")
                v = f.get("value")
                op = f.get("operator", "==")
                
                if not k or v is None:
                    continue
                
                if op == "==":
                    params[k] = f"eq.{v}"
                elif op == "!=":
                    params[k] = f"neq.{v}"
                elif op == ">":
                    params[k] = f"gt.{v}"
                elif op == "<":
                    params[k] = f"lt.{v}"
                elif op == "contains":
                    params[k] = f"ilike.*{v}*"
        
        # Search logic (PostgREST)
        if search:
            try:
                # Need schema to find text columns of MAIN table
                schema = await self.get_schema(table)
                cols = [c["name"] for c in schema["columns"] if any(t in str(c.get("type")).lower() for t in ["char", "text", "string", "varchar"])]
                
                or_conds = [f"{col}.ilike.*{search}*" for col in cols[:10]] # Limit to 10 cols
                
                # Check related tables if specs provided
                if related_specs:
                    for spec in related_specs:
                        t_name = spec["table"]
                        try:
                            # We need schema for related table to find searchable columns
                            # Warning: this adds overhead. Maybe cache? get_schema is cached in service but here we call adapter method.
                            # Adapter get_schema checks standard cache? Yes.
                            rel_schema = await self.get_schema(t_name)
                            rel_cols = [c["name"] for c in rel_schema["columns"] if any(t in str(c.get("type")).lower() for t in ["char", "text", "string", "varchar"])]
                            
                            # 2-Step Search Strategy:
                            # 1. Find IDs in related table matching search
                            # 2. Add fk_col.in.(ids) to main OR
                            
                            # Find FK column in main table schema pointing to this related table
                            fk_col = None
                            if schema and "foreign_keys" in schema:
                                for fk in schema["foreign_keys"]:
                                    if fk["target_table"] == t_name:
                                        fk_col = fk["column"]
                                        break
                            
                            if fk_col and rel_cols:
                                # Search related table for matching IDs
                                # We need to limit this to avoid huge query params (e.g. max 100 ids)
                                rel_or = [f"{rc}.ilike.*{search}*" for rc in rel_cols[:5]]
                                rel_params = {
                                    "select": "id", # Assuming related table has 'id'
                                    "or": f"({','.join(rel_or)})",
                                    "limit": "50"
                                }
                                try:
                                    # Call raw client to avoid recursion/overhead
                                    rel_res = await self._client.get(f"/rest/v1/{t_name}", params=rel_params)
                                    if rel_res.status_code == 200:
                                        rel_ids = [str(r["id"]) for r in rel_res.json() if "id" in r]
                                        if rel_ids:
                                            or_conds.append(f"{fk_col}.in.({','.join(rel_ids)})")
                                except Exception:
                                    pass
                        except Exception:
                            continue

                if or_conds:
                    params["or"] = f"({','.join(or_conds)})"
            except Exception:
                pass
        
        # PostgREST support for related table sorting: table(col).asc
        if order_by:
             if "." in order_by:
                parts = order_by.split(".")
                if len(parts) >= 2:
                    table_part = parts[0]
                    col_part = ".".join(parts[1:]) 
                    direction = "desc" if order_direction and order_direction.lower() == "desc" else "asc"
                    params["order"] = f"{table_part}({col_part}).{direction}"
             else:
                direction = ".desc" if order_direction and order_direction.lower() == "desc" else ".asc"
                params["order"] = f"{order_by}{direction}"
        
        params["limit"] = str(limit)
        params["offset"] = str(offset)
        
        response = await self._client.get(f"/rest/v1/{table}", params=params)
             
        if response.status_code >= 400:
             # Retain improved error logging for safety
             raise ValueError(f"Supabase API Read Error: {response.text} - Params: {params}")
             
        response.raise_for_status()
        return response.json()
    
    async def count_records(
        self,
        table: str,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        related_specs: Optional[List[Dict[str, Any]]] = None,
        search: Optional[str] = None,
    ) -> int:
        """Count records - uses DB if available, else REST API."""
        if self._has_db_connection and self._postgres_adapter:
            # Need to ensure postgres adapter accepts search in count_records, or fallback
            try:
                return await self._postgres_adapter.count_records(table, where, related_specs, search=search)
            except TypeError:
                return await self._postgres_adapter.count_records(table, where, related_specs)
        
        # Use REST API with count header
        # Optimization: Only include related table in 'select' if we are actually filtering (where) on it.
        # BUT if we are SEARCHING (search), we might match on related columns.
        # If we implement related search using 'or' param, we don't necessarily need !inner join on embedding.
        # But for 'or' to rely on related columns, PostgREST might require embedding?
        # My previous test (trigger_search_or.py) used explicit embedding in select.
        # So we should include embedding if related_specs provided and search is active.
        
        select_val = "*"
        
        # Check for related table filters
        related_filters = set()
        if where:
            filter_list = where if isinstance(where, list) else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
            for f in filter_list:
                k = f.get("field")
                if k and "." in k:
                    related_filters.add(k.split(".")[0])

        if related_specs:
             # Add embedding:
             # 1. If filtering (where) on table -> use !inner
             # 2. If searching (search) -> we might search related text. To be safe, include standard embedding (outer).
             #    If we make it !inner, we restrict search to ONLY matching related. 
             #    Ideally search matches (Parent OR Child). Outer join is safer.
             embeddings = []
             for spec in related_specs:
                 t = spec['table']
                 suffix = ""
                 if t in related_filters:
                     suffix = "!inner"
                 # Always include embedding if search is active (to allow 'or' to reference it) or if filtered
                 if suffix or search:
                     embeddings.append(f"{t}{suffix}(*)")
             
             if embeddings:
                select_val = f"*,{','.join(embeddings)}"
        
        params = {"select": select_val, "limit": "1", "offset": "0"}
        
        if where:
            filter_list = where if isinstance(where, list) else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
            for f in filter_list:
                k, v, op = f.get("field"), f.get("value"), f.get("operator", "==")
                if k and v is not None:
                    if op == "==":
                        params[k] = f"eq.{v}"

        # Search logic (Duplicate from _read_records_via_api)
        if search:
            try:
                schema = await self.get_schema(table)
                cols = [c["name"] for c in schema["columns"] if any(t in str(c.get("type")).lower() for t in ["char", "text", "string", "varchar"])]
                or_conds = [f"{col}.ilike.*{search}*" for col in cols[:10]]
                
                if related_specs:
                    for spec in related_specs:
                        t_name = spec["table"]
                        try:
                            rel_schema = await self.get_schema(t_name)
                            rel_cols = [c["name"] for c in rel_schema["columns"] if any(t in str(c.get("type")).lower() for t in ["char", "text", "string", "varchar"])]
                            # 2-Step Search Strategy (Duplicate)
                            fk_col = None
                            if schema and "foreign_keys" in schema:
                                for fk in schema["foreign_keys"]:
                                    if fk["target_table"] == t_name:
                                        fk_col = fk["column"]
                                        break
                            
                            if fk_col and rel_cols:
                                rel_or = [f"{rc}.ilike.*{search}*" for rc in rel_cols[:5]]
                                rel_params = {
                                    "select": "id",
                                    "or": f"({','.join(rel_or)})",
                                    "limit": "50"
                                }
                                try:
                                    rel_res = await self._client.get(f"/rest/v1/{t_name}", params=rel_params)
                                    if rel_res.status_code == 200:
                                        rel_ids = [str(r["id"]) for r in rel_res.json() if "id" in r]
                                        if rel_ids:
                                            or_conds.append(f"{fk_col}.in.({','.join(rel_ids)})")
                                except Exception:
                                    pass
                        except Exception:
                            continue

                if or_conds:
                    params["or"] = f"({','.join(or_conds)})"
            except Exception:
                pass
        
        response = await self._client.get(
            f"/rest/v1/{table}",
            params=params,
            headers={"Prefer": "count=exact"}
        )
        
        if response.status_code >= 400:
            raise ValueError(f"Supabase API Error: {response.text} - Params: {params}")
        
        response.raise_for_status()
        
        # Count is in Content-Range header
        content_range = response.headers.get("content-range", "")
        if "/" in content_range:
            return int(content_range.split("/")[-1])
        return 0
    
    async def read_record_by_key(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> Optional[Dict[str, Any]]:
        """Read single record by key."""
        if self._has_db_connection and self._postgres_adapter:
            return await self._postgres_adapter.read_record_by_key(table, key_column, key_value)
        
        response = await self._client.get(
            f"/rest/v1/{table}",
            params={key_column: f"eq.{key_value}", "limit": "1"}
        )
        response.raise_for_status()
        data = response.json()
        return data[0] if data else None
    
    async def upsert_record(
        self,
        table: str,
        record: Dict[str, Any],
        key_column: str,
    ) -> Dict[str, Any]:
        """Upsert record - uses DB if available, else REST API."""
        if self._has_db_connection and self._postgres_adapter:
            return await self._postgres_adapter.upsert_record(table, record, key_column)
        
        response = await self._client.post(
            f"/rest/v1/{table}",
            json=record,
            headers={"Prefer": "resolution=merge-duplicates,return=representation"}
        )
        response.raise_for_status()
        data = response.json()
        return data[0] if data else record
    
    async def delete_record(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> bool:
        """Delete record by key."""
        if self._has_db_connection and self._postgres_adapter:
            return await self._postgres_adapter.delete_record(table, key_column, key_value)
        
        response = await self._client.delete(
            f"/rest/v1/{table}",
            params={key_column: f"eq.{key_value}"}
        )
        return response.status_code == 204
    
    async def search_records(self, table: str, query: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Search for records by text content."""
        if self._has_db_connection and self._postgres_adapter:
            return await self._postgres_adapter.search_records(table, query)
        
        # Use generic method which handles limit/offset/search logic consistently
        return await self._read_records_via_api(
            table,
            limit=limit, 
            offset=offset,
            search=query
        )
    
    async def count_search_matches(self, table: str, query: str) -> int:
        """Count records matching search query."""
        if self._has_db_connection and self._postgres_adapter:
            return await self._postgres_adapter.count_search_matches(table, query)
        
        # Use REST API count
        results = await self.search_records(table, query)
        return len(results)
    
    # =========================================================================
    # Migration & Setup
    # =========================================================================
    
    async def check_migration_status(self) -> Dict[str, Any]:
        """Check if Frontbase migration has been applied."""
        try:
            response = await self._client.post(
                "/rest/v1/rpc/frontbase_get_schema_info",
                json={}
            )
            if response.status_code == 200:
                return {"applied": True, "functions": ["frontbase_get_schema_info"]}
            else:
                return {"applied": False, "error": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"applied": False, "error": str(e)}
    
    async def apply_migration(self, sql: str) -> Dict[str, Any]:
        """Apply SQL migration via exec_sql RPC or direct DB."""
        if self._has_db_connection and self._postgres_adapter:
            # Direct execution via DB
            try:
                async with self._postgres_adapter._pool.acquire() as conn:
                    await conn.execute(sql)
                return {"success": True, "method": "direct_db"}
            except Exception as e:
                return {"success": False, "error": str(e), "method": "direct_db"}
        
        # Try via exec_sql RPC (if it exists)
        try:
            response = await self._client.post(
                "/rest/v1/rpc/exec_sql",
                json={"query": sql}
            )
            if response.status_code == 200:
                return {"success": True, "method": "rpc"}
            else:
                return {"success": False, "error": f"HTTP {response.status_code}", "method": "rpc"}
        except Exception as e:
            return {"success": False, "error": str(e), "method": "rpc"}
