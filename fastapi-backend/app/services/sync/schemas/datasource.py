"""Pydantic schemas for Datasource API."""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, Union, List
from pydantic import BaseModel, Field, model_validator, field_validator
from sqlalchemy.engine.url import make_url

from app.services.sync.models.datasource import DatasourceType


class DatasourceBase(BaseModel):
    """Base schema for datasource."""
    name: str = Field(..., min_length=1, max_length=255)
    type: DatasourceType
    host: Optional[str] = Field(None, max_length=255)
    port: Optional[int] = Field(None, ge=1, le=65535)
    database: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = None
    connection_uri: Optional[str] = None
    
    # Supabase/Neon specific
    api_url: Optional[str] = None
    anon_key: Optional[str] = None  # Supabase anon key
    
    # WordPress specific
    table_prefix: str = Field(default="wp_", max_length=50)
    
    # Extra config as dict
    extra_config: Optional[Dict[str, Any]] = None

def _parse_uri_metadata(data: Any) -> Any:
    """Helper to parse connection URI and inject fields into data dict."""
    if isinstance(data, dict) and data.get("connection_uri"):
        try:
            url = make_url(data["connection_uri"])
            # Only parse if it's a database type
            if data.get("type") not in [DatasourceType.WORDPRESS_REST, DatasourceType.WORDPRESS_GRAPHQL]:
                data["host"] = url.host or data.get("host")
                data["port"] = url.port or data.get("port") or 5432
                data["database"] = url.database or data.get("database")
                data["username"] = url.username or data.get("username")
                data["password"] = url.password or data.get("password")
        except Exception as e:
            raise ValueError(f"Invalid connection URI: {str(e)}")
    return data


class DatasourceCreate(DatasourceBase):
    """Schema for creating a datasource."""
    name: str = Field(..., min_length=1, max_length=255)
    password: Optional[str] = None
    anon_key: Optional[str] = None  # Supabase anon key
    api_key: Optional[str] = None  # Service role key for Supabase/Neon

    @model_validator(mode="before")
    @classmethod
    def parse_connection_uri(cls, data: Any) -> Any:
        """Parse connection URI if provided."""
        return _parse_uri_metadata(data)


class DatasourceTestRequest(BaseModel):
    """Schema for testing a new datasource connection."""
    name: Optional[str] = Field(None, max_length=255)
    type: DatasourceType
    host: Optional[str] = Field(None, max_length=255)
    port: Optional[int] = Field(None, ge=1, le=65535)
    database: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = None
    password: Optional[str] = None
    connection_uri: Optional[str] = None
    api_url: Optional[str] = None
    anon_key: Optional[str] = None  # Supabase anon key
    api_key: Optional[str] = None  # Service role key
    table_prefix: str = Field(default="wp_", max_length=50)
    extra_config: Optional[Dict[str, Any]] = None

    @model_validator(mode="before")
    @classmethod
    def parse_connection_uri(cls, data: Any) -> Any:
        """Parse connection URI if provided."""
        return _parse_uri_metadata(data)


class DatasourceUpdate(BaseModel):
    """Schema for updating a datasource."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    host: Optional[str] = None
    port: Optional[int] = Field(None, ge=1, le=65535)
    database: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    connection_uri: Optional[str] = None
    api_url: Optional[str] = None
    anon_key: Optional[str] = None  # Supabase anon key
    api_key: Optional[str] = None  # Service role key
    table_prefix: Optional[str] = None
    extra_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

    @model_validator(mode="before")
    @classmethod
    def parse_connection_uri(cls, data: Any) -> Any:
        """Parse connection URI if provided."""
        return _parse_uri_metadata(data)


class DatasourceViewBase(BaseModel):
    """Base schema for datasource view."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    target_table: str
    filters: list[Dict[str, Any]] = Field(default_factory=list)
    field_mappings: Dict[str, Any] = Field(default_factory=dict)
    linked_views: Dict[str, Any] = Field(default_factory=dict)
    visible_columns: List[str] = Field(default_factory=list)
    pinned_columns: List[str] = Field(default_factory=list)
    column_order: List[str] = Field(default_factory=list)
    webhooks: list[Dict[str, Any]] = Field(default_factory=list)

class DatasourceViewCreate(DatasourceViewBase):
    """Schema for creating a datasource view."""
    datasource_id: Optional[str] = None

class DatasourceViewUpdate(BaseModel):
    """Schema for updating a datasource view."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    target_table: Optional[str] = None
    filters: Optional[list[Dict[str, Any]]] = None
    field_mappings: Optional[Dict[str, Any]] = None
    linked_views: Optional[Dict[str, Any]] = None
    visible_columns: Optional[List[str]] = None
    pinned_columns: Optional[List[str]] = None
    column_order: Optional[List[str]] = None
    webhooks: Optional[list[Dict[str, Any]]] = None

class DatasourceViewResponse(DatasourceViewBase):
    """Schema for datasource view response."""
    id: str
    datasource_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DatasourceResponse(BaseModel):
    """Schema for datasource response."""
    id: str
    name: str
    type: DatasourceType
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    username: Optional[str] = None
    api_url: Optional[str] = None
    table_prefix: str = "wp_"
    is_active: bool
    last_tested_at: Optional[datetime] = None
    last_test_success: Optional[bool] = None
    created_at: datetime
    updated_at: datetime
    extra_config: Optional[Dict[str, Any]] = None
    views: List[DatasourceViewResponse] = Field(default_factory=list)
    
    @model_validator(mode="after")
    def ensure_utc(self) -> "DatasourceResponse":
        """Ensure all datetimes are timezone-aware UTC."""
        if self.last_tested_at and self.last_tested_at.tzinfo is None:
            self.last_tested_at = self.last_tested_at.replace(tzinfo=timezone.utc)
        if self.created_at.tzinfo is None:
            self.created_at = self.created_at.replace(tzinfo=timezone.utc)
        if self.updated_at.tzinfo is None:
            self.updated_at = self.updated_at.replace(tzinfo=timezone.utc)
        return self
    
    @field_validator("extra_config", mode="before")
    @classmethod
    def parse_extra_config(cls, v: Any) -> Optional[Dict[str, Any]]:
        """Parse JSON string from DB into dict."""
        if v is None:
            return None
        if isinstance(v, dict):
            return v
        if isinstance(v, str):
            if not v.strip():
                return None
            import json
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return v
    
    class Config:
        from_attributes = True


class DatasourceTestResult(BaseModel):
    """Schema for connection test result."""
    success: bool
    message: str
    tables: Optional[list[str]] = None
    error: Optional[str] = None
    suggestion: Optional[str] = None


class ColumnSchema(BaseModel):
    """Schema for a single column."""
    name: str
    type: Union[str, List[str]]
    nullable: bool = True
    primary_key: bool = False
    default: Optional[Any] = None

    class Config:
        extra = "ignore"
        from_attributes = True

class TableSchema(BaseModel):
    """Schema for a table/resource."""
    columns: list[ColumnSchema]
