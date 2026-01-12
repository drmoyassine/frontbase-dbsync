"""
Publish Contract Schemas (Phase 4)

Pydantic schemas for the FastAPI → Hono publish contract.
These mirror the Zod schemas in Hono.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


# =============================================================================
# Datasource Types
# =============================================================================

class DatasourceType(str, Enum):
    SUPABASE = "supabase"
    NEON = "neon"
    PLANETSCALE = "planetscale"
    TURSO = "turso"
    POSTGRES = "postgres"
    MYSQL = "mysql"
    SQLITE = "sqlite"


class DatasourceConfig(BaseModel):
    """Datasource configuration (non-sensitive parts only)"""
    id: str
    type: DatasourceType
    name: str
    url: Optional[str] = None  # Safe to publish (no password)
    anon_key: Optional[str] = Field(None, alias="anonKey")  # For Supabase - safe to publish
    secret_env_var: Optional[str] = Field(None, alias="secretEnvVar")  # Env var name, not the actual secret
    
    class Config:
        populate_by_name = True


# =============================================================================
# Component Bindings
# =============================================================================

class ColumnOverride(BaseModel):
    """Column-specific overrides"""
    visible: Optional[bool] = None
    label: Optional[str] = None
    width: Optional[str] = None
    sortable: Optional[bool] = None
    filterable: Optional[bool] = None
    type: Optional[str] = None


class ForeignKey(BaseModel):
    """Foreign key reference"""
    column: str
    referenced_table: str = Field(..., alias="referencedTable")
    referenced_column: str = Field(..., alias="referencedColumn")
    
    class Config:
        populate_by_name = True


class DataRequest(BaseModel):
    """
    Pre-computed HTTP request spec for data fetching.
    Computed at publish time so Hono doesn't need adapter logic.
    """
    url: str  # Full URL with query params (may contain {{ENV_VAR}} placeholders)
    method: str = "GET"  # HTTP method
    headers: Dict[str, str] = {}  # Headers (may contain {{ENV_VAR}} placeholders)
    body: Optional[Dict[str, Any]] = None  # For POST requests (SQL queries)
    result_path: str = Field("", alias="resultPath")  # JSON path to extract data (e.g., "rows", "data")
    flatten_relations: bool = Field(True, alias="flattenRelations")  # Flatten nested objects to "table.column"
    query_config: Optional[Dict[str, Any]] = Field(None, alias="queryConfig")  # Added for DataTable RPC config
    
    class Config:
        populate_by_name = True


class ComponentBinding(BaseModel):
    """Data binding for data-driven components"""
    component_id: str = Field(..., alias="componentId")
    datasource_id: Optional[str] = Field(None, alias="datasourceId")
    table_name: Optional[str] = Field(None, alias="tableName")
    columns: Optional[List[str]] = None
    column_order: Optional[List[str]] = Field(None, alias="columnOrder")  # Added for React DataTable support
    column_overrides: Optional[Dict[str, ColumnOverride]] = Field(None, alias="columnOverrides")
    
    # Dynamic feature configuration
    frontend_filters: Optional[List[Dict[str, Any]]] = Field(None, alias="frontendFilters")
    sorting: Optional[Dict[str, Any]] = None
    pagination: Optional[Dict[str, Any]] = None
    filtering: Optional[Dict[str, Any]] = None
    
    filters: Optional[Dict[str, Any]] = None
    primary_key: Optional[str] = Field(None, alias="primaryKey")
    foreign_keys: Optional[List[ForeignKey]] = Field(None, alias="foreignKeys")
    data_request: Optional[DataRequest] = Field(None, alias="dataRequest")  # Pre-computed HTTP request
    
    class Config:
        populate_by_name = True


# =============================================================================
# Page Component (Recursive)
# =============================================================================

class PageComponent(BaseModel):
    """Recursive page component structure"""
    id: str
    type: str
    props: Optional[Dict[str, Any]] = None
    styles: Optional[Dict[str, Any]] = None
    children: Optional[List["PageComponent"]] = None
    binding: Optional[ComponentBinding] = None
    
    class Config:
        populate_by_name = True


# Allow self-reference
PageComponent.model_rebuild()


# =============================================================================
# Page Layout
# =============================================================================

class PageLayout(BaseModel):
    """Page layout structure"""
    content: List[PageComponent]
    root: Optional[Dict[str, Any]] = None


# =============================================================================
# SEO Data
# =============================================================================

class SeoData(BaseModel):
    """SEO metadata"""
    title: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[List[str]] = None
    og_image: Optional[str] = Field(None, alias="ogImage")
    canonical: Optional[str] = None
    
    class Config:
        populate_by_name = True


# =============================================================================
# Published Page Bundle (Main Schema)
# =============================================================================

class PublishPageRequest(BaseModel):
    """Page bundle to publish to Hono"""
    # Page identity
    id: str
    slug: str
    name: str
    title: Optional[str] = None
    description: Optional[str] = None
    
    # Layout & structure
    layout_data: PageLayout = Field(..., alias="layoutData")
    
    # SEO
    seo_data: Optional[SeoData] = Field(None, alias="seoData")
    
    # Datasources (non-sensitive config only)
    datasources: Optional[List[DatasourceConfig]] = None
    
    # Versioning
    version: int = 1
    published_at: str = Field(..., alias="publishedAt")
    
    # Flags
    is_public: bool = Field(True, alias="isPublic")
    is_homepage: bool = Field(False, alias="isHomepage")
    
    class Config:
        populate_by_name = True


# =============================================================================
# Import Request/Response (to send to Hono)
# =============================================================================

class ImportPagePayload(BaseModel):
    """Payload to send to Hono /api/import"""
    page: PublishPageRequest
    force: bool = False


class ImportPageResponse(BaseModel):
    """Response from Hono /api/import"""
    success: bool
    slug: Optional[str] = None
    version: Optional[int] = None
    preview_url: Optional[str] = Field(None, alias="previewUrl")
    message: Optional[str] = None
    error: Optional[str] = None
    
    class Config:
        populate_by_name = True


# =============================================================================
# Publish Endpoint Response
# =============================================================================

class PublishResponse(BaseModel):
    """Response from FastAPI publish endpoint"""
    success: bool
    message: Optional[str] = None
    preview_url: Optional[str] = None
    version: Optional[int] = None
    error: Optional[str] = None
