"""
Supabase adapter - extends PostgresAdapter with Supabase-specific features.
"""

from typing import Any, Dict, List, Optional, Union
import logging
import httpx

from app.services.sync.adapters.postgres_adapter import PostgresAdapter
from app.services.sync.models.datasource import Datasource


class SupabaseAdapter(PostgresAdapter):
    """
    Supabase database adapter.
    
    Can use either direct PostgreSQL connection (via asyncpg) or Supabase REST API.
    Direct connection is preferred for bulk operations.
    """
    
    def __init__(self, datasource: "Datasource"):
        super().__init__(datasource)
        self._client: Optional[httpx.AsyncClient] = None
        self._use_rest_api = False  # Prefer direct connection
        self.logger = logging.getLogger(f"app.adapters.supabase.{self.datasource.name}")
    
    async def connect(self) -> None:
        """Connect to Supabase - uses direct Postgres connection."""
        self.logger.info(f"Initializing Supabase adapter for {self.datasource.name}")
        # If we have API credentials, also set up REST client for certain operations
        if self.datasource.api_url and self.datasource.api_key_encrypted:
            self.logger.info(f"Setting up Supabase REST client with URL: {self.datasource.api_url}")
            self._client = httpx.AsyncClient(
                base_url=f"{self.datasource.api_url}/rest/v1",
                headers={
                    "apikey": self.datasource.api_key_encrypted,  # TODO: decrypt
                    "Authorization": f"Bearer {self.datasource.api_key_encrypted}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                }
            )
        
        # Use parent's PostgreSQL connection
        self.logger.info("Falling back to Postgres direct connection for core operations")
        await super().connect()
    
    async def disconnect(self) -> None:
        """Close connections."""
        if self._client:
            await self._client.aclose()
            self._client = None
        await super().disconnect()
    
    async def get_tables_via_api(self) -> List[str]:
        """Get tables using Supabase REST API (alternative method)."""
        if not self._client:
            return await self.get_tables()
        
        # Use introspection endpoint if available
        try:
            response = await self._client.get("/")
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, dict) and "paths" in data:
                    return list(data["paths"].keys())
        except Exception:
            pass
        
        # Fall back to SQL query
        return await self.get_tables()
    
    async def read_records_via_api(
        self,
        table: str,
        columns: Optional[List[str]] = None,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """Read records using Supabase REST API (alternative method)."""
        if not self._client:
            return await self.read_records(table, columns, where, limit, offset)
        
        # Build query params
        params = {}
        
        if columns:
            params["select"] = ",".join(columns)
        
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
        
        params["limit"] = str(limit)
        params["offset"] = str(offset)
        
        response = await self._client.get(f"/{table}", params=params)
        response.raise_for_status()
        return response.json()
    
    async def upsert_record_via_api(
        self,
        table: str,
        record: Dict[str, Any],
        key_column: str,
    ) -> Dict[str, Any]:
        """Upsert using Supabase REST API (alternative method)."""
        if not self._client:
            return await self.upsert_record(table, record, key_column)
        
        response = await self._client.post(
            f"/{table}",
            json=record,
            headers={
                "Prefer": f"resolution=merge-duplicates,return=representation",
            }
        )
        response.raise_for_status()
        data = response.json()
        return data[0] if data else record
