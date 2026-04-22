"""
Publish Serializer — Converts Page models to publish-safe schemas.

Extracted from publish.py for single-responsibility compliance.
Contains: datasource fetching, component conversion, and schema assembly.

NOTE: Imports from app.routers.pages.transforms and app.routers.pages.enrichment
are done lazily (inside functions) to avoid a circular import:
  publish_serializer → pages.transforms → pages/__init__ → pages.publish → publish_serializer
"""

import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.schemas.publish import (
    PublishPageRequest, PageLayout, PageComponent,
    DatasourceConfig, DatasourceType as PublishDatasourceType, SeoData
)
from app.services.sync.models.datasource import Datasource, DatasourceType
from app.services.data_request import compute_data_request
from app.models.models import Page


def get_datasources_for_publish(db: Session) -> list:
    """Get all active datasources and convert to publish-safe format.
    
    Credentials are resolved from the Central Accounts Management
    (edge_providers_accounts) via the datasource's provider_account_id FK.
    
    Returns empty list if datasources table doesn't exist (db-sync not configured).
    """
    try:
        datasources = db.query(Datasource).filter(Datasource.is_active == True).all()
    except Exception:
        # datasources table may not exist if db-sync hasn't been set up
        db.rollback()
        return []

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
        
        # Resolve credentials from Central Accounts Management via provider_account_id
        url = ds.api_url or ''
        anon_key = ds.anon_key_encrypted or ''
        
        provider_account_id = ds.provider_account_id
        if provider_account_id:
            try:
                from app.core.credential_resolver import get_provider_context_by_id
                ctx = get_provider_context_by_id(db, provider_account_id)
                # Resolve URL: metadata.api_url is the canonical Supabase/Neon URL
                if not url:
                    url = ctx.get('api_url') or ctx.get('url') or ''
                # Resolve anon_key from decrypted credentials
                if not anon_key:
                    anon_key = ctx.get('anon_key') or ''
                print(f"[publish] Resolved datasource '{ds.name}' creds from Connected Account {provider_account_id[:8]}...")
            except Exception as e:
                print(f"[publish] Could not resolve creds for '{ds.name}' from account {provider_account_id}: {e}")
        
        # Build a usable URL: prefer resolved URL, fallback to host-based connection string
        if not url:
            if ds.host:
                url = f"postgresql://{ds.host}:{ds.port or 5432}/{ds.database or ''}"
            else:
                print(f"[publish] Skipping datasource '{ds.name}': no api_url, no provider_account_id, no host")
                continue

        config = DatasourceConfig(
            id=ds.id,
            type=publish_type,
            name=ds.name,
            url=url,
            anonKey=anon_key,
            secretEnvVar=f"DS_{ds.name.upper().replace(' ', '_')}_API_KEY",
        )
        result.append(config)
    
    return result


def convert_component(c: dict, datasources_list: list | None = None) -> dict:
    """
    Convert a component dict for publishing.
    
    Pure function that:
    1. Normalizes binding location
    2. Maps stylesData → styles  
    3. Enriches binding with dataRequest (preserves frontendFilters!)
    4. Processes children recursively
    
    Returns new component dict.
    """
    datasources = datasources_list or []

    # Lazy imports to avoid circular: publish_serializer → pages.transforms → pages/__init__ → pages.publish → publish_serializer
    from app.routers.pages.transforms import (
        normalize_binding_location, map_styles_schema,
        process_component_children, find_datasource,
    )
    from app.routers.pages.enrichment import enrich_binding_with_data_request, remove_nulls

    # Step 1: Normalize binding location (props.binding → binding)
    result = normalize_binding_location(c)
    
    # Step 2: Map schema (stylesData → styles)
    result = map_styles_schema(result)
    
    # Step 3: Enrich binding with dataRequest
    if 'binding' in result:
        binding = result['binding']
        # Handle all casing variations: datasourceId, datasource_id, dataSourceId
        ds_id = binding.get('datasourceId') or binding.get('datasource_id') or binding.get('dataSourceId')

        if datasources:
            datasource = find_datasource(datasources, ds_id)
            
            if datasource:
                # CRITICAL: This preserves frontendFilters with optionsDataRequest
                result['binding'] = enrich_binding_with_data_request(
                    binding,
                    datasource,
                    compute_data_request,  # Pass as function
                    component_id=str(result.get('id') or '')  # Add componentId for Pydantic validation
                )
                
                print(f"[convert_component] Enriched {result.get('type', 'component')} binding (has dataRequest={('dataRequest' in result['binding'])})")
                if 'frontendFilters' in result['binding']:
                    print(f"  - Preserved {len(result['binding']['frontendFilters'])} filters")

                # MAP columns -> columnOrder because React DataTable expects columnOrder
                if 'columns' in result['binding'] and result['binding']['columns']:
                    result['binding']['columnOrder'] = result['binding']['columns']

    # Step 3b+: Bake columnOrder into DataTable props (Zod-safe dual-path)
    comp_type = result.get('type', '')
    if comp_type == 'DataTable' and 'binding' in result:
        binding = result.get('binding', {})
        col_order = binding.get('columnOrder') or binding.get('columns')
        # Extract column names if they're column dicts [{name: "...", type: "..."}, ...]
        if col_order and isinstance(col_order, list):
            if col_order and isinstance(col_order[0], dict):
                col_order = [c.get('name') for c in col_order if c.get('name')]
            if 'props' not in result:
                result['props'] = {}
            result['props']['_columnOrder'] = col_order
            print(f"[convert_component] Baked {len(col_order)} columns into DataTable props._columnOrder (Zod-safe)")

    # Step 3b: Bake column schema into Form/InfoList bindings
    comp_type = result.get('type', '')
    if comp_type in ('Form', 'InfoList'):
        # Form/InfoList may store config as top-level props, not inside binding
        binding = result.get('binding', {})
        props = result.get('props', {})
        
        # Collect tableName and datasource ID — props first (fresh from builder),
        # then binding (may be stale from previous publish)
        table_name = (props.get('tableName') or props.get('table_name')
                      or result.get('tableName')
                      or binding.get('tableName') or binding.get('table_name'))
        ds_id = (props.get('dataSourceId') or props.get('datasourceId') 
                 or props.get('datasource_id')
                 or result.get('dataSourceId')
                 or binding.get('dataSourceId') or binding.get('datasourceId') 
                 or binding.get('datasource_id'))
        
        print(f"[convert_component] {comp_type} lookup: props.tableName={props.get('tableName')}, binding.tableName={binding.get('tableName')}, resolved={table_name}")
        
        if table_name and ds_id:
            from app.services.data_request import get_table_columns, get_table_foreign_keys
            columns = get_table_columns(ds_id, table_name)
            foreign_keys = get_table_foreign_keys(ds_id, table_name)
            
            # Ensure binding exists at root level
            if 'binding' not in result:
                result['binding'] = {}
            
            # Bake schema fields into the binding
            result['binding']['tableName'] = table_name
            result['binding']['dataSourceId'] = ds_id
            
            # Carry over fieldOverrides and fieldOrder from props → binding
            field_overrides = (binding.get('fieldOverrides') or props.get('fieldOverrides') or {})
            field_order = (binding.get('fieldOrder') or props.get('fieldOrder') or [])
            if field_overrides:
                result['binding']['fieldOverrides'] = field_overrides
            if field_order:
                result['binding']['fieldOrder'] = field_order
            
            if columns:
                result['binding']['columns'] = columns
                print(f"[convert_component] Baked {len(columns)} columns into {comp_type} binding for {table_name}")
            if foreign_keys:
                # Normalize FK format: get_table_foreign_keys returns
                # {constrained_columns: [...], referred_table, referred_columns: [...]}
                # Edge Zod expects {column, referencedTable, referencedColumn}
                normalized_fks = []
                for fk in foreign_keys:
                    if 'constrained_columns' in fk:
                        # Convert from SQLAlchemy format to edge format
                        for col, ref_col in zip(
                            fk.get('constrained_columns', []),
                            fk.get('referred_columns', [])
                        ):
                            normalized_fks.append({
                                'column': col,
                                'referencedTable': fk.get('referred_table', ''),
                                'referencedColumn': ref_col,
                            })
                    elif 'column' in fk:
                        # Already in edge format
                        normalized_fks.append(fk)
                    else:
                        normalized_fks.append(fk)
                
                foreign_keys = normalized_fks
                result['binding']['foreignKeys'] = foreign_keys
                print(f"[convert_component] Baked {len(foreign_keys)} FKs into {comp_type} binding for {table_name}")
            
            # ALSO bake into props (z.record passes through Zod without stripping)
            if 'props' not in result:
                result['props'] = {}
            result['props']['_columns'] = columns or []
            result['props']['_foreignKeys'] = foreign_keys or []
            result['props']['_tableName'] = table_name
            result['props']['_dataSourceId'] = ds_id
            result['props']['_fieldOverrides'] = field_overrides
            result['props']['_fieldOrder'] = field_order
            print(f"[convert_component] Also baked columns into {comp_type} props (Zod-safe)")

            # Step 3c: Compute dataRequest for Form/InfoList
            # Step 3 may have skipped this if the binding lacked tableName at that point
            if 'dataRequest' not in result.get('binding', {}):
                from app.routers.pages.transforms import find_datasource
                datasource = find_datasource(datasources, ds_id) if datasources else None
                if datasource:
                    data_req = compute_data_request(result['binding'], datasource)
                    if data_req:
                        result['binding']['dataRequest'] = data_req
                        print(f"[convert_component] Computed dataRequest for {comp_type} (strategy={data_req.get('fetchStrategy', 'unknown')})")
        else:
            print(f"[convert_component] {comp_type} has no tableName({table_name}) or dsId({ds_id}), skipping enrichment")

    # Step 4: Process children recursively
    result = process_component_children(
        result,
        lambda child: convert_component(child, datasources)
    )
    
    # Note: Icon pre-rendering is done in convert_to_publish_schema (async step)
    
    # Step 5: Remove all null values from component (Zod .optional() rejects null)
    result = remove_nulls(result)
    
    return result


async def convert_to_publish_schema(page: Page, datasources: list, tenant_slug: str = '_default') -> PublishPageRequest:
    """Convert Page model to PublishPageRequest schema.
    
    Args:
        page: Detached Page ORM object (must NOT require lazy loads).
        datasources: Pre-fetched datasource configs.
        tenant_slug: Pre-resolved tenant slug. Resolved by the caller
                     while the DB session is alive. Defaults to '_default'
                     for self-host / master admin.
    """
    # Lazy imports to avoid circular import
    from app.routers.pages.transforms import (
        collect_icons_from_component, fetch_icons_batch, inject_icon_svg,
    )

    # Parse layout_data
    layout_data = page.layout_data
    if isinstance(layout_data, str):
        try:
            layout_data = json.loads(layout_data)
        except:
            layout_data = {"content": [], "root": {}}
    
    # Convert components with stylesData → styles mapping AND compute dataRequest
    raw_content = layout_data.get("content", [])
    converted_content = [convert_component(c, datasources) for c in raw_content]
    
    # ==== ICON PRE-RENDERING ====
    # Step 1: Collect all icon names from the page
    all_icons: set[str] = set()
    for component in converted_content:
        collect_icons_from_component(component, all_icons)
    
    # Step 2: Fetch icons from CDN (parallel async)
    if all_icons:
        print(f"[publish] Collecting icons for page: {all_icons}")
        icon_map = await fetch_icons_batch(all_icons)
        
        # Step 3: Inject iconSvg into components
        converted_content = [inject_icon_svg(c, icon_map) for c in converted_content]
    # ============================
    
    # ==== CSS BUNDLING ====
    # Tree-shake CSS: only include styles for components used on this page
    from app.services.css_bundler import bundle_css_for_page_minified
    css_bundle = await bundle_css_for_page_minified(converted_content)
    print(f"[publish] CSS bundle generated: {len(css_bundle)} bytes")
    # ======================
    
    # Build PageLayout
    page_layout = PageLayout(
        content=[PageComponent(**c) for c in converted_content],
        root=layout_data.get("root", {})
    )
    
    # Parse SEO data if exists
    seo_data = None
    if hasattr(page, 'seo_data') and page.seo_data:  # type: ignore[truthy-bool]
        seo_raw = page.seo_data
        if isinstance(seo_raw, str):
            try:
                seo_raw = json.loads(seo_raw)
            except:
                seo_raw = {}
        seo_data = SeoData(**seo_raw) if isinstance(seo_raw, dict) and seo_raw else None
    
    # ==== PRIMARY AUTH FORM (for private page gating) ====
    primary_auth_form_config = None
    if not bool(page.is_public):
        try:
            from sqlalchemy import text as sa_text
            from app.database.config import SessionLocal as PubSessionLocal
            import json as _json
            pub_db = PubSessionLocal()
            try:
                # Python filtering: fetch all active, find primary in config JSON
                rows = pub_db.execute(
                    sa_text("SELECT * FROM auth_forms WHERE is_active = 1 ORDER BY created_at ASC")
                ).fetchall()
                primary_row = None
                first_row = None
                for row in rows:
                    if first_row is None:
                        first_row = row
                    config = _json.loads(row.config) if row.config else {}
                    if config.get("is_primary"):
                        primary_row = row
                        break
                row = primary_row or first_row
                if row:
                    config = _json.loads(row.config) if row.config else {}
                    primary_auth_form_config = {
                        "type": row.type,
                        "title": row.name,
                        "primaryColor": config.get("primaryColor"),
                        "providers": config.get("providers", []),
                        "magicLink": config.get("magicLink", False),
                        "showLinks": True,
                    }
                    print(f"[publish] Baked primary auth form '{row.name}' for private page")
            finally:
                pub_db.close()
        except Exception as e:
            print(f"[publish] Could not fetch primary auth form: {e}")
    # ======================================================
    
    # tenant_slug is passed in by the caller (resolved before session close)

    return PublishPageRequest(
        id=str(page.id),
        slug=str(page.slug),
        tenant_slug=tenant_slug,  # type: ignore[call-arg]
        name=str(page.name),
        title=str(page.title) if page.title else None,  # type: ignore[truthy-bool]
        description=str(page.description) if page.description else None,  # type: ignore[truthy-bool]
        layoutData=page_layout,
        seoData=seo_data,
        datasources=datasources if datasources else None,
        cssBundle=css_bundle,  # Tree-shaken CSS for this page
        version=1,  # TODO: Increment on re-publish
        publishedAt=datetime.utcnow().isoformat() + "Z",
        contentHash=getattr(page, 'content_hash', None),
        isPublic=bool(page.is_public),
        isHomepage=bool(page.is_homepage),
        primary_auth_form=primary_auth_form_config,  # type: ignore[call-arg]
    )
