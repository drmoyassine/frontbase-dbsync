"""
Page Version History & Rollback router.
Endpoints for listing versions and rolling back to a previous snapshot.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import json
import uuid

from ...database.utils import get_db, get_current_timestamp
from ...models.models import Page, PageVersion
from app.services.page_hash import compute_page_hash


router = APIRouter()


# ---------- Schemas ----------

class VersionLabelRequest(BaseModel):
    label: Optional[str] = None


class RollbackRequest(BaseModel):
    version_id: str


# ---------- Helpers ----------

def serialize_version(v: PageVersion) -> dict:
    """Convert a PageVersion to camelCase API dict."""
    return {
        "id": v.id,
        "pageId": v.page_id,
        "versionNumber": v.version_number,
        "contentHash": v.content_hash,
        "label": v.label,
        "createdAt": v.created_at,
        # Don't include full layout_data in list — it's large
    }


def create_version_snapshot(db: Session, page: Page) -> PageVersion:
    """
    Create a new version snapshot of the current page state.
    Auto-increments version_number per page.
    """
    # Find the current max version number for this page
    max_version = db.query(PageVersion.version_number).filter(
        PageVersion.page_id == str(page.id)
    ).order_by(PageVersion.version_number.desc()).first()

    next_version = (max_version[0] + 1) if max_version else 1

    content_hash_val = getattr(page, 'content_hash', None)
    
    version = PageVersion(
        id=str(uuid.uuid4()),
        page_id=str(page.id),
        version_number=next_version,
        layout_data=str(page.layout_data),
        content_hash=str(content_hash_val) if content_hash_val else None,
        created_at=get_current_timestamp(),
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


# ---------- Endpoints ----------

@router.get("/{page_id}/versions/")
async def list_versions(page_id: str, db: Session = Depends(get_db)):
    """List all version snapshots for a page, newest first."""
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    versions = db.query(PageVersion).filter(
        PageVersion.page_id == page_id
    ).order_by(PageVersion.version_number.desc()).limit(50).all()

    return {
        "success": True,
        "data": [serialize_version(v) for v in versions],
    }


@router.get("/{page_id}/versions/{version_id}/")
async def get_version_detail(page_id: str, version_id: str, db: Session = Depends(get_db)):
    """Get a specific version including its full layout_data snapshot."""
    version = db.query(PageVersion).filter(
        PageVersion.id == version_id,
        PageVersion.page_id == page_id,
    ).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    layout_data = version.layout_data
    if isinstance(layout_data, str):
        try:
            layout_data = json.loads(layout_data)
        except Exception:
            layout_data = {"content": [], "root": {}}

    data = serialize_version(version)
    data["layoutData"] = layout_data
    return {
        "success": True,
        "data": data,
    }


@router.post("/{page_id}/versions/")
async def create_manual_version(page_id: str, request: VersionLabelRequest, db: Session = Depends(get_db)):
    """Manually create a named version snapshot (e.g., "Pre-launch backup")."""
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    version = create_version_snapshot(db, page)

    # Apply optional label
    if request.label:
        version.label = request.label  # type: ignore[assignment]
        db.commit()
        db.refresh(version)

    return {
        "success": True,
        "data": serialize_version(version),
    }


@router.post("/{page_id}/rollback/")
async def rollback_to_version(page_id: str, request: RollbackRequest, db: Session = Depends(get_db)):
    """
    Roll back a page to a previous version.
    Creates a NEW version snapshot of the current state BEFORE overwriting,
    so the rollback itself can be undone.
    """
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    target_version = db.query(PageVersion).filter(
        PageVersion.id == request.version_id,
        PageVersion.page_id == page_id,
    ).first()
    if not target_version:
        raise HTTPException(status_code=404, detail="Target version not found")

    # 1. Snapshot current state before overwriting
    pre_rollback = create_version_snapshot(db, page)
    pre_rollback.label = f"Auto-saved before rollback to v{target_version.version_number}"  # type: ignore[assignment]
    db.commit()

    # 2. Overwrite page layout_data with the target version's snapshot
    page.layout_data = target_version.layout_data  # type: ignore[assignment]
    page.content_hash = compute_page_hash(page)  # type: ignore[assignment]
    page.updated_at = get_current_timestamp()  # type: ignore[assignment]
    db.commit()
    db.refresh(page)

    return {
        "success": True,
        "message": f"Rolled back to version {target_version.version_number}",
        "data": {
            "preRollbackVersionId": pre_rollback.id,
            "restoredVersionNumber": target_version.version_number,
        }
    }
