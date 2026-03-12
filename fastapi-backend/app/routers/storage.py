"""
Storage Router — Multi-provider storage operations.

All bucket/file operations are scoped by storage_provider_id.
Provider CRUD endpoints manage the StorageProvider records.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import json

from app.database.config import SessionLocal
from app.models.storage_provider import StorageProvider
from app.services.storage_service import get_storage_adapter

router = APIRouter(prefix="/api/storage", tags=["storage"])


# ============================================================================
# StorageProvider CRUD
# ============================================================================

@router.get("/providers/")
async def list_storage_providers():
    """List all explicitly-added storage providers."""
    db = SessionLocal()
    try:
        providers = db.query(StorageProvider).order_by(StorageProvider.created_at.desc()).all()
        result = []
        for sp in providers:
            account_name = ""
            if sp.provider_account:
                account_name = str(sp.provider_account.name) if sp.provider_account.name else ""
            result.append({
                "id": str(sp.id),
                "name": str(sp.name),
                "provider": str(sp.provider),
                "provider_account_id": str(sp.provider_account_id),
                "account_name": account_name,
                "config": json.loads(str(sp.config or "{}")),
                "is_active": bool(sp.is_active),
                "created_at": sp.created_at.isoformat() if sp.created_at else None,
                "updated_at": sp.updated_at.isoformat() if sp.updated_at else None,
            })
        return result
    finally:
        db.close()


@router.post("/providers/")
async def create_storage_provider(request: dict):
    """Create a new storage provider linking to a connected account."""
    db = SessionLocal()
    try:
        # Validate the account exists
        from app.models.models import EdgeProviderAccount
        account = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == request.get("provider_account_id"),
        ).first()
        if not account:
            raise HTTPException(404, "Connected account not found")

        now = datetime.now(timezone.utc)
        sp = StorageProvider(
            id=str(uuid.uuid4()),
            name=request.get("name", f"{account.name} Storage"),
            provider=str(account.provider),
            provider_account_id=str(account.id),
            config=json.dumps(request.get("config", {})),
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(sp)
        db.commit()
        db.refresh(sp)

        return {
            "id": str(sp.id),
            "name": str(sp.name),
            "provider": str(sp.provider),
            "provider_account_id": str(sp.provider_account_id),
            "account_name": str(account.name) if account.name else "",
            "config": json.loads(str(sp.config or "{}")),
            "is_active": True,
            "created_at": sp.created_at.isoformat() if sp.created_at else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to create storage provider: {e}")
    finally:
        db.close()


@router.delete("/providers/{provider_id}")
async def delete_storage_provider(provider_id: str):
    """Remove a storage provider."""
    db = SessionLocal()
    try:
        sp = db.query(StorageProvider).filter(StorageProvider.id == provider_id).first()
        if not sp:
            raise HTTPException(404, "Storage provider not found")
        db.delete(sp)
        db.commit()
        return {"success": True, "message": "Storage provider removed"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))
    finally:
        db.close()


# ============================================================================
# Helper — resolve adapter from provider_id
# ============================================================================

def _resolve_adapter(provider_id: str):
    """Fetch StorageProvider, resolve credentials, return adapter + release DB."""
    db = SessionLocal()
    try:
        adapter = get_storage_adapter(db, provider_id)
        return adapter
    finally:
        db.close()


# ============================================================================
# Bucket Operations (all scoped by provider_id)
# ============================================================================

@router.get("/buckets")
async def list_buckets(provider_id: str = Query(..., description="StorageProvider ID")):
    """List all buckets for a storage provider (fast — no size computation)."""
    try:
        # Resolve the adapter AND provider metadata
        db = SessionLocal()
        try:
            sp = db.query(StorageProvider).filter(StorageProvider.id == provider_id).first()
            if not sp:
                raise HTTPException(404, "Storage provider not found")
            provider_label = str(sp.provider).capitalize()  # e.g. "Supabase"
            adapter = get_storage_adapter(db, provider_id)
        finally:
            db.close()

        buckets = await adapter.list_buckets()

        # Inject provider label only (sizes are fetched lazily via /compute-size)
        for bucket in buckets:
            bucket["provider"] = provider_label

        return {"success": True, "buckets": buckets}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/compute-size")
async def compute_size(
    bucket: str = Query(..., description="Bucket name"),
    provider_id: str = Query(..., description="StorageProvider ID"),
    path: str = Query("", description="Folder path (empty for entire bucket)"),
):
    """Compute recursive size with L1/L2/L3 caching.

    L1: In-memory dict (instant)
    L2: Redis with 10-min TTL (survives restart)
    L3: Recursive Supabase API walk (expensive, populates L1 + L2)
    """
    from app.services.storage_service import get_cached_size, set_cached_size

    try:
        # L1 → L2 check
        cached = await get_cached_size(provider_id, bucket, path)
        if cached is not None:
            return {"success": True, "bucket": bucket, "path": path, "size": cached, "cached": True}

        # L3: Compute
        adapter = _resolve_adapter(provider_id)
        size = await adapter.compute_folder_size(bucket, path)

        # Populate L1 + L2
        await set_cached_size(provider_id, bucket, path, size)

        return {"success": True, "bucket": bucket, "path": path, "size": size, "cached": False}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/buckets")
async def create_bucket(
    request: dict,
    provider_id: str = Query(..., description="StorageProvider ID"),
):
    """Create a new bucket."""
    try:
        adapter = _resolve_adapter(provider_id)
        bucket = await adapter.create_bucket(
            name=request.get("name", ""),
            public=request.get("public", False),
            file_size_limit=request.get("file_size_limit"),
            allowed_mime_types=request.get("allowed_mime_types"),
        )
        return {"success": True, "bucket": bucket}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/buckets/{bucket_id}")
async def get_bucket(
    bucket_id: str,
    provider_id: str = Query(..., description="StorageProvider ID"),
):
    """Get a specific bucket."""
    try:
        adapter = _resolve_adapter(provider_id)
        bucket = await adapter.get_bucket(bucket_id)
        return {"success": True, "bucket": bucket}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.put("/buckets/{bucket_id}")
async def update_bucket(
    bucket_id: str,
    request: dict,
    provider_id: str = Query(..., description="StorageProvider ID"),
):
    """Update bucket settings."""
    try:
        adapter = _resolve_adapter(provider_id)
        await adapter.update_bucket(
            bucket_id,
            public=request.get("public", False),
            file_size_limit=request.get("file_size_limit"),
            allowed_mime_types=request.get("allowed_mime_types"),
        )
        return {"success": True, "message": "Bucket updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/buckets/{bucket_id}/empty")
async def empty_bucket(
    bucket_id: str,
    provider_id: str = Query(..., description="StorageProvider ID"),
):
    """Empty a bucket."""
    try:
        adapter = _resolve_adapter(provider_id)
        await adapter.empty_bucket(bucket_id)
        return {"success": True, "message": "Bucket emptied"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/buckets/{bucket_id}")
async def delete_bucket(
    bucket_id: str,
    provider_id: str = Query(..., description="StorageProvider ID"),
):
    """Delete a bucket (must be empty)."""
    try:
        adapter = _resolve_adapter(provider_id)
        await adapter.delete_bucket(bucket_id)
        return {"success": True, "message": "Bucket deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ============================================================================
# File Operations (all scoped by provider_id)
# ============================================================================

@router.get("/list")
async def list_files(
    bucket: str,
    provider_id: str = Query(..., description="StorageProvider ID"),
    path: str = "",
    limit: int = 100,
    offset: int = 0,
    search: Optional[str] = None,
):
    """List files in a bucket path (fast — folder sizes fetched lazily via /compute-size)."""
    try:
        adapter = _resolve_adapter(provider_id)
        files = await adapter.list_files(bucket, path, limit, offset, search)
        return {"success": True, "files": files}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    bucket: str = Form(...),
    path: Optional[str] = Form(None),
    provider_id: str = Form(...),
):
    """Upload a file."""
    try:
        adapter = _resolve_adapter(provider_id)
        content = await file.read()
        target_path = path if path else f"uploads/{file.filename}"
        result = await adapter.upload_file(
            bucket, target_path, content,
            file.content_type or "application/octet-stream",
        )
        return {"success": True, **result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/create-folder")
async def create_folder(request: dict):
    """Create a folder."""
    provider_id = request.get("provider_id")
    if not provider_id:
        raise HTTPException(400, "provider_id is required")
    try:
        adapter = _resolve_adapter(provider_id)
        await adapter.create_folder(
            request.get("bucket", ""),
            request.get("folderPath", ""),
        )
        return {"success": True, "message": "Folder created"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/delete")
async def delete_files(request: dict):
    """Delete files from a bucket."""
    provider_id = request.get("provider_id")
    if not provider_id:
        raise HTTPException(400, "provider_id is required")
    try:
        adapter = _resolve_adapter(provider_id)
        await adapter.delete_files(
            request.get("bucket", ""),
            request.get("paths", []),
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/signed-url")
async def get_signed_url(
    bucket: str,
    path: str,
    provider_id: str = Query(..., description="StorageProvider ID"),
    expiresIn: int = 3600,
):
    """Get a signed URL for temporary download."""
    try:
        adapter = _resolve_adapter(provider_id)
        url = await adapter.get_signed_url(bucket, path, expiresIn)
        return {"success": True, "signedUrl": url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/public-url")
async def get_public_url(
    bucket: str,
    path: str,
    provider_id: str = Query(..., description="StorageProvider ID"),
):
    """Get the public URL for a file."""
    try:
        adapter = _resolve_adapter(provider_id)
        url = await adapter.get_public_url(bucket, path)
        return {"success": True, "publicUrl": url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/move")
async def move_file(request: dict):
    """Move or rename a file."""
    provider_id = request.get("provider_id")
    if not provider_id:
        raise HTTPException(400, "provider_id is required")
    try:
        adapter = _resolve_adapter(provider_id)
        await adapter.move_file(
            request.get("bucket", ""),
            request.get("sourceKey", ""),
            request.get("destinationKey", ""),
        )
        return {"success": True, "message": "File moved"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
