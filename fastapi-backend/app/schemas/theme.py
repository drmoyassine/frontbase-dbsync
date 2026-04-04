from typing import Optional, Any, Dict
from pydantic import BaseModel, Field

class ComponentThemeBase(BaseModel):
    name: str = Field(..., description="Name of the theme")
    component_type: str = Field(..., description="Component type e.g. InfoList, DataTable")
    styles_data: Dict[str, Any] = Field(..., description="StylesData JSON object")
    is_system: bool = Field(False, description="Whether this is a pre-seeded system theme")

class ComponentThemeCreate(ComponentThemeBase):
    pass

class ComponentThemeUpdate(BaseModel):
    name: Optional[str] = None
    styles_data: Optional[Dict[str, Any]] = None

class ComponentThemeOut(ComponentThemeBase):
    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
