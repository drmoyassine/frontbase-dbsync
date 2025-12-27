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