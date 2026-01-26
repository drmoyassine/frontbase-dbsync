from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from ..database.utils import get_db, get_project, update_project
from ..models.schemas import ProjectUpdateRequest, ProjectResponse, SuccessResponse
import os
import uuid
from pathlib import Path

router = APIRouter(prefix="/api/project", tags=["project"])

# Static assets directory for branding files (favicon, logos, etc.)
ASSETS_DIR = Path(__file__).parent.parent.parent / "static" / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

# Allowed file types for branding assets
ALLOWED_ASSET_TYPES = {
    "favicon": {
        "extensions": [".png", ".ico"],
        "mimetypes": ["image/png", "image/x-icon", "image/vnd.microsoft.icon"],
        "max_size": 256 * 1024,  # 256KB
    },
    "logo": {
        "extensions": [".png", ".svg", ".jpg", ".jpeg"],
        "mimetypes": ["image/png", "image/svg+xml", "image/jpeg"],
        "max_size": 1024 * 1024,  # 1MB
    }
}

@router.get("/", response_model=ProjectResponse)
async def get_project_endpoint(db: Session = Depends(get_db)):
    """Get project settings"""
    project = get_project(db)
    if not project:
        # Auto-create default project if it doesn't exist
        # This handles fresh deployments where the DB is initialized but empty
        project = update_project(db, {"name": "My Project"})
        
    return project

@router.put("/", response_model=ProjectResponse)
async def update_project_endpoint(request: ProjectUpdateRequest, db: Session = Depends(get_db)):
    """Update project settings and sync to Edge for SSR self-sufficiency"""
    import httpx
    
    project = update_project(db, request.dict(exclude_unset=True))
    
    # Sync settings to Edge engine (fire-and-forget, non-blocking)
    edge_url = os.getenv("EDGE_URL", "http://edge:3002")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{edge_url}/api/import/settings",
                json={
                    "faviconUrl": project.favicon_url,
                    "logoUrl": getattr(project, 'logo_url', None),
                    "siteName": project.name,
                    "siteDescription": project.description,
                    "appUrl": project.app_url,
                }
            )
    except Exception as e:
        # Non-fatal: Edge sync failure shouldn't block project save
        print(f"[Project] Edge sync failed (non-fatal): {e}")
    
    return project

@router.post("/assets/upload/")
async def upload_branding_asset(
    file: UploadFile = File(...),
    asset_type: str = Form(default="favicon"),
):
    """
    Upload branding assets (favicon, logo) stored locally.
    These are independent of user-configured Supabase storage.
    Returns a URL path that works in both admin and SSR contexts.
    """
    # Validate asset type
    if asset_type not in ALLOWED_ASSET_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid asset type. Allowed: {list(ALLOWED_ASSET_TYPES.keys())}"
        )
    
    config = ALLOWED_ASSET_TYPES[asset_type]
    
    # Check file extension
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in config["extensions"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type for {asset_type}. Allowed: {config['extensions']}"
        )
    
    # Read file content
    content = await file.read()
    
    # Check file size
    if len(content) > config["max_size"]:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size for {asset_type}: {config['max_size'] // 1024}KB"
        )
    
    # Generate unique filename
    unique_id = uuid.uuid4().hex[:8]
    filename = f"{asset_type}-{unique_id}{ext}"
    file_path = ASSETS_DIR / filename
    
    # Save file
    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Return URL path (served by FastAPI static mount or nginx)
    public_url = f"/static/assets/{filename}"
    
    return JSONResponse({
        "success": True,
        "path": str(file_path),
        "publicUrl": public_url,
        "url": public_url,  # Alias for frontend compatibility
    })

@router.get("/internal/creds/", include_in_schema=False)
async def get_internal_creds(db: Session = Depends(get_db)):
    """
    Internal endpoint for Edge Service to get decrypted credentials.
    Standard API users should NOT access this.
    """
    from ..database.utils import decrypt_data
    
    project = get_project(db)
    if not project:
        raise HTTPException(status_code=404, detail="Project not configured")
        
    response = {
        "supabaseUrl": project.supabase_url,
        "supabaseKey": project.supabase_anon_key,
        "supabaseServiceKey": None
    }
    
    # Decrypt service key if present
    if project.supabase_service_key_encrypted:
        try:
            response["supabaseServiceKey"] = decrypt_data(project.supabase_service_key_encrypted)
        except Exception:
            pass
            
    return response