"""
Page publishing router.
Handles publishing pages to Edge Engine with pre-computed data requests.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import httpx
import os
import json
from datetime import datetime

from .transforms import (
    normalize_binding_location,
    map_styles_schema,
    process_component_children,
    find_datasource,
    collect_icons_from_component,
    fetch_icons_batch,
    inject_icon_svg
)
from .enrichment import enrich_binding_with_data_request, remove_nulls
from app.services.data_request import compute_data_request
from app.schemas.publish import (
    PublishPageRequest, ImportPagePayload, PageLayout, PageComponent,
    DatasourceConfig, DatasourceType as PublishDatasourceType, SeoData
)
from app.services.sync.models.datasource import Datasource, DatasourceType
from ...models.models import Page
from ...database.utils import get_db, get_project


router = APIRouter()


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


def convert_component(c: dict, datasources_list: list = None) -> dict:
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
                    component_id=result.get('id')  # Add componentId for Pydantic validation
                )
                
                print(f"[convert_component] Enriched {result.get('type', 'component')} binding")
                if 'frontendFilters' in result['binding']:
                    print(f"  - Preserved {len(result['binding']['frontendFilters'])} filters")

                # MAP columns -> columnOrder because React DataTable expects columnOrder
                if 'columns' in result['binding'] and result['binding']['columns']:
                    result['binding']['columnOrder'] = result['binding']['columns']

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


from ...database.config import SessionLocal

async def convert_to_publish_schema(page: Page, datasources: list) -> PublishPageRequest:
    """Convert Page model to PublishPageRequest schema"""
    # Parse layout_data
    layout_data = page.layout_data
    if isinstance(layout_data, str):
        try:
            layout_data = json.loads(layout_data)
        except:
            layout_data = {"content": [], "root": {}}
    
    # Datasources are passed in now (pre-fetched)
    
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
        cssBundle=css_bundle,  # Tree-shaken CSS for this page
        version=1,  # TODO: Increment on re-publish
        publishedAt=datetime.utcnow().isoformat() + "Z",
        isPublic=page.is_public,
        isHomepage=page.is_homepage,
    )


@router.post("/{page_id}/publish/")
async def publish_page(page_id: str):
    """
    Publish a page to Edge Engine.
    Gathers page data and sends to Edge /api/import endpoint.
    Crucial: Manages DB session manually to release connection during heavy IO (icon fetch/SSR).
    """
    # 1. FETCH DATA (Fast DB Interaction)
    db = SessionLocal()
    page = None
    datasources = []
    try:
        page = db.query(Page).filter(
            Page.id == page_id,
            Page.deleted_at == None
        ).first()
        
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Page not found: {page_id}"
            )
        
        # Force load attributes before detaching
        _ = page.layout_data
        _ = page.seo_data
        
        # Get datasources
        datasources = get_datasources_for_publish(db)
        
        # Expunge page to keep it usable after session close
        db.expunge(page)
        
    finally:
        db.close() # RELEASE DB CONNECTION NOW
    
    try:
        # 2. HEAVY IO (No DB Connection)
        # Convert to publish schema (includes icon fetching from CDN)
        publish_data = await convert_to_publish_schema(page, datasources)

        # Build payload for Edge Engine
        payload = ImportPagePayload(
            page=publish_data,
            force=True  # Always overwrite on publish
        )
        
        # Get Edge URL from environment
        edge_url = os.getenv("EDGE_URL", "http://localhost:3002")
        import_url = f"{edge_url}/api/import"
        
        print(f"[Publish] EDGE_URL env: {os.getenv('EDGE_URL', '(not set)')}")
        print(f"[Publish] Sending to: {import_url}")
        
        # Send to Edge Engine
        async with httpx.AsyncClient() as client:
            response = await client.post(
                import_url,
                json=payload.model_dump(by_alias=True, exclude_none=True),
                headers={"Content-Type": "application/json"},
                timeout=10.0
            )
            print(f"[Publish] Response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                
                # 3. UPDATE DB (New fast session)
                update_db = SessionLocal()
                try:
                    # Re-fetch page to update (safest way) OR use update query
                    page_to_update = update_db.query(Page).filter(Page.id == page_id).first()
                    if page_to_update:
                        page_to_update.is_public = True
                        update_db.commit()
                    
                    # Sync project settings
                    project = get_project(update_db)
                    if project:
                        settings_url = f"{edge_url}/api/import/settings"
                        # Fire and forget settings sync? Or wait? 
                        # We wait, but since we have a new session, it's fine.
                        # Note: We are INSIDE the IO block again (client post), but 
                        # we are holding a DB connection now. Typically this request is fast.
                        # But to be safer, we could gather data then close, then post.
                        # Settings payload:
                        settings_payload = {
                            "faviconUrl": project.favicon_url,
                            "logoUrl": getattr(project, 'logo_url', None),
                            "siteName": project.name,
                            "siteDescription": project.description,
                            "appUrl": project.app_url,
                        }
                        
                        # We can close DB before the request
                        update_db.close()
                        
                        await client.post(
                            settings_url,
                            json=settings_payload,
                            timeout=5.0
                        )
                        print(f"[Publish] Synced project settings to Edge")
                    else:
                         update_db.close()
                         
                except Exception as settings_err:
                    print(f"[Publish] Settings sync failed (non-fatal): {settings_err}")
                    update_db.close()
                
                return {
                    "success": True,
                    "message": f"Page '{page.name}' published successfully",
                    "previewUrl": result.get("previewUrl"),
                    "version": result.get("version")
                }
            else:
                print(f"[Publish] Edge import FAILED: status={response.status_code}, body={response.text[:500]}")
                return {
                    "success": False,
                    "error": f"Edge import failed: {response.status_code}",
                    "details": response.text
                }
                
    except HTTPException:
        raise
    except httpx.ConnectError:
        return {
            "success": False,
            "error": "Cannot connect to Edge Engine. Is it running?"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
