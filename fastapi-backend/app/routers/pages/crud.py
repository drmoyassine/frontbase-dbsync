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
import os
import httpx

from ...database.utils import get_db, create_page, update_page, get_page_by_slug, get_current_timestamp
from ...models.schemas import PageCreateRequest, PageUpdateRequest
from ...models.models import Page, PageDeployment, EdgeEngine, Project
from app.services.page_hash import compute_page_hash
from app.services.edge_client import get_edge_headers, resolve_engine_url
from app.middleware.tenant_context import TenantContext, get_tenant_context
from .versions import create_version_snapshot
from sqlalchemy.orm import joinedload
import asyncio


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
    api_deployments = []
    has_unpublished_changes = False
    
    if hasattr(page, 'deployments') and page.deployments:
        for dep in page.deployments:
            # Skip deployments for deleted engines
            if not dep.edge_engine:
                continue
            target_data = {}
            if dep.edge_engine:
                target_data = {
                    "id": dep.edge_engine.id,
                    "name": dep.edge_engine.name,
                    "url": dep.edge_engine.url,
                    "is_shared": getattr(dep.edge_engine, 'is_shared', False),
                    "provider": dep.edge_engine.edge_provider.provider if getattr(dep.edge_engine, 'edge_provider', None) else "unknown"
                }
                
            api_deployments.append({
                "id": dep.id,
                "engineId": dep.edge_engine_id,
                "status": dep.status,
                "version": dep.version,
                "contentHash": dep.content_hash,
                "publishedAt": dep.published_at,
                "errorMessage": dep.error_message,
                "previewUrl": getattr(dep, 'preview_url', None),  # tenant-aware URL from edge
                "target": target_data
            })
            
            # If there's a successful deployment and its hash differs from the page's current hash,
            # then there are unpublished changes.
            if dep.status == "published" and dep.content_hash != getattr(page, 'content_hash', None):
                has_unpublished_changes = True
    elif bool(page.is_public):
        # Legacy case: Page is marked public but has no deployment records in the new system
        has_unpublished_changes = True

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
        "deletedAt": page.deleted_at,
        "contentHash": getattr(page, 'content_hash', None),
        "hasUnpublishedChanges": has_unpublished_changes,
        "deployments": api_deployments
    }


async def fan_out_unpublish(slug: str, page_id: str, db: Session):
    """
    Unpublish a page from ALL active full-bundle Edge Engines.
    Sends DELETE /api/import/{slug} to each engine in parallel.
    Cleans up PageDeployment records.
    Non-blocking: logs warnings if an engine is unreachable.
    """
    # Extract original slug if it was modified during soft delete
    original_slug = slug.split("-deleted-")[0] if "-deleted-" in slug else slug
    
    # Get all active full-bundle Edge Engines with a DB connected
    engines = db.query(EdgeEngine).filter(
        EdgeEngine.adapter_type == "full",
        EdgeEngine.is_active == True,
        EdgeEngine.edge_db_id != None
    ).all()
    
    if not engines:
        print(f"[Unpublish] No active full-bundle engines found")
        return
    
    # Fan out DELETE requests in parallel
    async with httpx.AsyncClient(timeout=10.0) as client:
        tasks = []
        for engine in engines:
            url = f"{resolve_engine_url(engine).rstrip('/')}/api/import/{original_slug}"
            auth_headers = get_edge_headers(engine)
            tasks.append(client.delete(url, headers=auth_headers))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for engine, result in zip(engines, results):
            if isinstance(result, BaseException):
                print(f"[Unpublish] Warning - could not reach {engine.name}: {result}")
            elif hasattr(result, 'status_code') and result.status_code == 200:  # type: ignore[union-attr]
                print(f"[Unpublish] Removed from {engine.name}: {original_slug}")
            elif hasattr(result, 'status_code'):
                print(f"[Unpublish] {engine.name} returned {result.status_code}: {result.text}")  # type: ignore[union-attr]
    
    # Clean up PageDeployment records
    db.query(PageDeployment).filter(PageDeployment.page_id == page_id).delete()
    db.commit()
    print(f"[Unpublish] Cleaned up deployment records for page {page_id}")


async def unpublish_from_single_target(slug: str, page_id: str, engine_id: str, db: Session) -> dict:
    """
    Unpublish a page from a SINGLE Edge Engine.
    Returns a result dict with success/error.
    """
    original_slug = slug.split("-deleted-")[0] if "-deleted-" in slug else slug
    
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        return {"success": False, "error": f"Edge engine not found: {engine_id}"}
    
    # Send DELETE to the specific engine
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{resolve_engine_url(engine).rstrip('/')}/api/import/{original_slug}"
            auth_headers = get_edge_headers(engine)
            response = await client.delete(url, headers=auth_headers)
            if response.status_code == 200:
                print(f"[Unpublish] Removed from {engine.name}: {original_slug}")
            else:
                print(f"[Unpublish] {engine.name} returned {response.status_code}: {response.text}")
    except Exception as e:
        print(f"[Unpublish] Warning - could not reach {engine.name}: {e}")
        return {"success": False, "error": f"Could not reach {engine.name}: {e}"}
    
    # Delete the specific PageDeployment record
    db.query(PageDeployment).filter(
        PageDeployment.page_id == page_id,
        PageDeployment.edge_engine_id == engine_id
    ).delete()
    db.commit()
    
    return {"success": True, "message": f"Page unpublished from {engine.name}"}


@router.get("/")
async def get_pages(
    includeDeleted: bool = False,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Get all pages - matches Express: { success, data: pages[] }"""
    try:
        base_query = db.query(Page).options(
            joinedload(Page.deployments).joinedload(PageDeployment.edge_engine)
        )

        # Cloud mode: strict bidirectional isolation
        if ctx and ctx.tenant_id and not ctx.is_master:
            # Tenant: only their own project's pages
            project_ids = (
                db.query(Project.id)
                .filter(Project.tenant_id == ctx.tenant_id)
                .scalar_subquery()
            )
            base_query = base_query.filter(Page.project_id.in_(project_ids))
        elif ctx and ctx.is_master:
            # Master admin: only pages NOT assigned to any tenant project
            base_query = base_query.filter(Page.project_id == None)  # noqa: E711

        if includeDeleted:
            pages = base_query.all()
        else:
            pages = base_query.filter(Page.deleted_at == None).all()
        
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
async def get_page(
    page_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Get a page by ID - matches Express: { success, data: page }"""
    try:
        base_query = db.query(Page).options(
            joinedload(Page.deployments).joinedload(PageDeployment.edge_engine)
        ).filter(Page.id == page_id, Page.deleted_at == None)

        # Cloud mode: strict bidirectional isolation
        if ctx and ctx.tenant_id and not ctx.is_master:
            # Tenant: only their own project's pages
            project_ids = (
                db.query(Project.id)
                .filter(Project.tenant_id == ctx.tenant_id)
                .scalar_subquery()
            )
            base_query = base_query.filter(Page.project_id.in_(project_ids))
        elif ctx and ctx.is_master:
            # Master admin: only pages NOT assigned to any tenant project
            base_query = base_query.filter(Page.project_id == None)  # noqa: E711

        page = base_query.first()
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
async def create_page_endpoint(
    request: PageCreateRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Create a new page - matches Express: { success, data: page }"""
    try:
        # Check if slug is already taken — scoped to this tenant's project.
        # In multi-tenant mode, /hello can exist once per tenant project,
        # not just once globally. Pass ctx so the check is project-scoped.
        existing_page = get_page_by_slug(db, request.slug, ctx)
        if existing_page:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A page with this slug already exists"
            )
        
        # Use model_dump with by_alias=False to get snake_case field names
        page_data = request.model_dump(by_alias=False)

        # Cloud mode: stamp page with the tenant's project_id so it is scoped
        # correctly in all subsequent queries. Must go into page_data BEFORE
        # calling create_page() — utils.create_page() reads project_id from the
        # dict directly (its own ctx param is unused in this path).
        if ctx and ctx.tenant_id and not ctx.is_master:
            project = (
                db.query(Project)
                .filter(Project.tenant_id == ctx.tenant_id)
                .first()
            )
            if project:
                page_data["project_id"] = str(project.id)

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
async def update_page_endpoint(
    page_id: str,
    request: PageUpdateRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Update a page - matches Express: { success, data: page }"""
    try:
        # Cloud mode: verify page belongs to this tenant before mutating
        if ctx and ctx.tenant_id and not ctx.is_master:
            project_ids = (
                db.query(Project.id)
                .filter(Project.tenant_id == ctx.tenant_id)
                .scalar_subquery()
            )
            owned = db.query(Page.id).filter(
                Page.id == page_id, Page.project_id.in_(project_ids)
            ).first()
            if not owned:
                raise HTTPException(status_code=404, detail="Page not found")

        # Use model_dump with by_alias=False and exclude_unset=True
        page_data = request.model_dump(by_alias=False, exclude_unset=True)
        page = update_page(db, page_id, page_data)
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page not found"
            )
        
        # Recompute content hash so staleness detection works
        page.content_hash = compute_page_hash(page)  # type: ignore[assignment]
        db.commit()
        db.refresh(page)

        # Auto-snapshot version history
        try:
            create_version_snapshot(db, page)
        except Exception:
            pass  # Non-blocking — version creation should never fail a save

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
async def update_page_layout(
    page_id: str,
    request: dict,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Update page layout - matches Express: { success, data: page }"""
    try:
        layout_data = request.get("layoutData")
        if not layout_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="layoutData is required"
            )

        # Cloud mode: verify ownership before mutating layout
        if ctx and ctx.tenant_id and not ctx.is_master:
            project_ids = (
                db.query(Project.id)
                .filter(Project.tenant_id == ctx.tenant_id)
                .scalar_subquery()
            )
            owned = db.query(Page.id).filter(
                Page.id == page_id, Page.project_id.in_(project_ids)
            ).first()
            if not owned:
                raise HTTPException(status_code=404, detail="Page not found")

        page = update_page(db, page_id, {"layout_data": layout_data})
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page not found"
            )
        
        # Recompute content hash so staleness detection works
        page.content_hash = compute_page_hash(page)  # type: ignore[assignment]
        db.commit()
        db.refresh(page)

        # Auto-snapshot version history
        try:
            create_version_snapshot(db, page)
        except Exception:
            pass  # Non-blocking — version creation should never fail a save

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
async def delete_page(page_id: str):
    """Soft delete a page - matches Express: { success, message }.
    Unpublishes from ALL active full-bundle Edge Engines.
    """
    from ...database.config import SessionLocal
    
    db = SessionLocal()
    try:
        page = db.query(Page).filter(Page.id == page_id).first()
        if not page:
            db.close()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page not found"
            )
        
        # Store original slug before modifying (for unpublish)
        original_slug = str(page.slug)
        was_homepage = page.is_homepage
        page_id_str = str(page.id)
        
        # Append timestamp to slug to allow reuse (matching Express)
        page.slug = f"{page.slug}-deleted-{int(time.time() * 1000)}"  # type: ignore[assignment]
        page.deleted_at = get_current_timestamp()  # type: ignore[assignment]
        
        # Clear homepage status when trashing
        if was_homepage:  # type: ignore[truthy-bool]
            page.is_homepage = False  # type: ignore[assignment]
        
        db.commit()
        
        # Fan-out unpublish to all active full-bundle Edge Engines
        await fan_out_unpublish(original_slug, page_id_str, db)
        
        if was_homepage:  # type: ignore[truthy-bool]
            print(f"[Delete] Cleared homepage status for: {original_slug}")
        
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
    finally:
        db.close()


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
        
        page.slug = new_slug  # type: ignore[assignment]
        page.deleted_at = None  # type: ignore[assignment]
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
async def permanent_delete_page(page_id: str):
    """Permanently delete a page - matches Express: { success, message }.
    Unpublishes from ALL active full-bundle Edge Engines, then hard-deletes.
    """
    from ...database.config import SessionLocal
    
    db = SessionLocal()
    try:
        page = db.query(Page).filter(Page.id == page_id).first()
        if not page:
            db.close()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page not found"
            )
        
        # Store slug for unpublish (handles -deleted- suffix)
        page_slug = str(page.slug)
        page_id_str = str(page.id)
        
        # Fan-out unpublish BEFORE hard delete (so deployment records still exist to query)
        await fan_out_unpublish(page_slug, page_id_str, db)
        
        # Now hard delete (cascade cleans up any remaining PageDeployment rows)
        db.delete(page)
        db.commit()
        
        return {
            "success": True,
            "message": "Page permanently deleted"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[PermanentDelete] Error: {e}")
        return {
            "success": False,
            "error": str(e)
        }
    finally:
        db.close()


@router.post("/{page_id}/unpublish/{engine_id}/")
async def unpublish_page_from_target(page_id: str, engine_id: str, db: Session = Depends(get_db)):
    """Unpublish a page from a specific Edge Engine target.
    Page remains in the backend DB and on other targets.
    """
    try:
        page = db.query(Page).filter(
            Page.id == page_id,
            Page.deleted_at == None
        ).first()
        if not page:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Page not found"
            )
        
        result = await unpublish_from_single_target(
            str(page.slug), str(page.id), engine_id, db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
