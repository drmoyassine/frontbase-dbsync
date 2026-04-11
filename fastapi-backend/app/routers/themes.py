import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.config import get_db
from app.models.theme import ComponentTheme
from app.schemas.theme import ComponentThemeCreate, ComponentThemeUpdate, ComponentThemeOut

router = APIRouter()

@router.get("/", response_model=List[ComponentThemeOut])
def get_themes(
    component_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all themes, optionally filtered by component type."""
    query = db.query(ComponentTheme)
    if component_type:
        query = query.filter(ComponentTheme.component_type == component_type)
    themes = query.all()
    
    # Pass dict instead of str for Pydantic processing
    for t in themes:
        t.styles_data = t.styles_data_dict  # type: ignore[assignment]
    return themes

@router.post("/", response_model=ComponentThemeOut)
def create_theme(
    theme_in: ComponentThemeCreate,
    db: Session = Depends(get_db)
):
    """Create a new custom theme."""
    now = datetime.now(timezone.utc).isoformat()
    theme = ComponentTheme(
        id=str(uuid.uuid4()),
        name=theme_in.name,
        component_type=theme_in.component_type,
        is_system=theme_in.is_system,
        created_at=now,
        updated_at=now
    )
    theme.styles_data_dict = theme_in.styles_data
    
    db.add(theme)
    db.commit()
    db.refresh(theme)
    
    theme.styles_data = theme.styles_data_dict  # type: ignore[assignment]
    return theme

@router.delete("/{theme_id}", status_code=204)
def delete_theme(
    theme_id: str,
    db: Session = Depends(get_db)
):
    """Delete a custom theme. System themes cannot be deleted."""
    theme = db.query(ComponentTheme).filter(ComponentTheme.id == theme_id).first()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")
        
    if bool(theme.is_system):
        raise HTTPException(status_code=400, detail="Cannot delete a system theme")
        
    db.delete(theme)
    db.commit()
    return None
