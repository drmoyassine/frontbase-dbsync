"""
Page CRUD operations router.
Handles create, read, update, delete operations for pages.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, Any
from pydantic import BaseModel
import json
import time

from ...database.utils import get_db, create_page, update_page, get_page_by_slug, get_current_timestamp
from ...models.schemas import PageCreateRequest, PageUpdateRequest
from ...models.models import Page


router = APIRouter()


# Response wrapper to match Express format
class ApiResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    message: Optional[str] = None


def serialize_page(page: Page) -> dict:
    """Convert Page model to dict matching Express format (camelCase)"""
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
        page.slug = f"{page.slug}-deleted-{int(time.time() * 1000)}"
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
            new_slug = f"{new_slug}-restored-{int(time.time() * 1000)}"
        
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
