from pydantic import BaseModel, EmailStr, constr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import json

from pydantic import BeforeValidator
from typing import Annotated

# Authentication Models
class LoginRequest(BaseModel):
    username: constr(min_length=3, max_length=50)
    password: constr(min_length=6)

class RegisterRequest(BaseModel):
    username: constr(min_length=3, max_length=50)
    email: EmailStr
    password: constr(min_length=8)

class DemoInfoResponse(BaseModel):
    demo_mode: bool
    demo_username: str
    demo_password: str
    message: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    created_at: Annotated[datetime, BeforeValidator(lambda v: datetime.fromisoformat(v) if isinstance(v, str) else v)]
    updated_at: Annotated[datetime, BeforeValidator(lambda v: datetime.fromisoformat(v) if isinstance(v, str) else v)]

    class Config:
        from_attributes = True

# Page Models
class PageCreateRequest(BaseModel):
    name: constr(min_length=1, max_length=100)
    slug: constr(min_length=1, max_length=100)  # Relaxed pattern for more flexibility
    title: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[str] = None
    is_public: Optional[bool] = Field(default=False, alias="isPublic")
    is_homepage: Optional[bool] = Field(default=False, alias="isHomepage")
    layout_data: Optional[Dict[str, Any]] = Field(default_factory=lambda: {"content": [], "root": {}}, alias="layoutData")
    
    class Config:
        populate_by_name = True  # Allow both field name and alias

class PageUpdateRequest(BaseModel):
    name: Optional[constr(min_length=1, max_length=100)] = None
    slug: Optional[str] = Field(default=None, max_length=100)  # Allow empty string for homepage
    title: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[str] = None
    is_public: Optional[bool] = Field(default=None, alias="isPublic")
    is_homepage: Optional[bool] = Field(default=None, alias="isHomepage")
    layout_data: Optional[Dict[str, Any]] = Field(default=None, alias="layoutData")
    
    class Config:
        populate_by_name = True

class PageResponse(BaseModel):
    id: str
    name: str
    slug: str
    title: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[str] = None
    is_public: bool
    is_homepage: bool
    layout_data: Dict[str, Any]
    created_at: Annotated[datetime, BeforeValidator(lambda v: datetime.fromisoformat(v) if isinstance(v, str) else v)]
    updated_at: Annotated[datetime, BeforeValidator(lambda v: datetime.fromisoformat(v) if isinstance(v, str) else v)]

    @field_validator('layout_data', mode='before')
    @classmethod
    def parse_layout_data(cls, v):
        """Parse layout_data from JSON string if needed"""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return {}
        return v or {}

    class Config:
        from_attributes = True

# Database Connection Models
class DatabaseConnectionRequest(BaseModel):
    url: constr(min_length=1)
    anonKey: constr(min_length=1)
    serviceKey: Optional[constr(min_length=1)] = None

class DatabaseConnectionResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    message: Optional[str] = None

class TableSchemaResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    message: Optional[str] = None

# Project Models
class ProjectUpdateRequest(BaseModel):
    name: Optional[constr(min_length=1, max_length=100)] = None
    description: Optional[str] = None
    app_url: Optional[str] = Field(default=None, alias="appUrl")
    favicon_url: Optional[str] = Field(default=None, alias="faviconUrl")
    supabase_url: Optional[constr(min_length=1)] = None
    supabase_anon_key: Optional[constr(min_length=1)] = None
    supabase_service_key: Optional[constr(min_length=1)] = None
    users_config: Optional[Dict[str, Any]] = Field(default=None, alias="usersConfig")

    class Config:
        populate_by_name = True  # Accept both field name and alias

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    app_url: Optional[str] = Field(default=None, serialization_alias="appUrl")
    favicon_url: Optional[str] = Field(default=None, serialization_alias="faviconUrl")
    supabase_url: Optional[str] = None
    supabase_anon_key: Optional[str] = None
    users_config: Optional[Dict[str, Any]] = Field(default=None, serialization_alias="usersConfig")
    created_at: Annotated[datetime, BeforeValidator(lambda v: datetime.fromisoformat(v) if isinstance(v, str) else v)]
    updated_at: Annotated[datetime, BeforeValidator(lambda v: datetime.fromisoformat(v) if isinstance(v, str) else v)]

    class Config:
        from_attributes = True
        populate_by_name = True


    @field_validator('users_config', mode='before')
    @classmethod
    def parse_users_config(cls, v):
        """Parse users_config from JSON string if needed"""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return {}
        return v or {}

# Variable Models
class VariableCreateRequest(BaseModel):
    name: constr(min_length=1, max_length=50)
    type: constr(pattern=r'^(variable|calculated)$')
    value: Optional[str] = None
    formula: Optional[str] = None
    description: Optional[str] = None

class VariableUpdateRequest(BaseModel):
    name: Optional[constr(min_length=1, max_length=50)] = None
    type: Optional[constr(pattern=r'^(variable|calculated)$')] = None
    value: Optional[str] = None
    formula: Optional[str] = None
    description: Optional[str] = None

class VariableResponse(BaseModel):
    id: str
    name: str
    type: str
    value: Optional[str] = None
    formula: Optional[str] = None
    description: Optional[str] = None
    created_at: Annotated[datetime, BeforeValidator(lambda v: datetime.fromisoformat(v) if isinstance(v, str) else v)]

    class Config:
        from_attributes = True

# Generic Response Models
class SuccessResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None

class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    errors: Optional[List[Dict[str, Any]]] = None
class ZodObject(BaseModel):
    # Auto-generated from Zod schema
    # Original schema: ZodObject
    pass
