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
    find_datasource
)
from .enrichment import enrich_binding_with_data_request, remove_nulls
from app.services.data_request import compute_data_request
from app.schemas.publish import (
    PublishPageRequest, ImportPagePayload, PageLayout, PageComponent,
    DatasourceConfig, DatasourceType as PublishDatasourceType, SeoData
)
from app.services.sync.models.datasource import Datasource, DatasourceType
from ...models.models import Page
from ...database.utils import get_db


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
    Publish a page to Edge Engine.
    Gathers page data and sends to Edge /api/import endpoint.
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
