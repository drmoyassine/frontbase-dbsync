from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database.utils import get_db, create_variable, get_all_variables
from ..models.schemas import (
    VariableCreateRequest, VariableUpdateRequest, VariableResponse,
    SuccessResponse, ErrorResponse
)

router = APIRouter(prefix="/api/variables", tags=["variables"])

@router.get("", response_model=List[VariableResponse])
async def get_variables(db: Session = Depends(get_db)):
    """Get all variables"""
    variables = get_all_variables(db)
    return variables

@router.post("", response_model=VariableResponse)
async def create_variable_endpoint(request: VariableCreateRequest, db: Session = Depends(get_db)):
    """Create a new variable"""
    variable = create_variable(db, request.dict())
    return variable

@router.get("/{variable_id}", response_model=VariableResponse)
async def get_variable(variable_id: str, db: Session = Depends(get_db)):
    """Get a variable by ID"""
    from ..models.models import AppVariable
    
    variable = db.query(AppVariable).filter(AppVariable.id == variable_id).first()
    if not variable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variable not found"
        )
    
    return variable

@router.put("/{variable_id}", response_model=VariableResponse)
async def update_variable_endpoint(variable_id: str, request: VariableUpdateRequest, db: Session = Depends(get_db)):
    """Update a variable"""
    from ..models.models import AppVariable
    from ..database.utils import get_current_timestamp
    
    variable = db.query(AppVariable).filter(AppVariable.id == variable_id).first()
    if not variable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variable not found"
        )
    
    # Update fields
    update_data = request.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(variable, field, value)
    
    db.commit()
    db.refresh(variable)
    return variable

@router.delete("/{variable_id}")
async def delete_variable(variable_id: str, db: Session = Depends(get_db)):
    """Delete a variable"""
    from ..models.models import AppVariable
    
    variable = db.query(AppVariable).filter(AppVariable.id == variable_id).first()
    if not variable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variable not found"
        )
    
    db.delete(variable)
    db.commit()
    
    return {"message": "Variable deleted successfully"}