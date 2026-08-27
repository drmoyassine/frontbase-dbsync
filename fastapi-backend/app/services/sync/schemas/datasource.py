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
        if isinstance(v, str):
            # Convert to lowercase and match against enum values
            v_lower = v.lower()
            # Check if it matches any enum value
            for enum_member in DatasourceType:
                if enum_member.value == v_lower:
                    return DatasourceType(v_lower)
            # If no match, raise validation error
            valid_values = [e.value for e in DatasourceType]
            raise ValueError(
                f"Invalid datasource type '{v}'. Valid types: {valid_values}"
            )

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


_CREDENTIAL_FIELDS = ("password", "api_key", "anon_key", "app_password")


def _reject_inline_credentials(data: Any) -> Any:
    """Owner mandate (task #124): credentials only ever live in a Connected
    Account. Any non-empty inline credential field on create/test/update is
    rejected — empty strings pass (legacy clients send empty placeholders).
    """
    if isinstance(data, dict):
        for f in _CREDENTIAL_FIELDS:
            v = data.get(f)
            if v is not None and str(v).strip() != "":
                raise ValueError(
                    f"Inline {f!r} is not accepted - credentials live in a Connected "
                    "Account; connect one and reference it via provider_account_id."
                )
    return data


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
                # NOTE: the URI password is deliberately NOT extracted — credentials
                # only ever live in a Connected Account (owner mandate, task #124).
                # Structural fields (host/port/database/username) still auto-fill.
        except Exception as e:
            raise ValueError(f"Invalid connection URI: {str(e)}")
    return data


class DatasourceCreate(DatasourceBase):
    """Schema for creating a datasource.

    Credential lockdown (task #124 phase 5): a Connected Account is REQUIRED
    and inline credential fields are rejected — credentials are created and
    edited on the Connected Account, never on the datasource.
    """
    name: str = Field(..., min_length=1, max_length=255)
    provider_account_id: str  # FK to Connected Account — required (lockdown)

    @model_validator(mode="before")
    @classmethod
    def parse_connection_uri(cls, data: Any) -> Any:
        """Parse connection URI and map WordPress fields (non-secret parts)."""
        data = _reject_inline_credentials(data)
        data = _parse_uri_metadata(data)
        # Map WordPress base_url → api_url (non-secret URL convenience)
        if isinstance(data, dict) and data.get("type") in [
            DatasourceType.WORDPRESS_REST,
            DatasourceType.WORDPRESS_GRAPHQL,
            DatasourceType.WORDPRESS_PLUGIN,
        ]:
            if data.get("base_url") and not data.get("api_url"):
                data["api_url"] = _ensure_url_scheme(data.pop("base_url"))
            data.pop("app_password", None)  # rejected above if non-empty
        return data


class DatasourceTestRequest(BaseModel):
    """Schema for testing a new datasource connection."""
    name: Optional[str] = Field(None, max_length=255)
    type: DatasourceType
    host: Optional[str] = Field(None, max_length=255)
    port: Optional[int] = Field(None, ge=1, le=65535)
    database: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = None
    connection_uri: Optional[str] = None
    api_url: Optional[str] = None
    table_prefix: str = Field(default="wp_", max_length=50)
    base_url: Optional[str] = None
    extra_config: Optional[Dict[str, Any]] = None
    provider_account_id: str  # Connected Account — required (credential lockdown)

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
        """Parse connection URI if provided (non-secret parts only)."""
        data = _reject_inline_credentials(data)
        data = _parse_uri_metadata(data)
        if isinstance(data, dict) and data.get("type") in [
            DatasourceType.WORDPRESS_REST,
            DatasourceType.WORDPRESS_GRAPHQL,
            DatasourceType.WORDPRESS_PLUGIN,
        ]:
            if data.get("base_url") and not data.get("api_url"):
                data["api_url"] = _ensure_url_scheme(data.pop("base_url"))
            data.pop("app_password", None)  # rejected above if non-empty
        return data


class DatasourceUpdate(BaseModel):
    """Schema for updating a datasource."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    host: Optional[str] = None
    port: Optional[int] = Field(None, ge=1, le=65535)
    database: Optional[str] = None
    username: Optional[str] = None
    connection_uri: Optional[str] = None
    api_url: Optional[str] = None
    table_prefix: Optional[str] = None
    extra_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    provider_account_id: Optional[str] = None  # Connected account for managed providers
    base_url: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def parse_connection_uri(cls, data: Any) -> Any:
        """Parse connection URI if provided (non-secret parts only)."""
        data = _reject_inline_credentials(data)
        data = _parse_uri_metadata(data)
        if isinstance(data, dict) and data.get("type") in [
            DatasourceType.WORDPRESS_REST,
            DatasourceType.WORDPRESS_GRAPHQL,
            DatasourceType.WORDPRESS_PLUGIN,
        ]:
            if data.get("base_url") and not data.get("api_url"):
                data["api_url"] = _ensure_url_scheme(data.pop("base_url"))
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

