"""
Public page endpoints router.
Handles unauthenticated endpoints for Edge Engine SSR and pull-publish.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .crud import serialize_page
from .publish import get_datasources_for_publish, convert_component
from ...models.models import Page
from ...database.utils import get_db


router = APIRouter()


@router.get("/public/{slug}/")
async def get_public_page(slug: str, db: Session = Depends(get_db)):
    """
    Get a public page by slug for SSR.
    No authentication required - used by Edge Engine.
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


@router.get("/homepage/")
async def get_homepage(db: Session = Depends(get_db)):
    """
    Get the homepage for Edge pull-publish.
    Edge calls this when it has no homepage in its local DB.
    """
    try:
        homepage = db.query(Page).filter(
            Page.is_homepage == True,
            Page.deleted_at == None
        ).first()
        
        if not homepage:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No homepage configured"
            )
        
        return {
            "success": True,
            "data": serialize_page(homepage)
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
