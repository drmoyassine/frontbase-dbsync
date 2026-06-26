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
    # WordPress Plugin specific (frontend sends these, we map to api_url/password)
    base_url: Optional[str] = Field(None, max_length=512)
    app_password: Optional[str] = None

    # Extra config as dict
    extra_config: Optional[Dict[str, Any]] = None

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v: Any) -> Any:
        """Normalize datasource type to lowercase enum value.

        Handles case mismatches (e.g., "WORDPRESS_PLUGIN" → "wordpress_plugin")
        by converting to lowercase and validating against enum values.
        """
        import logging
        logger = logging.getLogger("datasource.schema")
        logger.info(f"[NORMALIZE-TYPE] Input: {v!r}, type: {type(v)}")

        if isinstance(v, str):
            # Convert to lowercase and match against enum values
            v_lower = v.lower()
            # Check if it matches any enum value
            for enum_member in DatasourceType:
                if enum_member.value == v_lower:
                    result = DatasourceType(v_lower)
                    logger.info(f"[NORMALIZE-TYPE] Converted {v!r} -> {result!r}, value={result.value!r}")
                    return result
            # If no match, raise validation error
            valid_values = [e.value for e in DatasourceType]
            logger.warning(f"[NORMALIZE-TYPE] Invalid type {v!r}, valid: {valid_values}")
            raise ValueError(
                f"Invalid datasource type '{v}'. Valid types: {valid_values}"
            )

        # If already an enum, log and return
        if isinstance(v, DatasourceType):
            logger.info(f"[NORMALIZE-TYPE] Already enum: {v!r}, value={v.value!r}")
        else:
            logger.info(f"[NORMALIZE-TYPE] Non-string, non-enum: {v!r}")

        return v

def _ensure_url_scheme(url: Optional[str]) -> Optional[str]:
    """Ensure a URL has an http(s):// scheme.

    Bare hosts (e.g. ``mysite.com``) get ``https://`` prepended — httpx rejects
    schemeless URLs with "Request URL is missing an 'http://' or 'https://'
    protocol." (BACKEND-C / BACKEND-E). Already-schemed URLs and empty/None
    pass through unchanged.
    """
    if not url:
        return url
    url = url.strip()
    if not url:
        return url
    if "://" not in url:
        return f"https://{url}"
    return url


def _parse_uri_metadata(data: Any) -> Any:
    """Helper to parse connection URI and inject fields into data dict."""
    if isinstance(data, dict) and data.get("connection_uri"):
        try:
            url = make_url(data["connection_uri"])
            # Only parse if it's a database type
            if data.get("type") not in [
                DatasourceType.WORDPRESS_REST,
                DatasourceType.WORDPRESS_GRAPHQL,
                DatasourceType.WORDPRESS_PLUGIN,
            ]:
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
    provider_account_id: Optional[str] = None  # FK to Connected Account (central cred management)

    @model_validator(mode="before")
    @classmethod
    def parse_connection_uri(cls, data: Any) -> Any:
        """Parse connection URI and map WordPress Plugin fields."""
        data = _parse_uri_metadata(data)
        # Map WordPress Plugin fields to standard fields
        if isinstance(data, dict) and data.get("type") in [
            DatasourceType.WORDPRESS_REST,
            DatasourceType.WORDPRESS_GRAPHQL,
            DatasourceType.WORDPRESS_PLUGIN,
        ]:
            # Map base_url → api_url
            if data.get("base_url") and not data.get("api_url"):
                data["api_url"] = _ensure_url_scheme(data.pop("base_url"))
            # Map app_password → password for REST/GraphQL, → api_key for Plugin
            # Plugin uses api_key_encrypted, REST uses password_encrypted
            if data.get("app_password"):
                if data.get("type") == DatasourceType.WORDPRESS_PLUGIN:
                    data["api_key"] = data.pop("app_password")
                else:
                    if not data.get("password"):
                        data["password"] = data.pop("app_password")
        return data


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
    # WordPress Plugin specific (frontend sends these, we map to api_url/password)
    base_url: Optional[str] = None
    app_password: Optional[str] = None
    extra_config: Optional[Dict[str, Any]] = None
    provider_account_id: Optional[str] = None  # Connected Account to resolve creds from

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v: Any) -> Any:
        """Normalize datasource type to lowercase enum value."""
        if isinstance(v, str):
            v_lower = v.lower()
            for enum_member in DatasourceType:
                if enum_member.value == v_lower:
                    return DatasourceType(v_lower)
            valid_values = [e.value for e in DatasourceType]
            raise ValueError(
                f"Invalid datasource type '{v}'. Valid types: {valid_values}"
            )
        return v

    @model_validator(mode="before")
    @classmethod
    def parse_connection_uri(cls, data: Any) -> Any:
        """Parse connection URI if provided."""
        data = _parse_uri_metadata(data)
        # Map WordPress Plugin fields to standard fields
        if isinstance(data, dict) and data.get("type") in [
            DatasourceType.WORDPRESS_REST,
            DatasourceType.WORDPRESS_GRAPHQL,
            DatasourceType.WORDPRESS_PLUGIN,
        ]:
            # Map base_url → api_url
            if data.get("base_url") and not data.get("api_url"):
                data["api_url"] = _ensure_url_scheme(data.pop("base_url"))
            # Map app_password → password for REST/GraphQL, → api_key for Plugin
            # Plugin uses api_key_encrypted, REST uses password_encrypted
            if data.get("app_password"):
                if data.get("type") == DatasourceType.WORDPRESS_PLUGIN:
                    data["api_key"] = data.pop("app_password")
                else:
                    if not data.get("password"):
                        data["password"] = data.pop("app_password")
        return data


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
    provider_account_id: Optional[str] = None  # Connected account for managed providers
    # WordPress Plugin specific fields for updates
    base_url: Optional[str] = None
    app_password: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def parse_connection_uri(cls, data: Any) -> Any:
        """Parse connection URI if provided."""
        data = _parse_uri_metadata(data)
        # Map WordPress Plugin fields to standard fields for updates
        if isinstance(data, dict) and data.get("type") in [
            DatasourceType.WORDPRESS_REST,
            DatasourceType.WORDPRESS_GRAPHQL,
            DatasourceType.WORDPRESS_PLUGIN,
        ]:
            # Map base_url → api_url
            if data.get("base_url") and not data.get("api_url"):
                data["api_url"] = _ensure_url_scheme(data.pop("base_url"))
            # Map app_password → password for REST/GraphQL, → api_key for Plugin
            if data.get("app_password"):
                if data.get("type") == DatasourceType.WORDPRESS_PLUGIN:
                    data["api_key"] = data.pop("app_password")
                else:
                    if not data.get("password"):
                        data["password"] = data.pop("app_password")
        return data


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

    @field_validator("filters", "visible_columns", "pinned_columns", "column_order", "webhooks", mode="before")
    @classmethod
    def list_fallback(cls, v: Any) -> list:
        return v if v is not None else []

    @field_validator("field_mappings", "linked_views", mode="before")
    @classmethod
    def dict_fallback(cls, v: Any) -> dict:
        return v if v is not None else {}


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

    model_config = {
        "from_attributes": True,
    }


class DatasourceResponse(BaseModel):
    """Schema for datasource response."""
    id: str
    name: str
    project_id: Optional[str] = None
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
    
    model_config = {
        "from_attributes": True,
    }


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
    # Foreign key fields
    is_foreign: bool = False
    foreign_table: Optional[str] = None
    foreign_column: Optional[str] = None

    model_config = {
        "extra": "ignore",
        "from_attributes": True,
    }

class TableSchema(BaseModel):
    """Schema for a table/resource."""
    columns: list[ColumnSchema]
    foreign_keys: List[Dict[str, Any]] = Field(default_factory=list)

