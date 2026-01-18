from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database.utils import get_db, create_variable, get_all_variables
from ..models.schemas import (
    VariableCreateRequest, VariableUpdateRequest, VariableResponse,
    SuccessResponse, ErrorResponse
)

router = APIRouter(prefix="/api/variables", tags=["variables"])

@router.get("/", response_model=List[VariableResponse])
async def get_variables(db: Session = Depends(get_db)):
    """Get all variables"""
    variables = get_all_variables(db)
    return variables

@router.post("/", response_model=VariableResponse)
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

@router.put("/{variable_id}/", response_model=VariableResponse)
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

@router.delete("/{variable_id}/")
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

# Built-in and custom filters
TEMPLATE_FILTERS = [
    # LiquidJS built-in
    TemplateFilter(name="upcase", description="Convert to uppercase"),
    TemplateFilter(name="downcase", description="Convert to lowercase"),
    TemplateFilter(name="capitalize", description="Capitalize first letter"),
    TemplateFilter(name="truncate", args=["length"], description="Truncate to length"),
    TemplateFilter(name="strip", description="Remove whitespace"),
    TemplateFilter(name="split", args=["delimiter"], description="Split into array"),
    TemplateFilter(name="join", args=["separator"], description="Join array to string"),
    TemplateFilter(name="first", description="First item of array"),
    TemplateFilter(name="last", description="Last item of array"),
    TemplateFilter(name="size", description="Length of array/string"),
    TemplateFilter(name="plus", args=["number"], description="Add number"),
    TemplateFilter(name="minus", args=["number"], description="Subtract number"),
    TemplateFilter(name="times", args=["number"], description="Multiply by number"),
    TemplateFilter(name="divided_by", args=["number"], description="Divide by number"),
    TemplateFilter(name="round", description="Round to nearest integer"),
    TemplateFilter(name="default", args=["value"], description="Default if empty"),
    TemplateFilter(name="date", args=["format"], description="Format date"),
    
    # Custom Frontbase filters
    TemplateFilter(name="money", args=["currency"], description="Format as currency ($29.99)"),
    TemplateFilter(name="time_ago", description="Relative time (2 days ago)"),
    TemplateFilter(name="timezone", args=["tz"], description="Convert timezone"),
    TemplateFilter(name="date_format", args=["format"], description="Format date (short/long/iso)"),
    TemplateFilter(name="json", description="JSON stringify"),
    TemplateFilter(name="pluralize", args=["singular", "plural"], description="Pluralize based on count"),
    TemplateFilter(name="escape_html", description="Escape HTML entities"),
    TemplateFilter(name="truncate_words", args=["count"], description="Truncate by word count"),
    TemplateFilter(name="slugify", description="Convert to URL slug"),
    TemplateFilter(name="number", args=["locale"], description="Format number with commas"),
    TemplateFilter(name="percent", args=["decimals"], description="Format as percentage"),
]


@router.get("/registry/", response_model=TemplateRegistryResponse)
async def get_template_registry(page_id: Optional[str] = None, db: Session = Depends(get_db)):
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
    
    # Try to load dynamic user variables from contacts table
    try:
        project = get_project(db)
        
        if project and project.users_config:
            users_config = json.loads(project.users_config)
            contacts_table = users_config.get('contactsTable')
            datasource_id = users_config.get('authDataSourceId')
            
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
