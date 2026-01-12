from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Any, Dict
from ..database.utils import get_db, create_page, get_all_pages, update_page, get_page_by_slug, get_current_timestamp
from ..models.schemas import PageCreateRequest, PageUpdateRequest, PageResponse
from ..models.models import Page
from pydantic import BaseModel

router = APIRouter(prefix="/api/pages", tags=["pages"])

# Response wrapper to match Express format
class ApiResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    message: Optional[str] = None

# Helper to serialize Page to dict with camelCase
def serialize_page(page: Page) -> dict:
    """Convert Page model to dict matching Express format"""
    import json
    layout_data = page.layout_data
    if isinstance(layout_data, str):
        try:
            layout_data = json.loads(layout_data)
        except:
            layout_data = {"content": [], "root": {}}
    
    return {
        "id": page.id,
        "name": page.name,
        "slug": page.slug,
        "title": page.title,
        "description": page.description,
        "keywords": page.keywords,
        "isPublic": page.is_public,
        "isHomepage": page.is_homepage,
        "layoutData": layout_data or {"content": [], "root": {}},
        "createdAt": page.created_at,
        "updatedAt": page.updated_at,
        "deletedAt": page.deleted_at
    }


@router.get("/")
async def get_pages(includeDeleted: bool = False, db: Session = Depends(get_db)):
    """Get all pages - matches Express: { success, data: pages[] }"""
    try:
        if includeDeleted:
            pages = db.query(Page).all()
        else:
            pages = db.query(Page).filter(Page.deleted_at == None).all()
        
        return {
            "success": True,
            "data": [serialize_page(p) for p in pages]
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


# =============================================================================
# Public Page Endpoint for SSR (Sprint 3)
# =============================================================================

@router.get("/public/{slug}/")
async def get_public_page(slug: str, db: Session = Depends(get_db)):
    """
    Get a public page by slug for SSR.
    No authentication required - used by Hono Edge Engine.
    Returns page data if page exists and is public (or all for now during dev).
    """
    try:
        page = db.query(Page).filter(
            Page.slug == slug, 
            Page.deleted_at == None
        ).first()
        
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Page not found: {slug}"
            )
        
        # For production, you might want to check is_public:
        # if not page.is_public:
        #     raise HTTPException(
        #         status_code=status.HTTP_403_FORBIDDEN,
        #         detail="This page is private"
        #     )
        
        # Serialize page first
        page_data = serialize_page(page)
        
        # Load datasources and enrich components with dataRequest
        # This ensures optionsDataRequest is generated for filters
        datasources_list = get_datasources_for_publish(db)
        
        if datasources_list and page_data.get('layoutData'):
            layout = page_data['layoutData']
            
            # Convert components in 'content' array
            if 'content' in layout and isinstance(layout['content'], list):
                layout['content'] = [
                    convert_component(comp, datasources_list) 
                    for comp in layout['content']
                ]
            
            # Also handle legacy 'components' key if present
            if 'components' in layout and isinstance(layout['components'], list):
                layout['components'] = [
                    convert_component(comp, datasources_list)
                    for comp in layout['components']
                ]
        
        return {
            "success": True,
            "data": page_data
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


import httpx
import os
from datetime import datetime
from app.schemas.publish import (
    PublishPageRequest, ImportPagePayload, ImportPageResponse, 
    PublishResponse, PageLayout, PageComponent, ComponentBinding,
    SeoData, DatasourceConfig, DatasourceType as PublishDatasourceType,
    DataRequest  # NEW: For pre-computed HTTP request specs
)
from app.services.sync.models.datasource import Datasource, DatasourceType


def get_datasources_for_publish(db: Session) -> list:
    """Get all active datasources and convert to publish-safe format"""
    datasources = db.query(Datasource).filter(Datasource.is_active == True).all()
    
    result = []
    for ds in datasources:
        # Map sync DatasourceType to publish DatasourceType
        type_map = {
            DatasourceType.SUPABASE: PublishDatasourceType.SUPABASE,
            DatasourceType.POSTGRES: PublishDatasourceType.POSTGRES,
            DatasourceType.NEON: PublishDatasourceType.NEON,
            DatasourceType.MYSQL: PublishDatasourceType.MYSQL,
        }
        
        publish_type = type_map.get(ds.type, PublishDatasourceType.POSTGRES)
        
        config = DatasourceConfig(
            id=ds.id,
            type=publish_type,
            name=ds.name,
            url=ds.api_url or f"postgresql://{ds.host}:{ds.port}/{ds.database}",
            # For Supabase: include anon key (safe to expose)
            anonKey=ds.anon_key_encrypted,  # Decrypt in production
            # Store secret env var name for API key
            secretEnvVar=f"DS_{ds.name.upper().replace(' ', '_')}_API_KEY",
        )
        result.append(config)
    
    return result


# =============================================================================
# Data Request Computation (for unified HTTP-based data fetching)
# =============================================================================

def compute_data_request(
    binding: dict, 
    datasource: DatasourceConfig
) -> dict:
    """
    Compute a pre-computed HTTP request spec for a data binding.
    This runs at PUBLISH TIME so Hono doesn't need adapter logic.
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

def get_table_foreign_keys(datasource_id: str, table_name: str) -> list:
    """Lookup FK relationships from SQLite table_schema_cache (direct sqlite3)"""
    import sqlite3
    import json
    import os
    
    # Database path matches config default: unified.db in fastapi-backend directory
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'unified.db')
    
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
    import sqlite3
    import json
    import os
    
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'unified.db')
    
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
                # print(f"[Column Lookup] Found {len(cols)} columns for {table_name}")
                return cols
    except Exception as e:
        print(f"[Column Lookup] Error looking up columns for {table_name}: {e}")
    
    return []


def _compute_supabase_request(binding: dict, datasource) -> dict:
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
            column_order = ['*'] # Fallback
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


def _compute_sql_request(binding: dict, datasource, ds_type: str) -> dict:
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


def convert_component(c: dict, datasources_list: list = None) -> dict:
    """
    Convert a component dict for publishing (REFACTORED).
    
    Pure function that:
    1. Normalizes binding location
    2. Maps stylesData → styles  
    3. Enriches binding with dataRequest (preserves frontendFilters!)
    4. Processes children recursively
    
    Returns new component dict.
    """
    from app.routers.pages.transforms import (
        normalize_binding_location,
        map_styles_schema,
        process_component_children,
        find_datasource
    )
    from app.routers.pages.enrichment import enrich_binding_with_data_request, remove_nulls
    
    datasources = datasources_list or []
    
    # Step 1: Normalize binding location (props.binding → binding)
    result = normalize_binding_location(c)
    
    # Step 2: Map schema (stylesData → styles)
    result = map_styles_schema(result)
    
    # Step 3: Enrich binding with dataRequest
    if 'binding' in result and datasources:
        binding = result['binding']
        ds_id = binding.get('datasourceId') or binding.get('datasource_id')
        datasource = find_datasource(datasources, ds_id)
        
        if datasource:
            # CRITICAL: This preserves frontendFilters with optionsDataRequest
            result['binding'] = enrich_binding_with_data_request(
                binding,
                datasource,
                compute_data_request,  # Pass as function
                component_id=result.get('id')  # Add componentId for Pydantic validation
            )
            
            print(f"[convert_component] Enriched {result.get('type', 'component')} binding")
            if 'frontendFilters' in result['binding']:
                print(f"  → Preserved {len(result['binding']['frontendFilters'])} filters")

            # MAP columns -> columnOrder because React DataTable expects columnOrder
            if 'columns' in result['binding'] and result['binding']['columns']:
                result['binding']['columnOrder'] = result['binding']['columns']
    
    # Step 4: Process children recursively
    result = process_component_children(
        result,
        lambda child: convert_component(child, datasources)
    )
    
    # Step 5: Remove all null values from component (Zod .optional() rejects null)
    result = remove_nulls(result)
    
    return result


def convert_to_publish_schema(page: Page, db: Session) -> PublishPageRequest:
    """Convert Page model to PublishPageRequest schema"""
    import json
    
    # Parse layout_data
    layout_data = page.layout_data
    if isinstance(layout_data, str):
        try:
            layout_data = json.loads(layout_data)
        except:
            layout_data = {"content": [], "root": {}}
    
    # Get datasources FIRST so we can compute dataRequest during component conversion
    datasources = get_datasources_for_publish(db)
    
    # Convert components with stylesData → styles mapping AND compute dataRequest
    raw_content = layout_data.get("content", [])
    converted_content = [convert_component(c, datasources) for c in raw_content]
    
    # Build PageLayout
    page_layout = PageLayout(
        content=[PageComponent(**c) for c in converted_content],
        root=layout_data.get("root", {})
    )
    
    # Parse SEO data if exists
    seo_data = None
    if hasattr(page, 'seo_data') and page.seo_data:
        seo_raw = page.seo_data
        if isinstance(seo_raw, str):
            try:
                seo_raw = json.loads(seo_raw)
            except:
                seo_raw = {}
        seo_data = SeoData(**seo_raw) if seo_raw else None
    
    return PublishPageRequest(
        id=page.id,
        slug=page.slug,
        name=page.name,
        title=page.title,
        description=page.description,
        layoutData=page_layout,
        seoData=seo_data,
        datasources=datasources if datasources else None,
        version=1,  # TODO: Increment on re-publish
        publishedAt=datetime.utcnow().isoformat() + "Z",
        isPublic=page.is_public,
        isHomepage=page.is_homepage,
    )


@router.post("/{page_id}/publish/")
async def publish_page(page_id: str, db: Session = Depends(get_db)):
    """
    Publish a page to Hono Edge Engine.
    Gathers page data and sends to Hono /api/import endpoint.
    """
    try:
        # Get the page
        page = db.query(Page).filter(
            Page.id == page_id,
            Page.deleted_at == None
        ).first()
        
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Page not found: {page_id}"
            )
        
        # Convert to publish schema (includes datasources from DB)
        publish_data = convert_to_publish_schema(page, db)
        
        # DEBUG: Trace Payload Keys
        # try:
        #      with open("debug_publish_trace.log", "w") as f:
        #          if publish_data.layout_data.content:
        #              binding = publish_data.layout_data.content[0].binding
        #              # Handle if binding is a Pydantic model or dict
        #              if hasattr(binding, 'model_dump'):
        #                  b_dict = binding.model_dump()
        #              elif hasattr(binding, '__dict__'):
        #                  b_dict = binding.__dict__
        #              else:
        #                  b_dict = binding
        #                  
        #              f.write(f"Binding Keys: {b_dict.keys()}\n")
        #              f.write(f"TableName: {b_dict.get('tableName')}\n")
        #              f.write(f"Columns: {b_dict.get('columns')}\n")
        #              f.write(f"ColumnOrder: {b_dict.get('columnOrder')}\n")
        #          else:
        #              f.write("No content in layoutData\n")
        # except Exception as e:
        #      with open("debug_publish_trace.log", "a") as f:
        #          f.write(f"Error tracing payload: {e}\n")

        # Build payload for Hono
        payload = ImportPagePayload(
            page=publish_data,
            force=True  # Always overwrite on publish
        )
        
        # Get Hono URL from environment
        hono_url = os.getenv("HONO_URL", "http://localhost:3002")
        import_url = f"{hono_url}/api/import"
        
        # Send to Hono
        async with httpx.AsyncClient() as client:
            response = await client.post(
                import_url,
                json=payload.model_dump(by_alias=True, exclude_none=True),
                headers={"Content-Type": "application/json"},
                timeout=10.0
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Update page to mark as public
                page.is_public = True
                db.commit()
                
                return {
                    "success": True,
                    "message": f"Page '{page.name}' published successfully",
                    "previewUrl": result.get("previewUrl"),
                    "version": result.get("version")
                }
            else:
                return {
                    "success": False,
                    "error": f"Hono import failed: {response.status_code}",
                    "details": response.text
                }
                
    except HTTPException:
        raise
    except httpx.ConnectError:
        return {
            "success": False,
            "error": "Cannot connect to Hono Edge Engine. Is it running?"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/{page_id}/")
async def get_page(page_id: str, db: Session = Depends(get_db)):
    """Get a page by ID - matches Express: { success, data: page }"""
    try:
        page = db.query(Page).filter(Page.id == page_id, Page.deleted_at == None).first()
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page not found"
            )
        
        return {
            "success": True,
            "data": serialize_page(page)
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/", status_code=201)
async def create_page_endpoint(request: PageCreateRequest, db: Session = Depends(get_db)):
    """Create a new page - matches Express: { success, data: page }"""
    try:
        # Check if slug is already taken
        existing_page = get_page_by_slug(db, request.slug)
        if existing_page:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A page with this slug already exists"
            )
        
        # Use model_dump with by_alias=False to get snake_case field names
        page_data = request.model_dump(by_alias=False)
        page = create_page(db, page_data)
        
        return {
            "success": True,
            "data": serialize_page(page)
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.put("/{page_id}/")
async def update_page_endpoint(page_id: str, request: PageUpdateRequest, db: Session = Depends(get_db)):
    """Update a page - matches Express: { success, data: page }"""
    try:
        # Use model_dump with by_alias=False and exclude_unset=True
        page_data = request.model_dump(by_alias=False, exclude_unset=True)
        page = update_page(db, page_id, page_data)
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page not found"
            )
        
        return {
            "success": True,
            "data": serialize_page(page)
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.delete("/{page_id}/")
async def delete_page(page_id: str, db: Session = Depends(get_db)):
    """Soft delete a page - matches Express: { success, message }"""
    try:
        page = db.query(Page).filter(Page.id == page_id).first()
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page not found"
            )
        
        # Append timestamp to slug to allow reuse (matching Express)
        page.slug = f"{page.slug}-deleted-{int(__import__('time').time() * 1000)}"
        page.deleted_at = get_current_timestamp()
        db.commit()
        
        return {
            "success": True,
            "message": "Page moved to trash successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.put("/{page_id}/layout/")
async def update_page_layout(page_id: str, request: dict, db: Session = Depends(get_db)):
    """Update page layout - matches Express: { success, data: page }"""
    try:
        layout_data = request.get("layoutData")
        if not layout_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="layoutData is required"
            )
        
        page = update_page(db, page_id, {"layout_data": layout_data})
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page not found"
            )
        
        return {
            "success": True,
            "data": serialize_page(page)
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/{page_id}/restore/")
async def restore_page(page_id: str, db: Session = Depends(get_db)):
    """Restore a deleted page - matches Express: { success, data: page, message }"""
    try:
        page = db.query(Page).filter(Page.id == page_id).first()
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page not found"
            )
        
        # Try to restore original slug
        new_slug = page.slug
        if "-deleted-" in new_slug:
            new_slug = new_slug.split("-deleted-")[0]
        
        # Check if original slug is available
        existing = db.query(Page).filter(Page.slug == new_slug, Page.id != page_id, Page.deleted_at == None).first()
        if existing:
            new_slug = f"{new_slug}-restored-{int(__import__('time').time() * 1000)}"
        
        page.slug = new_slug
        page.deleted_at = None
        db.commit()
        db.refresh(page)
        
        return {
            "success": True,
            "data": serialize_page(page),
            "message": "Page restored successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.delete("/{page_id}/permanent/")
async def permanent_delete_page(page_id: str, db: Session = Depends(get_db)):
    """Permanently delete a page - matches Express: { success, message }"""
    try:
        page = db.query(Page).filter(Page.id == page_id).first()
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page not found"
            )
        
        db.delete(page)
        db.commit()
        
        return {
            "success": True,
            "message": "Page permanently deleted"
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }