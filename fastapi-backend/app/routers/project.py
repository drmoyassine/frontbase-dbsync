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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return project

@router.put("/", response_model=ProjectResponse)
async def update_project_endpoint(request: ProjectUpdateRequest, db: Session = Depends(get_db)):
    """Update project settings"""
    project = update_project(db, request.dict(exclude_unset=True))
    return project