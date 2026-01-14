"""
Data request computation service.

Computes pre-computed HTTP request specs for data bindings at PUBLISH TIME,
so the Edge Engine doesn't need database adapter logic.
"""

import sqlite3
import json
import os
from typing import Optional, Dict, List, Any


def get_unified_db_path() -> str:
    """Get path to unified.db in fastapi-backend directory."""
    # This file is in app/services/data_request.py
    # unified.db is in fastapi-backend/unified.db
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
        'unified.db'
    )


def get_table_foreign_keys(datasource_id: str, table_name: str) -> list:
    """Lookup FK relationships from SQLite table_schema_cache (direct sqlite3)"""
    db_path = get_unified_db_path()
    
    try:
        conn = sqlite3.connect(db_path)
        
        # If datasource_id provided, use it. Otherwise, query by table_name only
        if datasource_id:
            cursor = conn.execute(
                "SELECT foreign_keys FROM table_schema_cache WHERE datasource_id = ? AND table_name = ? LIMIT 1",
                (datasource_id, table_name)
            )
        else:
            # Fallback: query by table_name only, get first non-empty FK result
            cursor = conn.execute(
                "SELECT foreign_keys FROM table_schema_cache WHERE table_name = ? AND foreign_keys != '[]' ORDER BY LENGTH(foreign_keys) DESC LIMIT 1",
                (table_name,)
            )
        
        row = cursor.fetchone()
        conn.close()
        
        if row and row[0]:
            fks = json.loads(row[0])
            if fks:
                print(f"[FK Lookup] Found {len(fks)} FKs for {table_name}")
                return fks
    except Exception as e:
        print(f"[FK Lookup] Error looking up FKs for {table_name}: {e}")
    
    return []


def get_table_columns(datasource_id: str, table_name: str) -> list:
    """Lookup columns from SQLite table_schema_cache"""
    db_path = get_unified_db_path()
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.execute(
            "SELECT columns FROM table_schema_cache WHERE datasource_id = ? AND table_name = ? LIMIT 1",
            (datasource_id, table_name)
        )
        row = cursor.fetchone()
        conn.close()
        
        if row and row[0]:
            cols = json.loads(row[0])
            if cols:
                return cols
    except Exception as e:
        print(f"[Column Lookup] Error looking up columns for {table_name}: {e}")
    
    return []


def compute_data_request(binding: dict, datasource) -> Optional[dict]:
    """
    Compute a pre-computed HTTP request spec for a data binding.
    This runs at PUBLISH TIME so Edge doesn't need adapter logic.
    Returns a dict compatible with DataRequest schema.
    """
    ds_type = datasource.type if hasattr(datasource, 'type') else datasource.get('type', 'supabase')
    
    # Convert enum to string if needed
    if hasattr(ds_type, 'value'):
        ds_type = ds_type.value
    
    if ds_type == 'supabase':
        return _compute_supabase_request(binding, datasource)
    elif ds_type in ('neon', 'planetscale', 'turso', 'postgres', 'mysql'):
        return _compute_sql_request(binding, datasource, ds_type)
    else:
        print(f"[compute_data_request] Unknown datasource type: {ds_type}")
        return None


def _compute_supabase_request(binding: dict, datasource) -> Optional[dict]:
    """Build RPC-based query config for DataTable (uses frontbase_get_rows)"""
    table_name = binding.get('tableName') or binding.get('table_name')
    if not table_name:
        return None
    
    # Get columns from columnOrder (builder uses columnOrder)
    column_order = binding.get('columns') or binding.get('columnOrder')
    
    # Get datasource ID for lookup
    if hasattr(datasource, 'id'):
        ds_id = datasource.id
    else:
        ds_id = datasource.get('id', '')

    # If no columns specified (or '*'), resolve all columns from schema
    if not column_order or column_order == ['*']:
        print(f"[_compute_supabase_request] Resolving all columns for {table_name}")
        schema_cols = get_table_columns(ds_id, table_name)
        if schema_cols:
            # Schema columns are usually list of dicts {name: "...", type: "..."}
            # Extract just the names
            column_order = [c.get('name') for c in schema_cols if c.get('name')]
            
            # CRITICAL: Update binding so frontend gets the explicit list!
            binding['columns'] = column_order
            binding['columnOrder'] = column_order
        else:
            column_order = ['*']  # Fallback
    
    datasource_id = datasource.id if hasattr(datasource, 'id') else datasource.get('id', '')
    
    # Lookup FK relationships from SQLite table_schema_cache
    foreign_keys = get_table_foreign_keys(datasource_id, table_name) if datasource_id else []
    
    # Build relations from FK data
    # SQLite stores FKs as: {constrained_columns: [col], referred_table: tbl, referred_columns: [col]}
    relations = {}
    for fk in foreign_keys:
        ref_table = fk.get('referred_table') or fk.get('referencedTable')
        constrained = fk.get('constrained_columns') or []
        referred = fk.get('referred_columns') or []
        col = constrained[0] if constrained else fk.get('column')
        ref_col = referred[0] if referred else 'id'
        if ref_table and col:
            relations[ref_table] = {'column': col, 'referencedColumn': ref_col}
    
    # Log relations found
    if relations:
        print(f"[Supabase Request] Relations for {table_name}: {relations}")
    
    # Build SQL columns string with proper quoting for case sensitivity
    # PostgreSQL: unquoted identifiers fold to lowercase, quoted preserve case
    sql_columns = []
    base_cols_added = False
    for col in column_order:
        if '.' in col:
            # Related column: countries.flag -> "countries"."flag" AS "countries.flag"
            # Quote both parts to preserve case (e.g., "Status" vs "status")
            parts = col.split('.')
            if len(parts) == 2:
                quoted_col = f'"{parts[0]}"."{parts[1]}" AS "{col}"'
                sql_columns.append(quoted_col)
            else:
                # Fallback for unusual cases
                sql_columns.append(f'{col} AS "{col}"')
        elif str(col) != '*':
            # Explicit base column - quote to preserve case
            sql_columns.append(f'"{table_name}"."{col}"')
        elif not base_cols_added:
            # First base column - add table.* shorthand
            sql_columns.append(f'"{table_name}".*')
            base_cols_added = True
    
    if not sql_columns:
        sql_columns = [f'{table_name}.*']
    
    columns_str = ', '.join(sql_columns)
    
    # Build joins array for RPC with quoted identifiers
    joins = []
    for rel_table, rel_info in relations.items():
        joins.append({
            'type': 'left',
            'table': rel_table,
            'on': f'"{table_name}"."{rel_info["column"]}" = "{rel_table}"."{rel_info["referencedColumn"]}"'
        })
    
    # Get settings
    ds_url = datasource.url if hasattr(datasource, 'url') else datasource.get('url', '')
    anon_key = datasource.anonKey if hasattr(datasource, 'anonKey') else datasource.get('anonKey', '')
    pagination = binding.get('pagination', {})
    sorting = binding.get('sorting', {})
    
    page_size = pagination.get('pageSize', 20) if pagination.get('enabled', True) else 1000
    sort_col = sorting.get('column') if sorting.get('enabled') else None
    sort_dir = sorting.get('direction', 'asc')
    
    # Build initial RPC URL for SSR (page 1)
    rpc_url = f"{ds_url}/rest/v1/rpc/frontbase_get_rows"
    
    # --- Filter Options Request Generation ---
    frontend_filters = binding.get('frontendFilters', [])
    for filter_item in frontend_filters:
        f_type = filter_item.get('filterType')
        f_col = filter_item.get('column')
        
        # Only generate options request for dropdown/multiselect
        if f_type in ('dropdown', 'multiselect') and f_col:
            # Determine target table and column for distinct query
            target_table = table_name
            target_col = f_col
            
            # Use dedicated RPC for distinct values
            distinct_rpc_url = f"{ds_url}/rest/v1/rpc/frontbase_get_distinct_values"
            
            distinct_body = {
                "target_table": target_table,
                "target_col": target_col
            }
            
            # Handle related columns (e.g. countries.country)
            if '.' in f_col:
                parts = f_col.split('.')
                target_table = parts[0]
                target_col = parts[1]
                distinct_body['target_table'] = target_table
                distinct_body['target_col'] = target_col
            
            # Attach the pre-computed request to the filter config
            filter_item['optionsDataRequest'] = {
                'url': distinct_rpc_url,
                'method': 'POST',
                'headers': {
                    'apikey': anon_key or '{{SUPABASE_ANON_KEY}}',
                    'Authorization': f"Bearer {anon_key}" if anon_key else 'Bearer {{SUPABASE_ANON_KEY}}',
                    'Content-Type': 'application/json'
                },
                'body': distinct_body,
                'resultPath': ''
            }

    return {
        'url': rpc_url,
        'method': 'POST',  # RPC uses POST
        'headers': {
            'apikey': anon_key or '{{SUPABASE_ANON_KEY}}',
            'Authorization': f"Bearer {anon_key}" if anon_key else 'Bearer {{SUPABASE_ANON_KEY}}',
            'Content-Type': 'application/json'
        },
        'body': {
            'table_name': table_name,
            'columns': columns_str,
            'joins': joins,
            'sort_col': sort_col,
            'sort_dir': sort_dir,
            'page': 1,
            'page_size': page_size,
            'filters': []
        },
        'resultPath': 'rows',  # RPC returns {rows: [...], total: N}
        'flattenRelations': False,  # Data is already flat from JOINs
        # RPC config for client-side pagination/sorting/searching
        'queryConfig': {
            'useRpc': True,
            'rpcUrl': rpc_url,
            'tableName': table_name,
            'columns': columns_str,
            'joins': joins,
            'pageSize': page_size,
            'sortColumn': sort_col,
            'sortDirection': sort_dir,
            'searchColumns': binding.get('searchColumns', []),
            'frontendFilters': frontend_filters
        }
    }


def _compute_sql_request(binding: dict, datasource, ds_type: str) -> Optional[dict]:
    """Build SQL query with JOINs for SQL databases (Neon, PlanetScale, Turso)"""
    table_name = binding.get('tableName') or binding.get('table_name')
    if not table_name:
        return None
    
    # Build JOIN clauses from foreign keys
    foreign_keys = binding.get('foreignKeys') or binding.get('foreign_keys') or []
    joins = []
    
    for fk in foreign_keys:
        col = fk.get('column')
        ref_table = fk.get('referencedTable') or fk.get('referenced_table')
        ref_col = fk.get('referencedColumn') or fk.get('referenced_column')
        if col and ref_table and ref_col:
            joins.append(f"LEFT JOIN {ref_table} ON {table_name}.{col} = {ref_table}.{ref_col}")
    
    # Build SQL query
    join_str = ' '.join(joins) if joins else ''
    sql = f"SELECT {table_name}.* FROM {table_name} {join_str} LIMIT 100".strip()
    
    # Different URL/body format for each database type
    ds_url = datasource.url if hasattr(datasource, 'url') else datasource.get('url', '')
    
    if ds_type == 'neon':
        return {
            'url': '{{NEON_HTTP_URL}}/sql',
            'method': 'POST',
            'headers': {
                'Authorization': 'Bearer {{NEON_API_KEY}}',
                'Content-Type': 'application/json'
            },
            'body': {'query': sql, 'params': []},
            'resultPath': 'rows',
            'flattenRelations': False
        }
    elif ds_type == 'planetscale':
        return {
            'url': '{{PLANETSCALE_HTTP_URL}}/query',
            'method': 'POST',
            'headers': {
                'Authorization': '{{PLANETSCALE_AUTH}}',
                'Content-Type': 'application/json'
            },
            'body': {'query': sql},
            'resultPath': 'rows',
            'flattenRelations': False
        }
    elif ds_type == 'turso':
        return {
            'url': '{{TURSO_HTTP_URL}}/v2/pipeline',
            'method': 'POST',
            'headers': {
                'Authorization': 'Bearer {{TURSO_AUTH_TOKEN}}',
                'Content-Type': 'application/json'
            },
            'body': {'statements': [{'q': sql}]},
            'resultPath': 'results[0].rows',
            'flattenRelations': False
        }
    else:
        # Generic SQL - return None, not supported via HTTP yet
        return None
