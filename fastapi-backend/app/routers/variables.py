from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database.utils import get_db, create_variable, get_all_variables
from ..models.schemas import (
    VariableCreateRequest, VariableUpdateRequest, VariableResponse,
    SuccessResponse, ErrorResponse, MessageResponse
)
from ..middleware.tenant_context import TenantContext, get_tenant_context

router = APIRouter(prefix="/api/variables", tags=["variables"])

@router.get("/", response_model=List[VariableResponse])
async def get_variables(db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Get all variables"""
    variables = get_all_variables(db, ctx)
    return variables

@router.post("/", response_model=VariableResponse)
async def create_variable_endpoint(request: VariableCreateRequest, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Create a new variable"""
    variable = create_variable(db, request.model_dump(), ctx)
    return variable


# =============================================================================
# Template Variables Registry (for Builder @ mention autocomplete)
# =============================================================================

from pydantic import BaseModel
from typing import Optional

class TemplateVariable(BaseModel):
    path: str
    type: str
    source: str
    description: Optional[str] = None

class TemplateFilter(BaseModel):
    name: str
    args: Optional[List[str]] = None
    description: str
    # Picker category (Text/Numbers/Lists/Dates/Format). Absent → 'Format'.
    category: Optional[str] = None

class TemplateRegistryResponse(BaseModel):
    variables: List[TemplateVariable]
    filters: List[TemplateFilter]


# Static template variables (all 9 scopes)
STATIC_VARIABLES = [
    # Page
    TemplateVariable(path="page.id", type="string", source="page", description="Page ID"),
    TemplateVariable(path="page.title", type="string", source="page", description="Page title"),
    TemplateVariable(path="page.slug", type="string", source="page", description="Page slug/URL"),
    TemplateVariable(path="page.url", type="string", source="page", description="Full page URL"),
    TemplateVariable(path="page.description", type="string", source="page", description="Meta description"),
    TemplateVariable(path="page.image", type="string", source="page", description="OG image URL"),
    TemplateVariable(path="page.type", type="string", source="page", description="OpenGraph type"),
    TemplateVariable(path="page.custom.*", type="object", source="page", description="Custom page variables"),
    
    # User
    TemplateVariable(path="user.id", type="string", source="user", description="User ID"),
    TemplateVariable(path="user.email", type="string", source="user", description="Email address"),
    TemplateVariable(path="user.name", type="string", source="user", description="Full name"),
    TemplateVariable(path="user.firstName", type="string", source="user", description="First name"),
    TemplateVariable(path="user.lastName", type="string", source="user", description="Last name"),
    TemplateVariable(path="user.avatar", type="string", source="user", description="Avatar URL"),
    TemplateVariable(path="user.role", type="string", source="user", description="User role"),
    TemplateVariable(path="user.*", type="object", source="user", description="Any contact field"),
    
    # Visitor
    TemplateVariable(path="visitor.ip", type="string", source="visitor", description="IP address"),
    TemplateVariable(path="visitor.country", type="string", source="visitor", description="Country code"),
    TemplateVariable(path="visitor.city", type="string", source="visitor", description="City"),
    TemplateVariable(path="visitor.timezone", type="string", source="visitor", description="Timezone"),
    TemplateVariable(path="visitor.device", type="string", source="visitor", description="Device type"),
    TemplateVariable(path="visitor.browser", type="string", source="visitor", description="Browser name"),
    TemplateVariable(path="visitor.os", type="string", source="visitor", description="Operating system"),
    TemplateVariable(path="visitor.language", type="string", source="visitor", description="Preferred language"),
    
    # URL
    TemplateVariable(path="url.*", type="string", source="url", description="Query parameter"),
    
    # System
    TemplateVariable(path="system.date", type="string", source="system", description="Current date (UTC)"),
    TemplateVariable(path="system.time", type="string", source="system", description="Current time (UTC)"),
    TemplateVariable(path="system.datetime", type="string", source="system", description="ISO timestamp (UTC)"),
    TemplateVariable(path="system.year", type="number", source="system", description="Current year"),
    TemplateVariable(path="system.month", type="number", source="system", description="Current month"),
    TemplateVariable(path="system.day", type="number", source="system", description="Current day"),
    
    # Record (data binding)
    TemplateVariable(path="record.*", type="any", source="record", description="Data record field"),
    
    # User-defined
    TemplateVariable(path="local.*", type="any", source="local", description="Page-level variable"),
    TemplateVariable(path="session.*", type="any", source="session", description="Session variable"),
    TemplateVariable(path="cookies.*", type="string", source="cookies", description="Cookie value"),
]

# Built-in and custom filters. Categorized; kept in sync with the frontend
# offline fallback in src/hooks/useVariables.ts getDefaultVariables().
TEMPLATE_FILTERS = [
    # ── Text ──────────────────────────────────────────────
    TemplateFilter(name="upcase", description="Convert to UPPERCASE", category="Text"),
    TemplateFilter(name="downcase", description="Convert to lowercase", category="Text"),
    TemplateFilter(name="capitalize", description="Capitalize the first letter", category="Text"),
    TemplateFilter(name="strip", description="Trim whitespace from both ends", category="Text"),
    TemplateFilter(name="strip_html", description="Remove HTML tags", category="Text"),
    TemplateFilter(name="newline_to_br", description="Turn line breaks into <br>", category="Text"),
    TemplateFilter(name="truncate", args=["length"], description="Cut to a max length (with …)", category="Text"),
    TemplateFilter(name="truncate_words", args=["count"], description="Cut to N words (with …)", category="Text"),
    TemplateFilter(name="replace", args=["search", "replacement"], description="Replace all matches", category="Text"),
    TemplateFilter(name="remove", args=["text"], description="Remove all matches", category="Text"),
    TemplateFilter(name="append", args=["text"], description="Add text to the end", category="Text"),
    TemplateFilter(name="prepend", args=["text"], description="Add text to the start", category="Text"),
    TemplateFilter(name="slugify", description="Make a URL-friendly slug", category="Text"),
    TemplateFilter(name="escape_html", description="Escape HTML special characters", category="Text"),
    TemplateFilter(name="url_encode", description="URL-encode for use in links", category="Text"),

    # ── Numbers ───────────────────────────────────────────
    TemplateFilter(name="plus", args=["number"], description="Add", category="Numbers"),
    TemplateFilter(name="minus", args=["number"], description="Subtract", category="Numbers"),
    TemplateFilter(name="times", args=["number"], description="Multiply", category="Numbers"),
    TemplateFilter(name="divided_by", args=["number"], description="Divide", category="Numbers"),
    TemplateFilter(name="modulo", args=["number"], description="Remainder", category="Numbers"),
    TemplateFilter(name="round", args=["decimals"], description="Round (default 0 decimals)", category="Numbers"),
    TemplateFilter(name="ceil", description="Round up", category="Numbers"),
    TemplateFilter(name="floor", description="Round down", category="Numbers"),
    TemplateFilter(name="abs", description="Absolute value", category="Numbers"),
    TemplateFilter(name="at_least", args=["number"], description="Minimum value", category="Numbers"),
    TemplateFilter(name="at_most", args=["number"], description="Maximum value", category="Numbers"),
    TemplateFilter(name="size", description="Length of text or list", category="Numbers"),

    # ── Lists ─────────────────────────────────────────────
    TemplateFilter(name="split", args=["delimiter"], description="Split text into a list", category="Lists"),
    TemplateFilter(name="join", args=["separator"], description="Join a list into text", category="Lists"),
    TemplateFilter(name="first", description="First item of a list", category="Lists"),
    TemplateFilter(name="last", description="Last item of a list", category="Lists"),
    TemplateFilter(name="map", args=["field"], description="Pick a field from each item (operates on a list)", category="Lists"),
    TemplateFilter(name="where", args=["field", "value"], description="Keep items where field = value (operates on a list)", category="Lists"),
    TemplateFilter(name="sort", args=["property"], description="Sort (by property)", category="Lists"),
    TemplateFilter(name="sort_natural", args=["property"], description="Case-insensitive sort", category="Lists"),
    TemplateFilter(name="reverse", description="Reverse a list or text", category="Lists"),
    TemplateFilter(name="uniq", description="Remove duplicates (operates on a list)", category="Lists"),
    TemplateFilter(name="compact", description="Remove blank items (operates on a list)", category="Lists"),
    TemplateFilter(name="slice", args=["start", "length"], description="Take a slice", category="Lists"),

    # ── Dates ─────────────────────────────────────────────
    TemplateFilter(name="date", args=["format"], description="Format a date (strftime)", category="Dates"),
    TemplateFilter(name="date_format", args=["format"], description="Format (short/long/iso/time)", category="Dates"),
    TemplateFilter(name="time_ago", description="Relative time (2 days ago)", category="Dates"),
    TemplateFilter(name="timezone", args=["tz"], description="Convert timezone", category="Dates"),

    # ── Format ────────────────────────────────────────────
    TemplateFilter(name="default", args=["value"], description="Fallback if empty", category="Format"),
    TemplateFilter(name="json", description="Output as JSON", category="Format"),
    TemplateFilter(name="money", args=["currency"], description="Currency ($29.99)", category="Format"),
    TemplateFilter(name="number", args=["locale"], description="Number with separators (1,234)", category="Format"),
    TemplateFilter(name="percent", args=["decimals"], description="Percentage", category="Format"),
    TemplateFilter(name="pluralize", args=["singular", "plural"], description="Singular/plural by count", category="Format"),
]


@router.get("/registry/", response_model=TemplateRegistryResponse)
async def get_template_registry(page_id: Optional[str] = None, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """
    Get available template variables and filters for Builder autocomplete.
    
    Returns variable scopes (page, user, visitor, url, system, record, local, session, cookies).
    User variables are dynamically loaded from the configured contacts table schema.
    
    If page_id is provided, could include page-specific custom variables (future feature).
    """
    import json
    from ..database.utils import get_project
    from ..services.sync.models.table_schema import TableSchemaCache
    
    # Start with all static variables except user scope
    variables = [v for v in STATIC_VARIABLES if v.source != 'user']
    
    # Load page-specific custom variables
    if page_id:
        try:
            from ..models.models import Page, Project
            query = db.query(Page).filter(Page.id == page_id)
            if ctx and ctx.tenant_id and not ctx.is_master:
                project_ids = (
                    db.query(Project.id)
                    .filter(Project.tenant_id == ctx.tenant_id)
                    .scalar_subquery()
                )
                query = query.filter(Page.project_id.in_(project_ids))
            elif ctx and ctx.is_master:
                query = query.filter(Page.project_id == None)  # noqa: E711
                
            page = query.first()
            if not page:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Page not found"
                )
            
            if page.layout_data:  # type: ignore[truthy-bool]
                layout = page.layout_data
                if isinstance(layout, str):
                    try:
                        layout = json.loads(layout)
                    except Exception:
                        layout = {}
                if isinstance(layout, dict):
                    root_config = layout.get("root", {})
                    if isinstance(root_config, dict):
                        # Local variables
                        local_vars = root_config.get("localVariables", {})
                        if isinstance(local_vars, dict):
                            for name, val_info in local_vars.items():
                                val_type = "any"
                                val_default = ""
                                if isinstance(val_info, dict):
                                    val_type = val_info.get("type", "string")
                                    val_default = val_info.get("defaultValue", "")
                                else:
                                    val_default = val_info
                                    if isinstance(val_info, bool):
                                        val_type = "boolean"
                                    elif isinstance(val_info, (int, float)):
                                        val_type = "number"
                                    elif isinstance(val_info, list):
                                        val_type = "array"
                                    elif isinstance(val_info, dict):
                                        val_type = "object"
                                    else:
                                        val_type = "string"
                                
                                variables.append(TemplateVariable(
                                    path=f"local.{name}",
                                    type=val_type,
                                    source="local",
                                    description=f"Local variable (default: {val_default})"
                                ))
                        # Session variables
                        session_vars = root_config.get("sessionVariables", {})
                        if isinstance(session_vars, dict):
                            for name, val_info in session_vars.items():
                                val_type = "any"
                                val_default = ""
                                if isinstance(val_info, dict):
                                    val_type = val_info.get("type", "string")
                                    val_default = val_info.get("defaultValue", "")
                                else:
                                    val_default = val_info
                                    if isinstance(val_info, bool):
                                        val_type = "boolean"
                                    elif isinstance(val_info, (int, float)):
                                        val_type = "number"
                                    elif isinstance(val_info, list):
                                        val_type = "array"
                                    elif isinstance(val_info, dict):
                                        val_type = "object"
                                    else:
                                        val_type = "string"
                                
                                variables.append(TemplateVariable(
                                    path=f"session.{name}",
                                    type=val_type,
                                    source="session",
                                    description=f"Session variable (default: {val_default})"
                                ))
        except Exception as e:
            print(f"Warning: Failed to load page-specific custom variables: {e}")

    # Try to load dynamic user variables from contacts table
    try:
        project = get_project(db, ctx)
        
        if project and project.users_config:  # type: ignore[truthy-bool]
            users_config = json.loads(str(project.users_config))
            contacts_table = users_config.get('contactsTable')
            datasource_id = users_config.get('contactsDbId') or users_config.get('authDataSourceId')
            
            if contacts_table and datasource_id:
                # Query SQLite cache for table schema
                cached_schema = db.query(TableSchemaCache).filter(
                    TableSchemaCache.datasource_id == datasource_id,
                    TableSchemaCache.table_name == contacts_table
                ).first()
                
                if cached_schema and cached_schema.columns:
                    # Convert each column to a user.* template variable
                    for col in cached_schema.columns:
                        col_name = col.get('name')
                        col_type = col.get('type', 'text')
                        
                        if col_name:
                            variables.append(TemplateVariable(
                                path=f"user.{col_name}",
                                type=_map_column_type(col_type),
                                source='user',
                                description=col.get('comment') or f"{col_name}"
                            ))
    except Exception as e:
        # Log error but don't fail - just proceed without user variables
        print(f"Warning: Failed to load dynamic user variables: {e}")
        import traceback
        traceback.print_exc()
    
    # Note: We do NOT fallback to static user variables
    # If users are not configured, user.* variables will be empty
    
    return TemplateRegistryResponse(
        variables=variables,
        filters=TEMPLATE_FILTERS
    )


def _map_column_type(pg_type: str) -> str:
    """Map PostgreSQL column types to template variable types."""
    type_mapping = {
        'uuid': 'string',
        'text': 'string',
        'varchar': 'string',
        'character varying': 'string',
        'character': 'string',
        'char': 'string',
        'integer': 'number',
        'bigint': 'number',
        'smallint': 'number',
        'int': 'number',
        'int4': 'number',
        'int8': 'number',
        'int2': 'number',
        'numeric': 'number',
        'decimal': 'number',
        'real': 'number',
        'double precision': 'number',
        'boolean': 'boolean',
        'bool': 'boolean',
        'json': 'object',
        'jsonb': 'object',
        'array': 'array',
        'timestamp': 'string',
        'timestamptz': 'string',
        'timestamp with time zone': 'string',
        'timestamp without time zone': 'string',
        'date': 'string',
        'time': 'string',
    }
    # Extract base type (handle cases like "character varying(255)")
    base_type = pg_type.lower().split('(')[0].strip()
    return type_mapping.get(base_type, 'any')

@router.get("/{variable_id}", response_model=VariableResponse)
async def get_variable(variable_id: str, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Get a variable by ID"""
    from ..models.models import AppVariable
    from ..database.utils import get_project
    
    query = db.query(AppVariable).filter(AppVariable.id == variable_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(AppVariable.project_id == project.id)
        else:
            raise HTTPException(status_code=404, detail="Variable not found")
            
    variable = query.first()
    if not variable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variable not found"
        )
    
    return variable

@router.put("/{variable_id}/", response_model=VariableResponse)
async def update_variable_endpoint(variable_id: str, request: VariableUpdateRequest, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Update a variable"""
    from ..models.models import AppVariable
    from ..database.utils import get_current_timestamp, get_project
    
    query = db.query(AppVariable).filter(AppVariable.id == variable_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(AppVariable.project_id == project.id)
        else:
            raise HTTPException(status_code=404, detail="Variable not found")
            
    variable = query.first()
    if not variable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variable not found"
        )
    
    # Update fields
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(variable, field, value)
    
    db.commit()
    db.refresh(variable)
    return variable

@router.delete("/{variable_id}/", response_model=MessageResponse)
async def delete_variable(variable_id: str, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Delete a variable"""
    from ..models.models import AppVariable
    from ..database.utils import get_project
    
    query = db.query(AppVariable).filter(AppVariable.id == variable_id)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            query = query.filter(AppVariable.project_id == project.id)
        else:
            raise HTTPException(status_code=404, detail="Variable not found")
            
    variable = query.first()
    if not variable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variable not found"
        )
    
    db.delete(variable)
    db.commit()
    
    return {"message": "Variable deleted successfully"}

