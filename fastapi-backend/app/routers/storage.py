from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
import httpx
import json
import mimetypes
from typing import Optional, List, Dict, Any

from app.database.config import get_db, SessionLocal
from app.routers.database import get_project_context_sync

router = APIRouter(prefix="/api/storage", tags=["storage"])

def get_storage_headers(ctx, auth_method=None):
    """Generate headers for Supabase Storage API requests"""
    headers = {
        'apikey': ctx['anon_key'],
        'Authorization': f"Bearer {ctx['auth_key']}"
    }
    
    # If the database context gave us service role key, definitely use it. 
    # Otherwise use anon, but we probably need to pass the user's JWT if available from frontend?
    # For admin tasks, the request needs service key if RLS allows it, or we rely on anon key holding rights.
    if ctx['url'] and ctx.get('auth_key'):
        pass

    return headers


@router.get("/buckets")
@router.get("/buckets/")
async def list_buckets():
    """List all available storage buckets."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        url = f"{ctx['url']}/storage/v1/bucket"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=get_storage_headers(ctx))
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to list buckets: {response.text}")
            
        return {"success": True, "buckets": response.json()}
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"List buckets error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/buckets")
@router.post("/buckets/")
async def create_bucket(request: dict):
    """Creates a new storage bucket in Supabase."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        url = f"{ctx['url']}/storage/v1/bucket"
        payload = {
            "id": request.get("name"),
            "name": request.get("name"),
            "public": request.get("public", False),
            "file_size_limit": request.get("file_size_limit"),
            "allowed_mime_types": request.get("allowed_mime_types")
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=get_storage_headers(ctx))
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to create bucket: {response.text}")
            
        return {"success": True, "bucket": response.json()}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/buckets/{id}")
@router.get("/buckets/{id}/")
async def get_bucket(id: str):
    """Retrieves details for a specific storage bucket."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        url = f"{ctx['url']}/storage/v1/bucket/{id}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=get_storage_headers(ctx))
            
        if not response.is_success:
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Bucket not found")
            raise HTTPException(status_code=response.status_code, detail=f"Failed to get bucket: {response.text}")
            
        return {"success": True, "bucket": response.json()}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/buckets/{id}")
@router.put("/buckets/{id}/")
async def update_bucket(id: str, request: dict):
    """Updates settings for an existing storage bucket."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        url = f"{ctx['url']}/storage/v1/bucket/{id}"
        payload = {
            "public": request.get("public", False),
            "file_size_limit": request.get("file_size_limit"),
            "allowed_mime_types": request.get("allowed_mime_types")
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.put(url, json=payload, headers=get_storage_headers(ctx))
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to update bucket: {response.text}")
            
        return {"success": True, "message": "Bucket updated successfully"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/buckets/{id}/empty")
@router.post("/buckets/{id}/empty/")
async def empty_bucket(id: str):
    """Empties a bucket."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        url = f"{ctx['url']}/storage/v1/bucket/{id}/empty"
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=get_storage_headers(ctx))
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to empty bucket: {response.text}")
            
        return {"success": True, "message": "Bucket emptied"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/buckets/{id}")
@router.delete("/buckets/{id}/")
async def delete_bucket(id: str):
    """Deletes a storage bucket. The bucket must be empty."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        url = f"{ctx['url']}/storage/v1/bucket/{id}"
        async with httpx.AsyncClient() as client:
            response = await client.delete(url, headers=get_storage_headers(ctx))
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to delete bucket: {response.text}")
            
        return {"success": True, "message": "Bucket deleted"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list")
@router.get("/list/")
async def list_files(bucket: str, path: str = "", limit: int = 100, offset: int = 0, search: Optional[str] = None):
    """Lists files and folders in a specified path within a bucket."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        url = f"{ctx['url']}/storage/v1/object/list/{bucket}"
        payload = {
            "prefix": path,
            "limit": limit,
            "offset": offset,
            "sortBy": {"column": "name", "order": "asc"},
            "search": search
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=get_storage_headers(ctx))
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to list files: {response.text}")
            
        files = response.json()
        
        # Format the response similar to Supabase Storage client
        # In Supabase storage, folders don't have metadata
        formatted_files = []
        for file in files:
            is_folder = "metadata" not in file or file["metadata"] is None
            formatted_files.append({
                "name": file.get("name"),
                "id": file.get("id", file.get("name")),
                "size": file.get("metadata", {}).get("size", 0) if not is_folder else 0,
                "updated_at": file.get("updated_at") or file.get("last_accessed_at") or file.get("created_at"),
                "mimetype": file.get("metadata", {}).get("mimetype") if file.get("metadata") else None,
                "metadata": file.get("metadata"),
                "isFolder": is_folder
            })
            
        return {"success": True, "files": formatted_files}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
@router.post("/upload/")
async def upload_file(
    file: UploadFile = File(...),
    bucket: str = Form(...),
    path: Optional[str] = Form(None)
):
    """Direct file upload."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        file_content = await file.read()
        target_path = path if path else f"uploads/{file.filename}"
        
        # Make path URL-safe but keep slashes
        from urllib.parse import quote
        safe_path = quote(target_path, safe="/")
        
        url = f"{ctx['url']}/storage/v1/object/{bucket}/{safe_path}"
        headers = get_storage_headers(ctx)
        headers["Content-Type"] = file.content_type or "application/octet-stream"
        
        async with httpx.AsyncClient() as client:
            # We don't use json, we send the raw bytes
            response = await client.post(url, content=file_content, headers=headers)
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to upload file: {response.text}")
            
        # Try to get public URL
        public_url = f"{ctx['url']}/storage/v1/object/public/{bucket}/{safe_path}"
            
        return {
            "success": True, 
            "path": target_path,
            "publicUrl": public_url
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-folder")
@router.post("/create-folder/")
async def create_folder(request: dict):
    """Creates a folder by uploading a .folder placeholder file."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        bucket = request.get("bucket")
        folder_path = request.get("folderPath")
        
        if folder_path.endswith("/"):
            folder_path = folder_path[:-1]
            
        target_path = f"{folder_path}/.folder"
        
        from urllib.parse import quote
        safe_path = quote(target_path, safe="/")
        
        url = f"{ctx['url']}/storage/v1/object/{bucket}/{safe_path}"
        headers = get_storage_headers(ctx)
        headers["Content-Type"] = "application/x-directory"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, content=b"", headers=headers)
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to create folder: {response.text}")
            
        return {"success": True, "folderPath": folder_path, "message": "Folder created"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete")
@router.delete("/delete/")
async def delete_files(request: dict):
    """Deletes one or more files from a bucket."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        bucket = request.get("bucket")
        paths = request.get("paths", [])
        
        url = f"{ctx['url']}/storage/v1/object/{bucket}"
        payload = {"prefixes": paths}
        
        async with httpx.AsyncClient() as client:
            # Note: httpx uses `request` method for sending body with DELETE
            response = await client.request("DELETE", url, json=payload, headers=get_storage_headers(ctx))
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to delete files: {response.text}")
            
        return {"success": True}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/signed-url")
@router.get("/signed-url/")
async def get_signed_url(bucket: str, path: str, expiresIn: int = 3600):
    """Generate a signed URL for temporary download access."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        from urllib.parse import quote
        safe_path = quote(path, safe="/")
        
        url = f"{ctx['url']}/storage/v1/object/sign/{bucket}/{safe_path}"
        payload = {"expiresIn": expiresIn}
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=get_storage_headers(ctx))
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to generate signed URL: {response.text}")
            
        return {"success": True, "signedUrl": response.json().get("signedUrl")}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/move")
@router.post("/move/")
async def move_file(request: dict):
    """Move a file or rename."""
    db = SessionLocal()
    try:
        ctx = get_project_context_sync(db, "builder")
    finally:
        db.close()
        
    try:
        bucket = request.get("bucket")
        source_key = request.get("sourceKey")
        destination_key = request.get("destinationKey")
        
        url = f"{ctx['url']}/storage/v1/object/move"
        payload = {
            "bucketId": bucket,
            "sourceKey": source_key,
            "destinationKey": destination_key
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=get_storage_headers(ctx))
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to move file: {response.text}")
            
        return {"success": True, "message": "Successfully moved"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
