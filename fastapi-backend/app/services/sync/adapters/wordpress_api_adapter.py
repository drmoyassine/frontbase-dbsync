"""
WordPress API adapters - REST and GraphQL implementations.
"""

import json
import base64
from typing import Any, Dict, List, Optional, Union
import httpx

from app.services.sync.adapters.base import DatabaseAdapter
from app.services.sync.models.datasource import Datasource
import logging

logger = logging.getLogger(__name__)


class WordPressBaseApiAdapter(DatabaseAdapter):
    """Base class for WordPress API-based adapters."""
    
    _shared_client: Optional[httpx.AsyncClient] = None

    def __init__(self, datasource: "Datasource"):
        super().__init__(datasource)
        self._api_url = datasource.api_url.rstrip("/") if datasource.api_url else ""
        
    @property
    def _client(self) -> httpx.AsyncClient:
        """Access the shared client, initializing it if necessary."""
        if WordPressBaseApiAdapter._shared_client is None:
            WordPressBaseApiAdapter._shared_client = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0, connect=10.0),
                follow_redirects=True,
                limits=httpx.Limits(max_connections=50, max_keepalive_connections=20)
            )
        return WordPressBaseApiAdapter._shared_client

    def _get_auth_header(self) -> Dict[str, str]:
        """Get Basic Auth header for WordPress Application Passwords."""
        api_key = self.datasource.api_key_encrypted or ""
        username = self.datasource.username or ""
        
        auth_string = api_key
        if ":" not in api_key and username:
            auth_string = f"{username}:{api_key}"
            
        if ":" not in auth_string:
            return {}
        
        encoded = base64.b64encode(auth_string.encode()).decode()
        return {"Authorization": f"Basic {encoded}"}

    def _get_headers(self) -> Dict[str, str]:
        """Get all headers for requests."""
        headers = {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 DB-Synchronizer/1.0",
        }
        auth = self._get_auth_header()
        if auth:
            headers.update(auth)
        return headers

    async def connect(self) -> None:
        """Connection is now handled by the shared property."""
        pass

    async def disconnect(self) -> None:
        """
        Shared client is usually kept alive, but we can close it 
        if explicitly needed for clean shutdown.
        """
        pass


class WordPressRestAdapter(WordPressBaseApiAdapter):
    """WordPress REST API adapter."""

    def _get_resource_url(self, table: str) -> str:
        """
        Get the full API URL for a resource.
        Supports both short names (fallback to wp/v2) and full paths.
        """
        if "/" in table:
            # Full path provided (e.g. 'wc/v3/products')
            return f"{self._api_url}/wp-json/{table.lstrip('/')}"
        
        # Short name (e.g. 'posts')
        return f"{self._api_url}/wp-json/wp/v2/{table}"

    async def _fetch_page(self, url: str, params: Dict[str, Any]) -> tuple[List[Dict[str, Any]], Dict[str, str]]:
        """Fetch a single page and return records + headers."""
        headers = self._get_headers()
        try:
            response = await self._client.get(url, params=params, headers=headers)
            
            # If edit context fails, fallback to view automatically
            if response.status_code in [401, 403] and params.get("context") == "edit":
                logger.info(f"Context 'edit' failed with {response.status_code}, falling back to 'view'")
                params["context"] = "view"
                response = await self._client.get(url, params=params, headers=headers)
                
            if response.status_code == 400: # Likely out of pages or invalid param
                return [], dict(response.headers)
                
            response.raise_for_status()
            data = response.json()
            return (data if isinstance(data, list) else []), response.headers
        except Exception as e:
            logger.error(f"Error fetching page {params.get('page')}: {str(e)}")
            raise

    async def get_tables(self) -> List[str]:
        """
        Deep discovery across ALL WordPress REST namespaces.
        """
        import asyncio
        import re
        
        headers = self._get_headers()
        
        async def fetch_index():
            try:
                url = f"{self._api_url}/wp-json/"
                resp = await self._client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    namespaces = data.get("namespaces", [])
                    routes = data.get("routes", {})
                    
                    found = []
                    for route, details in routes.items():
                        # We are looking for collection endpoints.
                        # Usually, these have GET method and no mandatory ID in path.
                        endpoints = details.get("endpoints", [])
                        has_get = any(e.get("methods", []) == ["GET"] or "GET" in e.get("methods", []) for e in endpoints)
                        
                        if not has_get:
                            continue
                            
                        # Filter out documentation, root, and single-item endpoints
                        # (e.g. skip /wp/v2/posts/(?P<id>[\d]+))
                        if route == "/" or route in namespaces:
                            continue
                        
                        if "(?P<" in route:
                            continue
                            
                        # Clean up path
                        clean_path = route.strip("/")
                        
                        # Optimization: if it starts with wp/v2/, we can just use the short name
                        # for better UI experience, BUT we need to be careful with overlaps.
                        if clean_path.startswith("wp/v2/"):
                            short_name = clean_path[len("wp/v2/"):].strip("/")
                            if "/" not in short_name:
                                found.append(short_name)
                            else:
                                found.append(clean_path)
                        else:
                            found.append(clean_path)
                            
                    return found
            except Exception as e:
                logger.error(f"Error fetching REST index: {str(e)}")
            return []

        # We still fetch types and taxonomies as they give us 'rest_base' explicitly
        # which is more reliable for core types.
        async def fetch_types():
            try:
                url = f"{self._api_url}/wp-json/wp/v2/types"
                resp = await self._client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return [t["rest_base"] for t in data.values() if t.get("rest_base")]
            except Exception: pass
            return []

        async def fetch_taxonomies():
            try:
                url = f"{self._api_url}/wp-json/wp/v2/taxonomies"
                resp = await self._client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return [t["rest_base"] for t in data.values() if t.get("rest_base")]
            except Exception: pass
            return []

        # Run all discovery in parallel
        results = await asyncio.gather(fetch_types(), fetch_taxonomies(), fetch_index())
        
        # Merge and de-duplicate
        all_resources = set()
        for res_list in results:
            for res in res_list:
                if res and res != "types" and res != "taxonomies":
                    all_resources.add(res)
        
        # Sort reasonably: core resources first, then alphabetical
        core = {"posts", "pages", "media", "comments", "users", "categories", "tags"}
        sorted_res = sorted(list(all_resources), key=lambda x: (x not in core, "/" in x, x))
        
        return sorted_res

    async def get_schema(self, table: str) -> Dict[str, Any]:
        """
        Get schema for a post type.
        
        Uses a hybrid approach with parallel requests:
        1. Fetch OPTIONS for standard schema definitions
        2. Fetch a sample record to discover dynamic/meta fields (like _case27_listing_type)
        3. Merge both for a complete schema
        """
        import asyncio
        url = self._get_resource_url(table)
        headers = self._get_headers()
        
        # Storage for all discovered properties
        options_properties = {}
        record_properties = {}
        
        async def fetch_options():
            try:
                response = await self._client.request("OPTIONS", url, headers=headers)
                if response.status_code == 200:
                    res_json = response.json()
                    schema = res_json.get("schema", {})
                    return schema.get("properties", {})
            except Exception:
                pass
            return {}
        
        async def fetch_sample_record():
            try:
                response = await self._client.get(f"{url}?per_page=1&context=view", headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                        return data[0]
            except Exception:
                pass
            return {}
        
        # Fetch both in parallel
        results = await asyncio.gather(fetch_options(), fetch_sample_record())
        options_properties = results[0] if isinstance(results[0], dict) else {}
        record_properties = results[1] if isinstance(results[1], dict) else {}
        
        columns = []
        seen_names = set()
        
        def add_property(name: str, prop: Any, prefix: str = "", from_schema: bool = False):
            full_name = f"{prefix}{name}"
            if full_name in seen_names:
                return
            seen_names.add(full_name)
            
            prop_type = "string"
            
            if from_schema and isinstance(prop, dict):
                # Property definition from JSON Schema (OPTIONS)
                raw_type = prop.get("type", "string")
                if isinstance(raw_type, list):
                    types = [t for t in raw_type if t != "null"]
                    prop_type = types[0] if types else "string"
                else:
                    prop_type = raw_type
                
                if prop_type == "object" and "properties" in prop:
                    sub_props = prop["properties"]
                    if isinstance(sub_props, dict):
                        for sub_name, sub_prop in sub_props.items():
                            add_property(sub_name, sub_prop, f"{full_name}.", from_schema=True)
                    return
            else:
                # Infer type from actual value
                if prop is None:
                    prop_type = "string"
                elif isinstance(prop, bool):
                    prop_type = "boolean"
                elif isinstance(prop, int):
                    prop_type = "integer"
                elif isinstance(prop, float):
                    prop_type = "number"
                elif isinstance(prop, dict):
                    prop_type = "object"
                    # Recurse into dict for nested fields
                    for sub_name, sub_val in prop.items():
                        add_property(sub_name, sub_val, f"{full_name}.")
                    return  # Don't add the parent object as a column
                elif isinstance(prop, list):
                    prop_type = "array"
                else:
                    prop_type = "string"
            
            columns.append({
                "name": full_name,
                "type": prop_type,
                "nullable": True,
                "primary_key": full_name == "id",
            })

        # 3. First add OPTIONS schema properties (structured definitions)
        if isinstance(options_properties, dict):
            for name, prop in options_properties.items():
                add_property(name, prop, from_schema=True)
        
        # 4. Then add record-based properties (captures meta fields)
        if isinstance(record_properties, dict):
            for name, value in record_properties.items():
                add_property(name, value, from_schema=False)
            
        return {"columns": columns}

    async def read_records(
        self,
        table: str,
        columns: Optional[List[str]] = None,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        limit: int = 100,
        offset: int = 0,
        order_by: Optional[str] = None,
        order_direction: Optional[str] = "asc",
        use_cache: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Read records via REST API with sorting support.
        
        For no-filter or simple-filter cases, uses a single fast request.
        For complex meta-field filters, scans pages sequentially until limit is met.
        Cached for 60 seconds to improve UI performance.
        """
        from app.services.sync.redis_client import cache_get, cache_set
        import hashlib
        import json
        
        # Generate cache key
        cache_key = None
        if use_cache:
            # Create deterministic string for complex args
            where_str = json.dumps(where, sort_keys=True, default=str) if where else ""
            cols_str = json.dumps(columns, sort_keys=True) if columns else ""
            order_str = f"{order_by}:{order_direction}" if order_by else ""
            key_base = f"{self._api_url}:{table}:{limit}:{offset}:{where_str}:{cols_str}:{order_str}"
            key_hash = hashlib.md5(key_base.encode()).hexdigest()
            cache_key = f"wp:data:{key_hash}"
            
            cached_data = await cache_get(None, cache_key)
            if cached_data is not None:
                return cached_data

        url = self._get_resource_url(table)
        
        # Prepare base parameters
        params = {
            "per_page": min(limit, 100),  # WP max is 100
            "page": (offset // 100) + 1,
            "context": "view",  # Use view context for faster responses
        }
        
        # Add sorting if requested (WordPress REST API sorting)
        if order_by:
            params["orderby"] = order_by
            params["order"] = "desc" if order_direction and order_direction.lower() == "desc" else "asc"
        
        # Parse filter list
        filter_list = []
        has_meta_filter = False
        
        if where:
            filter_list = where if isinstance(where, list) else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
            for f in filter_list:
                k, v, op = f.get("field"), f.get("value"), f.get("operator", "==")
                # Ensure values are strings for simple filters
                if not k or v is None:
                    continue
                key = k.lower()
                # Standard WP REST filters
                if key == "id":
                    params["include"] = v
                elif key in ["slug", "author", "categories", "tags", "status"]:
                    params[key] = v
                elif op == "contains" or key == "search":
                    params["search"] = v
                else:
                    # Meta field or custom filter - requires client-side filtering
                    has_meta_filter = True
        
        final_records = []
        
        # FAST PATH: No complex filter, just fetch directly
        if not has_meta_filter:
            batch, headers = await self._fetch_page(url, params)
            records = batch[:limit]
            if columns:
                records = [{k: r.get(k) for k in columns if k in r} for r in records]
            final_records = records
        else:
            # SLOW PATH: Meta filter requires scanning and client-side filtering
            all_matched = []
            current_page = 1
            max_pages = 5  # Limit to 500 records scan for reasonable response time
            
            while len(all_matched) < limit and current_page <= max_pages:
                params["page"] = current_page
                params["per_page"] = 100
                
                batch, headers = await self._fetch_page(url, params)
                if not batch:
                    break
                
                # Client-side filtering
                for record in batch:
                    if self._matches_filter(record, filter_list):
                        all_matched.append(record)
                        if len(all_matched) >= limit:
                            break
                
                current_page += 1
            
            records = all_matched[:limit]
            if columns:
                records = [{k: r.get(k) for k in columns if k in r} for r in records]
            final_records = records

        # Cache result
        if use_cache and cache_key:
            # Dynamic TTL
            from app.services.sync.redis_client import get_configured_redis_settings
            settings = await get_configured_redis_settings()
            ttl = settings["ttl_data"] if settings else 60
            
            await cache_set(None, cache_key, final_records, ttl=ttl)
            
        return final_records
    
    def _matches_filter(self, record: Dict[str, Any], filter_list: List[Dict[str, Any]]) -> bool:
        """Check if a record matches all filters."""
        for f in filter_list:
            field, target_val, op = f.get("field"), f.get("value"), f.get("operator", "==")
            
            # Skip if field is missing.
            # Skip if target_val is missing UNLESS it's an empty check operator.
            if not field or (target_val is None or target_val == "") and op not in ["is_empty", "is_not_empty"]:
                continue
            
            # Get nested field value using dot notation
            actual_val = record
            for part in field.split('.'):
                if isinstance(actual_val, dict):
                    actual_val = actual_val.get(part)
                else:
                    actual_val = None
                    break
            
            actual_str = str(actual_val or "").lower()
            target_str = str(target_val).lower()
            
            if op == "==" and actual_str != target_str:
                return False
            elif op == "!=" and actual_str == target_str:
                return False
            elif op == "contains" and target_str not in actual_str:
                return False
            elif op == "starts_with" and not actual_str.startswith(target_str):
                return False
            elif op == "ends_with" and not actual_str.endswith(target_str):
                return False
            elif op == "is_empty":
                if actual_val is not None and str(actual_val) != "":
                    return False
            elif op == "is_not_empty":
                if actual_val is None or str(actual_val) == "":
                    return False
            elif op == "in":
                vals = [x.strip().lower() for x in str(target_val).split(",") if x.strip()]
                if actual_str not in vals:
                    return False
            elif op == "not_in":
                vals = [x.strip().lower() for x in str(target_val).split(",") if x.strip()]
                if actual_str in vals:
                    return False
            elif op in [">", "<"]:
                try:
                    if op == ">":
                        if not (float(actual_val) > float(target_val)):
                            return False
                    else:
                        if not (float(actual_val) < float(target_val)):
                            return False
                except (ValueError, TypeError, AttributeError):
                    return False
        
        return True

    async def read_record_by_key(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> Optional[Dict[str, Any]]:
        """Read a single record by ID."""
        if key_column != "id":
            # WP REST API primarily uses ID for lookups
            records = await self.read_records(table, where={key_column: key_value}, limit=1)
            return records[0] if records else None
            
        if not self._client:
            await self.connect()
            
        url = f"{self._get_resource_url(table)}/{key_value}?context=edit"
        response = await self._client.get(url, headers=self._get_headers())
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()

    async def upsert_record(
        self,
        table: str,
        record: Dict[str, Any],
        key_column: str,
    ) -> Dict[str, Any]:
        """Update or Create a record."""
        # Clear cache for this table
        from app.services.sync.redis_client import cache_delete_pattern
        import asyncio
        await cache_delete_pattern(None, f"wp:data:*{table}*")
        await cache_delete_pattern(None, f"wp:count:*{table}*")
        
        if not self._client:
            await self.connect()
            
        key_value = record.get(key_column)
        rest_base_url = self._get_resource_url(table)
        
        headers = self._get_headers()
        if key_value:
            # Try to update
            url = f"{rest_base_url}/{key_value}"
            response = await self._client.post(url, json=record, headers=headers)
            if response.status_code == 404:
                # Fallback to create if not found?
                response = await self._client.post(rest_base_url, json=record, headers=headers)
        else:
            # Create
            response = await self._client.post(rest_base_url, json=record, headers=headers)
            
        response.raise_for_status()
        return response.json()

    async def delete_record(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> bool:
        """Delete a record."""
        # Clear cache for this table
        from app.services.sync.redis_client import cache_delete_pattern
        await cache_delete_pattern(None, f"wp:data:*{table}*")
        await cache_delete_pattern(None, f"wp:count:*{table}*")

        if not self._client:
            await self.connect()
            
        if key_column != "id":
            return False # Security/API limitation
            
        url = f"{self._get_resource_url(table)}/{key_value}"
        response = await self._client.delete(url, params={"force": "true"}, headers=self._get_headers())
        return response.status_code == 200

    async def count_records(
        self,
        table: str,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        use_cache: bool = True,
    ) -> int:
        """
        Get total count of records matching filters.
        
        For simple/no filters, returns X-WP-Total header directly (fast).
        For meta filters, estimates count based on match rate in first page.
        Cached for 5 minutes.
        """
        from app.services.sync.redis_client import cache_get, cache_set
        import hashlib
        import json

        # Generate cache key
        cache_key = None
        if use_cache:
            where_str = json.dumps(where, sort_keys=True, default=str) if where else ""
            key_base = f"{self._api_url}:{table}:count:{where_str}"
            key_hash = hashlib.md5(key_base.encode()).hexdigest()
            cache_key = f"wp:count:{key_hash}"
            
            cached_count = await cache_get(None, cache_key)
            if cached_count is not None:
                return int(cached_count)

        url = self._get_resource_url(table)
        params = {"per_page": 100, "context": "view"}
        
        # Parse filters
        filter_list = []
        has_meta_filter = False
        
        if where:
            filter_list = where if isinstance(where, list) else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
            for f in filter_list:
                k, v, op = f.get("field"), f.get("value"), f.get("operator", "==")
                if not k or v is None:
                    continue
                key = k.lower()
                # Standard WP REST filters
                if key == "id":
                    params["include"] = v
                elif key in ["slug", "author", "categories", "tags", "status"]:
                    params[key] = v
                elif op == "contains" or key == "search":
                    params["search"] = v
                else:
                    has_meta_filter = True
                
        # Fetch first page to get headers
        batch, headers = await self._fetch_page(url, params)
        server_total = int(headers.get("X-WP-Total", headers.get("x-wp-total", 0)))
        
        final_count = 0
        
        # FAST PATH: No meta filter, trust server total
        if not has_meta_filter:
            final_count = server_total
        else:
            # SLOW PATH: Meta filter requires estimation
            if not batch:
                final_count = 0
            else:
                matches = sum(1 for r in batch if self._matches_filter(r, filter_list))
                
                # If all records match or few total, just return match count
                if len(batch) < 100 or matches == len(batch):
                    final_count = matches
                else:
                    # Estimate: (matches / batch_size) * server_total
                    match_rate = matches / len(batch)
                    estimated_total = int(server_total * match_rate)
                    final_count = max(matches, estimated_total)
        
        # Cache result
        if use_cache and cache_key:
            # Dynamic TTL
            from app.services.sync.redis_client import get_configured_redis_settings
            settings = await get_configured_redis_settings()
            ttl = settings["ttl_count"] if settings else 300  # Default 5 minutes
            
            await cache_set(None, cache_key, final_count, ttl=ttl)
            
        return final_count
    async def search_records(
        self,
        table: str,
        query: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Search across records using WordPress's built-in search."""
        # WordPress REST API has native search support
        records = await self.read_records(
            table,
            where=[{"field": "search", "operator": "contains", "value": query}],
            limit=limit
        )
        return records

    async def count_search_matches(self, table: str, query: str) -> int:
        """Count matches using WordPress's search support."""
        return await self.count_records(
            table,
            where=[{"field": "search", "operator": "contains", "value": query}]
        )


class WordPressGraphQLAdapter(WordPressBaseApiAdapter):
    """WordPress WPGraphQL adapter."""

    async def get_tables(self) -> List[str]:
        """Discover post types via GraphQL contentTypes query."""
        if not self._client:
            await self.connect()
            
        query = """
        query GetContentTypes {
          contentTypes {
            nodes {
              graphqlPluralName
            }
          }
        }
        """
        response = await self._client.post(f"{self._api_url}/graphql", json={"query": query}, headers=self._get_headers())
        response.raise_for_status()
        data = response.json()
        
        types = data.get("data", {}).get("contentTypes", {}).get("nodes", [])
        return [t["graphqlPluralName"] for t in types if t.get("graphqlPluralName")]

    async def get_schema(self, table: str) -> Dict[str, Any]:
        """Get schema via GraphQL introspection."""
        # For MVP, we'll return a basic set of fields or introspect the type
        return {"columns": [
            {"name": "id", "type": "string", "nullable": False, "primary_key": True},
            {"name": "title", "type": "string", "nullable": True, "primary_key": False},
            {"name": "content", "type": "string", "nullable": True, "primary_key": False},
            {"name": "date", "type": "string", "nullable": True, "primary_key": False},
        ]}

    async def read_records(
        self,
        table: str,
        columns: Optional[List[str]] = None,
        where: Optional[Dict[str, Any]] = None,
        limit: int = 100,
        offset: int = 0,
        order_by: Optional[str] = None,
        order_direction: Optional[str] = "asc",
    ) -> List[Dict[str, Any]]:
        """Read records via GraphQL with sorting support."""
        if not self._client:
            await self.connect()
            
        cols = " ".join(columns) if columns else "id title content date"
        
        # Build order clause for GraphQL
        order_clause = ""
        if order_by:
            direction = "DESC" if order_direction and order_direction.lower() == "desc" else "ASC"
            order_clause = f', where: {{orderby: {{field: "{order_by.upper()}", order: {direction}}}}}'
        
        query = f"""
        query GetRecords {{
          {table}(first: {limit}{order_clause}) {{
            nodes {{
              {cols}
            }}
          }}
        }}
        """
        response = await self._client.post(f"{self._api_url}/graphql", json={"query": query}, headers=self._get_headers())
        response.raise_for_status()
        data = response.json()
        
        records = data.get("data", {}).get(table, {}).get("nodes", [])
        return records

    async def read_record_by_key(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> Optional[Dict[str, Any]]:
        # Map to specific node query
        return None # TODO: Implement

    async def upsert_record(
        self,
        table: str,
        record: Dict[str, Any],
        key_column: str,
    ) -> Dict[str, Any]:
        return record # GraphQL mutations are very specific

    async def delete_record(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> bool:
        return False

    async def count_records(
        self,
        table: str,
        where: Optional[Dict[str, Any]] = None,
    ) -> int:
        return 0 # GraphQL requires a specific plugin for total counts usually
    
    async def search_records(
        self,
        table: str,
        query: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Search via GraphQL - not fully implemented yet."""
        return []  # TODO: Implement GraphQL search

    async def count_search_matches(self, table: str, query: str) -> int:
        """Count via GraphQL - not implemented yet."""
        return 0
