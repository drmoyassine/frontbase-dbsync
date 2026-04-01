from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from ..database.utils import get_db, get_project, update_project
from ..database.config import SessionLocal
from ..models.schemas import ProjectUpdateRequest, ProjectResponse, SuccessResponse
import os
import uuid
from pathlib import Path
import httpx
import json

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

@router.get("/", response_model=ProjectResponse, response_model_by_alias=True)
async def get_project_endpoint(db: Session = Depends(get_db)):
    """Get project settings"""
    project = get_project(db)
    if not project:
        # Auto-create default project if it doesn't exist
        # This handles fresh deployments where the DB is initialized but empty
        project = update_project(db, {"name": "My Project"})
        
    return project

@router.put("/", response_model=ProjectResponse, response_model_by_alias=True)
async def update_project_endpoint(request: ProjectUpdateRequest):
    """Update project settings and sync to Edge for SSR self-sufficiency.
    Optimized: Releases DB connection before Edge sync HTTP call.
    """
    # 1. DB OPERATIONS
    db = SessionLocal()
    try:
        project = update_project(db, request.dict(exclude_unset=True))
        # Detach the data we need for the response and Edge sync
        project_data = {
            "favicon_url": project.favicon_url,
            "logo_url": getattr(project, 'logo_url', None),
            "name": project.name,
            "description": project.description,
            "app_url": project.app_url,
            "users_config": getattr(project, 'users_config', None),
        }
        # Convert ORM model to dict for response BEFORE closing session
        from ..models.schemas import ProjectResponse
        response_data = ProjectResponse.from_orm(project)
        db.commit()
    finally:
        db.close()  # RELEASE CONNECTION BEFORE EDGE SYNC

    # Edge sync removed — auth config is now pushed to engines as FRONTBASE_AUTH
    # env var via the explicit push-to-engines UI (secrets_builder pipeline).
    # The fan-out POST to /api/import/settings is no longer needed.

    
    # 3. AUTO-ENABLE REALTIME on contacts table (non-fatal side-effect)
    realtime_result = await _ensure_contacts_realtime(project_data.get("users_config"))
    
    # Include realtime status in response headers (frontend reads these)
    if realtime_result:
        # Return enriched response with realtime info
        from fastapi.encoders import jsonable_encoder
        resp = jsonable_encoder(response_data)
        resp["_realtimeEnabled"] = realtime_result.get("enabled", False)
        resp["_realtimeMessage"] = realtime_result.get("message", "")
        return JSONResponse(content=resp)

    return response_data

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
    from ..core.credential_resolver import get_supabase_context
    
    try:
        ctx = get_supabase_context(db, mode="builder")
    except Exception:
        raise HTTPException(status_code=404, detail="Project not configured")
    
    return {
        "supabaseUrl": ctx["url"],
        "supabaseKey": ctx["anon_key"],
        "supabaseServiceKey": ctx["auth_key"] if ctx.get("auth_method") == "service_role" else None
    }


async def _ensure_contacts_realtime(users_config) -> dict | None:
    """Auto-enable Realtime on the contacts table if not already enabled.
    
    Uses the Supabase Management API (PAT from Provider Account) to check
    if the table is in the supabase_realtime publication, and adds it if not.
    Returns {enabled, message} or None if not applicable.
    """
    if not users_config:
        return None
    
    # Parse config
    if isinstance(users_config, str):
        try:
            config = json.loads(users_config)
        except (json.JSONDecodeError, TypeError):
            return None
    else:
        config = users_config
    
    contacts_table = config.get("contactsTable")
    if not contacts_table:
        return None
    
    try:
        from ..database.config import SessionLocal
        from ..core.credential_resolver import get_supabase_context
        from ..services.supabase_management import ensure_realtime_enabled
        
        db = SessionLocal()
        try:
            ctx = get_supabase_context(db, mode="builder")
        finally:
            db.close()
        
        access_token = ctx.get("access_token", "")
        project_ref = ctx.get("project_ref", "")
        
        if not access_token or not project_ref:
            print("[Project] Cannot enable Realtime: missing access_token or project_ref")
            return None
        
        result = await ensure_realtime_enabled(access_token, project_ref, contacts_table)
        
        if result.get("enabled"):
            if result.get("already_enabled"):
                print(f"[Project] Realtime already enabled on '{contacts_table}'")
                return {"enabled": True, "message": f"Realtime already active on '{contacts_table}'"}
            else:
                print(f"[Project] ✅ Realtime enabled on '{contacts_table}'")
                return {"enabled": True, "message": f"Realtime enabled on '{contacts_table}'"}
        else:
            error = result.get("error", "Unknown error")
            print(f"[Project] ⚠️ Failed to enable Realtime on '{contacts_table}': {error}")
            return {"enabled": False, "message": f"Could not enable Realtime: {error}"}
    except Exception as e:
        print(f"[Project] Realtime auto-enable failed (non-fatal): {e}")
        return None


def _enrich_users_config_for_edge(users_config) -> dict | None:
    """Resolve datasource IDs into actual connection credentials for the Edge.
    
    Bakes two objects into usersConfig:
    - `authProvider`: Supabase auth credentials (url, anonKey) for SupabaseAuthProvider
    - `contactsDatasource`: Contacts DB credentials (type, url, anonKey) for contact lookups
    
    This ensures both cloud and local Edge engines get credentials via the same
    settings sync pathway, without relying on environment variables.
    """
    import json

    # Initialize empty config if not set — auth provider credentials must be baked
    # regardless of whether contacts configuration exists
    if not users_config:
        config = {}
    elif isinstance(users_config, dict):
        config = users_config
    else:
        config = json.loads(str(users_config))
    
    try:
        from ..database.config import SessionLocal
        from ..services.sync.models.datasource import Datasource

        db = SessionLocal()
        try:
            # 1. Bake auth provider credentials (Supabase URL + anonKey)
            try:
                from ..core.credential_resolver import get_supabase_context
                ctx = get_supabase_context(db, mode="public")
                config["authProvider"] = {
                    "url": ctx.get("url"),
                    "anonKey": ctx.get("anon_key"),
                }
                print(f"[Project] Baked authProvider: {ctx.get('url', '')[:40]}...")
            except Exception as e:
                print(f"[Project] Could not resolve auth provider credentials: {e}")

            # 2. Bake contacts datasource credentials
            contacts_db_id = config.get("contactsDbId") or config.get("authDataSourceId")
            if contacts_db_id:
                ds = db.query(Datasource).filter(Datasource.id == contacts_db_id).first()
                if ds:
                    # For Supabase datasources, reuse the already-resolved credentials
                    anon_key = ds.anon_key_encrypted
                    ds_url = ds.api_url
                    if str(ds.type.value) == "supabase":
                        # Supabase: use authProvider URL as fallback (same project)
                        auth_provider = config.get("authProvider", {})
                        anon_key = auth_provider.get("anonKey") or anon_key
                        ds_url = ds_url or auth_provider.get("url")
                    
                    # Final fallback for non-Supabase: build from host/port/db
                    if not ds_url:
                        ds_url = f"postgresql://{ds.host}:{ds.port}/{ds.database}"

                    config["contactsDatasource"] = {
                        "id": ds.id,
                        "type": str(ds.type.value),
                        "name": ds.name,
                        "url": ds_url,
                        "anonKey": anon_key,
                    }
                    print(f"[Project] Baked contactsDatasource: {ds.name} ({ds.type.value}) → {str(ds_url)[:40]}...")
        finally:
            db.close()
    except Exception as e:
        print(f"[Project] Failed to enrich usersConfig (non-fatal): {e}")

    return config