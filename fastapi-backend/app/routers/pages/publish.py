"""
Page publishing router — thin endpoint delegating to services.

Extracted: compute_page_hash → services/page_hash.py
Extracted: convert_component, convert_to_publish_schema → services/publish_serializer.py
"""

from fastapi import APIRouter, HTTPException
from datetime import datetime
import httpx
import uuid

from app.database.config import SessionLocal
from app.models.models import Page, EdgeEngine, PageDeployment
from app.services.page_hash import compute_page_hash
from app.services.publish_serializer import (
    get_datasources_for_publish,
    convert_to_publish_schema,
)
from app.schemas.publish import ImportPagePayload


router = APIRouter()


@router.post("/{page_id}/publish/{engine_id}/")
async def publish_to_target(page_id: str, engine_id: str):
    """
    Publish a page to a specific Edge Engine target.
    """
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
