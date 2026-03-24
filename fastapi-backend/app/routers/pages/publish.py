"""
Page publishing router — thin endpoint delegating to services.

Extracted: compute_page_hash → services/page_hash.py
Extracted: convert_component, convert_to_publish_schema → services/publish_serializer.py
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
from typing import List
import asyncio
import httpx
import uuid

from app.database.config import SessionLocal
from app.models.models import Page, EdgeEngine, PageDeployment
from app.services.page_hash import compute_page_hash
from app.services.edge_client import get_edge_headers
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
            
        # Force load ALL engine attributes before detaching
        _ = engine.url
        _ = engine.engine_config
        _ = engine.edge_provider_id
        _ = engine.id
        _ = engine.name

        page_content_hash = compute_page_hash(page)
        # Update the backend source of truth hash
        page.content_hash = page_content_hash  # type: ignore[assignment]
        db.commit()
        
        db.expunge(page)
        db.expunge(engine)
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
            auth_headers = get_edge_headers(engine)
            response = await client.post(
                import_url,
                json=serialized,
                headers={"Content-Type": "application/json", **auth_headers},
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


# ---------------------------------------------------------------------------
# Batch publish — serialize once, fan out to multiple engines in parallel
# ---------------------------------------------------------------------------

class BatchPublishRequest(BaseModel):
    engine_ids: List[str]


@router.post("/{page_id}/publish-batch/")
async def publish_to_targets_batch(page_id: str, body: BatchPublishRequest):
    """
    Publish a page to multiple Edge Engines in one request.
    Serializes the page ONCE, then fans out to all engines in parallel.
    """
    engine_ids = body.engine_ids
    if not engine_ids:
        return {"success": True, "results": []}

    # 1. FETCH page + engines from DB
    db = SessionLocal()
    db.expire_on_commit = False
    try:
        page = db.query(Page).filter(
            Page.id == page_id,
            Page.deleted_at == None
        ).first()
        if not page:
            raise HTTPException(status_code=404, detail=f"Page not found: {page_id}")

        engines = db.query(EdgeEngine).filter(
            EdgeEngine.id.in_(engine_ids)
        ).all()
        if not engines:
            raise HTTPException(status_code=404, detail="No engines found for the given IDs")

        # Build lookup: id → url/name, and pre-compute auth headers while session is open
        engine_map: dict[str, dict[str, str]] = {}
        auth_headers_map: dict[str, dict[str, str]] = {}
        for eng in engines:
            url = getattr(eng, 'url', None)
            name = getattr(eng, 'name', '') or str(eng.id)
            # Force-load engine_config for get_edge_headers (requires active session)
            _ = eng.engine_config
            if url:
                engine_map[str(eng.id)] = {"url": str(url), "name": str(name)}
                auth_headers_map[str(eng.id)] = get_edge_headers(eng)

        # Force-load page attributes before detaching
        _ = page.layout_data
        _ = page.seo_data
        _ = page.id
        _ = page.slug
        _ = page.name
        _ = page.title
        _ = page.description
        _ = page.is_public
        _ = page.is_homepage

        page_content_hash = compute_page_hash(page)
        page.content_hash = page_content_hash  # type: ignore[assignment]
        db.commit()

        db.expunge(page)
        datasources = get_datasources_for_publish(db)
    finally:
        db.close()

    # 2. SERIALIZE ONCE (the expensive part — icons, CSS bundling, FK enrichment)
    try:
        publish_data = await convert_to_publish_schema(page, datasources)
        payload = ImportPagePayload(page=publish_data, force=True)
        serialized = payload.model_dump(by_alias=True, exclude_none=True)
        if "page" in serialized:
            serialized["page"]["contentHash"] = page_content_hash
    except Exception as e:
        return {"success": False, "error": f"Serialization failed: {e}", "results": []}

    # 3. FAN OUT to all engines in parallel
    async def _send_to_engine(eid: str, info: dict[str, str]) -> dict[str, object]:
        import_url = f"{str(info['url']).rstrip('/')}/api/import"
        # Use pre-computed auth headers (computed while session was open)
        auth_hdrs = auth_headers_map.get(eid, {})
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    import_url,
                    json=serialized,
                    headers={"Content-Type": "application/json", **auth_hdrs},
                    timeout=15.0,
                )
            ok = resp.status_code == 200
            err = f"HTTP {resp.status_code}: {resp.text[:200]}" if not ok else None
            return {"engineId": eid, "name": info["name"], "success": ok, "error": err}
        except Exception as exc:
            return {"engineId": eid, "name": info["name"], "success": False, "error": str(exc)}

    print(f"[Publish:Batch] Sending to {len(engine_map)} engines: {list(engine_map.keys())}")
    results = await asyncio.gather(
        *[_send_to_engine(eid, info) for eid, info in engine_map.items()]
    )

    # 4. RECORD all deployments in a single DB transaction
    deploy_db = SessionLocal()
    try:
        now_str = datetime.utcnow().isoformat() + "Z"
        for r in results:
            eid = str(r["engineId"])
            deploy_status = "published" if r["success"] else "failed"
            error_msg = str(r["error"]) if r.get("error") else None

            existing = deploy_db.query(PageDeployment).filter(
                PageDeployment.page_id == page_id,
                PageDeployment.edge_engine_id == eid
            ).first()

            if existing:
                existing.status = deploy_status  # type: ignore[assignment]
                existing.content_hash = page_content_hash  # type: ignore[assignment]
                existing.published_at = now_str  # type: ignore[assignment]
                existing.error_message = error_msg  # type: ignore[assignment]
                existing.updated_at = now_str  # type: ignore[assignment]
            else:
                deploy_db.add(PageDeployment(
                    id=str(uuid.uuid4()),
                    page_id=page_id,
                    edge_engine_id=eid,
                    status=deploy_status,
                    version=1,
                    content_hash=page_content_hash,
                    published_at=now_str,
                    error_message=error_msg,
                    created_at=now_str,
                    updated_at=now_str,
                ))
        deploy_db.commit()
    finally:
        deploy_db.close()

    succeeded = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]
    names = ", ".join(str(r["name"]) for r in succeeded)

    return {
        "success": len(failed) == 0,
        "message": f"Published to {names}" if succeeded else "All targets failed",
        "results": list(results),
    }
