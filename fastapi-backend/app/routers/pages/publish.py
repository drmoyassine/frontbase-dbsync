"""
Page publishing router.
Handles publishing pages to Edge Engine with pre-computed data requests.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import httpx
import os
import json
import hashlib
from datetime import datetime
from app.services.publish_strategy import get_publish_strategy, fan_out_to_deployment_targets

def compute_page_hash(page) -> str:
    """Compute a SHA-256 hash of the page's publishable attributes for drift detection.

    Rule: Include ALL columns EXCEPT:
      - content_hash (self-referential)
      - Metadata columns: deleted_at, created_at, updated_at

    This is future-proof: new columns on the Page model are automatically
    included in the hash without code changes.
    """
    # Columns excluded from the hash
    EXCLUDED = frozenset({
        "content_hash",   # self-referential
        "deleted_at",     # metadata
        "created_at",     # metadata
        "updated_at",     # metadata
    })

    def serialize(d):
        if d is None: return ""
        if isinstance(d, bool): return "1" if d else "0"
        if isinstance(d, str):
            try:
                obj = json.loads(d)
                return json.dumps(obj, sort_keys=True) if isinstance(obj, dict) else json.dumps(obj)
            except: return d
        return json.dumps(d, sort_keys=True)

    # Dynamically collect column values in alphabetical order for determinism
    from sqlalchemy import inspect as sa_inspect
    if hasattr(page, '__table__'):
        col_names = sorted(c.name for c in page.__table__.columns if c.name not in EXCLUDED)
    else:
        # Fallback for non-ORM objects (dicts, etc.)
        col_names = sorted(k for k in vars(page) if not k.startswith('_') and k not in EXCLUDED)

    parts = [serialize(getattr(page, col, None)) for col in col_names]
    raw_string = "|".join(parts)
    return hashlib.sha256(raw_string.encode('utf-8')).hexdigest()



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
import uuid
from ...models.models import Page, PageDeployment
from ...database.utils import get_db, get_project


router = APIRouter()


def get_datasources_for_publish(db: Session) -> list:
    """Get all active datasources and convert to publish-safe format.
    
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
    if hasattr(page, 'seo_data') and page.seo_data:  # type: ignore[truthy-bool]
        seo_raw = page.seo_data
        if isinstance(seo_raw, str):
            try:
                seo_raw = json.loads(seo_raw)
            except:
                seo_raw = {}
        seo_data = SeoData(**seo_raw) if isinstance(seo_raw, dict) and seo_raw else None
    
    return PublishPageRequest(
        id=str(page.id),
        slug=str(page.slug),
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
    db.expire_on_commit = False  # Keep attributes loaded after commit
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
        
        # Force load ALL attributes before detaching
        _ = page.layout_data
        _ = page.seo_data
        _ = page.id
        _ = page.slug
        _ = page.name
        _ = page.title
        _ = page.description
        _ = page.is_public
        _ = page.is_homepage
        
        # Compute the source content hash
        page_content_hash = compute_page_hash(page)
        page.content_hash = page_content_hash  # type: ignore[assignment]
        # Commit the hash to the backend DB so it's queryable later
        db.commit()

        
        # Expunge page BEFORE datasource query — if the datasources table
        # doesn't exist, the rollback would expire all loaded objects
        db.expunge(page)
        
        # Get datasources (may rollback on missing table — safe now)
        datasources = get_datasources_for_publish(db)
        
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
        
        # Use the configured publish strategy (local HTTP or Turso)
        strategy = get_publish_strategy()
        serialized = payload.model_dump(by_alias=True, exclude_none=True)
        result = await strategy.publish_page(serialized, force=True)

        if result.get("success"):
            # 3. UPDATE DB (New fast session)
            update_db = SessionLocal()
            try:
                page_to_update = update_db.query(Page).filter(Page.id == page_id).first()
                if page_to_update:
                    page_to_update.is_public = True  # type: ignore[assignment]
                    update_db.commit()
                
                # Gather settings data, then close DB before IO
                project = get_project(update_db)
                settings_payload = None
                if project:
                    settings_payload = {
                        "faviconUrl": project.favicon_url,
                        "logoUrl": getattr(project, 'logo_url', None),
                        "siteName": project.name,
                        "siteDescription": project.description,
                        "appUrl": project.app_url,
                    }
                update_db.close()
                
                # Sync settings (Release-Before-IO: DB closed above)
                if settings_payload:
                    await strategy.sync_settings(settings_payload)
                    
            except Exception as settings_err:
                print(f"[Publish] Settings sync failed (non-fatal): {settings_err}")
                try:
                    update_db.close()
                except:
                    pass
            
            # Fan out to deployment targets (non-fatal)
            fan_out_results = []
            try:
                fan_out_results = await fan_out_to_deployment_targets(serialized, scope="pages")
                
                # Update page_deployments join table
                if fan_out_results:
                    deploy_db = SessionLocal()
                    try:
                        now_str = datetime.utcnow().isoformat() + "Z"
                        for res in fan_out_results:
                            engine_id = res.get("target_id")
                            if not engine_id: continue
                            
                            deploy_status = "published" if res.get("success") else "failed"
                            error_msg = res.get("error") if not res.get("success") else None
                            
                            existing = deploy_db.query(PageDeployment).filter(
                                PageDeployment.page_id == page_id,
                                PageDeployment.edge_engine_id == engine_id
                            ).first()
                            
                            if existing:
                                existing.status = deploy_status  # type: ignore[assignment]
                                existing.content_hash = page_content_hash  # type: ignore[assignment]
                                existing.published_at = now_str  # type: ignore[assignment]
                                existing.error_message = error_msg  # type: ignore[assignment]
                                existing.updated_at = now_str  # type: ignore[assignment]
                            else:
                                new_deploy = PageDeployment(
                                    id=str(uuid.uuid4()),
                                    page_id=page_id,
                                    edge_engine_id=engine_id,
                                    status=deploy_status,
                                    version=1,
                                    content_hash=page_content_hash,
                                    published_at=now_str,
                                    error_message=error_msg,
                                    created_at=now_str,
                                    updated_at=now_str
                                )
                                deploy_db.add(new_deploy)
                        deploy_db.commit()
                    except Exception as dep_err:
                        print(f"[Publish] Failed to update deployments table: {dep_err}")
                    finally:
                        deploy_db.close()
            except Exception as fan_err:
                print(f"[Publish] Fan-out failed (non-fatal): {fan_err}")

            response = {
                "success": True,
                "message": f"Page '{page.name}' published successfully",
                "previewUrl": result.get("previewUrl"),
                "version": result.get("version"),
            }
            if fan_out_results:
                response["deploymentTargets"] = fan_out_results
            return response
        else:
            return result
                
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


@router.post("/{page_id}/publish/{engine_id}/")
async def publish_to_target(page_id: str, engine_id: str):
    """
    Publish a page to a specific Edge Engine target.
    """
    from ...models.models import EdgeEngine, PageDeployment
    import uuid
    
    # 1. FETCH DATA (Fast DB Interaction)
    db = SessionLocal()
    db.expire_on_commit = False  # Prevent attributes from expiring after commit
    page = None
    engine = None
    datasources = []
    try:
        page = db.query(Page).filter(
            Page.id == page_id,
            Page.deleted_at == None
        ).first()
        
        if not page:
            raise HTTPException(status_code=404, detail=f"Page not found: {page_id}")
            
        engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
        if not engine:
            raise HTTPException(status_code=404, detail=f"Engine not found: {engine_id}")
        
        # Force load ALL attributes before detaching
        _ = page.layout_data
        _ = page.seo_data
        _ = page.id
        _ = page.slug
        _ = page.name
        _ = page.title
        _ = page.description
        _ = page.is_public
        _ = page.is_homepage
        
        engine_url = getattr(engine, 'url', None)
        if not engine_url:
            raise HTTPException(status_code=400, detail="Engine URL is missing")
            
        page_content_hash = compute_page_hash(page)
        # Update the backend source of truth hash
        page.content_hash = page_content_hash  # type: ignore[assignment]
        db.commit()
        
        db.expunge(page)
        datasources = get_datasources_for_publish(db)
    finally:
        db.close()
        
    try:
        # Convert to publish schema
        publish_data = await convert_to_publish_schema(page, datasources)
        
        payload = ImportPagePayload(
            page=publish_data,
            force=True
        )
        
        serialized = payload.model_dump(by_alias=True, exclude_none=True)
        # Inject the computed hash
        if "page" in serialized:
            serialized["page"]["contentHash"] = page_content_hash
            
        # POST to specific engine
        import_url = f"{engine_url.rstrip('/')}/api/import"
        print(f"[Publish:SingleTarget] Sending to: {import_url}")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                import_url,
                json=serialized,
                headers={"Content-Type": "application/json"},
                timeout=15.0,
            )
            success = response.status_code == 200
            error_msg = f"HTTP {response.status_code}: {response.text[:200]}" if not success else None
            
        # Update the DB
        deploy_db = SessionLocal()
        try:
            now_str = datetime.utcnow().isoformat() + "Z"
            existing = deploy_db.query(PageDeployment).filter(
                PageDeployment.page_id == page_id,
                PageDeployment.edge_engine_id == engine_id
            ).first()
            
            deploy_status = "published" if success else "failed"
            
            if existing:
                existing.status = deploy_status  # type: ignore[assignment]
                existing.content_hash = page_content_hash  # type: ignore[assignment]
                existing.published_at = now_str  # type: ignore[assignment]
                existing.error_message = error_msg  # type: ignore[assignment]
                existing.updated_at = now_str  # type: ignore[assignment]
            else:
                new_deploy = PageDeployment(
                    id=str(uuid.uuid4()),
                    page_id=page_id,
                    edge_engine_id=engine_id,
                    status=deploy_status,
                    version=1,
                    content_hash=page_content_hash,
                    published_at=now_str,
                    error_message=error_msg,
                    created_at=now_str,
                    updated_at=now_str
                )
                deploy_db.add(new_deploy)
            deploy_db.commit()
        finally:
            deploy_db.close()
            
        if success:
            res_json = response.json() if response.status_code == 200 else {}
            return {
                "success": True,
                "message": f"Page '{page.name}' published to specific target",
                "previewUrl": res_json.get("previewUrl") or f"{engine_url.rstrip('/')}/{page.slug}",
                "version": 1
            }
        else:
            return {"success": False, "error": error_msg}

    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "error": str(e)}
