from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database.utils import get_db, get_project, update_project
from ..models.schemas import ProjectUpdateRequest, ProjectResponse, SuccessResponse

router = APIRouter(prefix="/api/project", tags=["project"])

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
    """Update project settings"""
    project = update_project(db, request.dict(exclude_unset=True))
    return project

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