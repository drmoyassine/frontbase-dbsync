from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from ..models.schemas import DatabaseConnectionRequest, DatabaseConnectionResponse, SuccessResponse, ErrorResponse
from ..database.config import get_db
from ..database.utils import get_project_settings, update_project_settings, decrypt_data, encrypt_data
import httpx
import json
from typing import Optional, List, Dict, Any

router = APIRouter(prefix="/api/database", tags=["database"])

async def get_project_context(db: Session, mode: str = "builder"):
    """Get project context (Supabase URL and Auth Key)
    
    For builder mode: Uses service role key if available, falls back to anon key
    For other modes: Uses anon key
    """
    project = get_project_settings(db, "default")
    if not project or not project.get("supabase_url"):
        raise HTTPException(status_code=404, detail="Supabase connection not configured")
    
    url = project["supabase_url"]
    anon_key = project.get("supabase_anon_key")
    encrypted_service_key = project.get("supabase_service_key_encrypted")
    
    auth_key = None
    auth_method = "anon"
    
    if mode == "builder":
        # Try service key first, fall back to anon key
        if encrypted_service_key:
            try:
                # Check if it's JSON (Express format)
                try:
                    key_data = json.loads(encrypted_service_key)
                    if isinstance(key_data, dict) and 'encrypted' in key_data:
                        print("Warning: Credentials encrypted with old Express method. Falling back to anon key.")
                        auth_key = anon_key
                        auth_method = "anon_fallback"
                except (ValueError, TypeError):
                    pass
                
                if not auth_key:
                    auth_key = decrypt_data(encrypted_service_key)
                    auth_method = "service_role"
            except Exception as e:
                print(f"Decryption error: {e}. Falling back to anon key.")
                auth_key = anon_key
                auth_method = "anon_fallback"
        else:
            # No service key, use anon key
            print("No service key configured. Using anon key for builder mode.")
            auth_key = anon_key
            auth_method = "anon"
    else:
        auth_key = anon_key

    return {
        "url": url,
        "anon_key": anon_key,
        "auth_key": auth_key,
        "auth_method": auth_method
    }

@router.get("/connections/", response_model=DatabaseConnectionResponse)
async def get_connections(db: Session = Depends(get_db)):
    """Get database connections"""
    try:
        # Get project-level Supabase settings
        project = get_project_settings(db, "default")
        
        connections_list = [
            {
                "name": "supabase",
                "type": "supabase",
                "connected": bool(project and project.get("supabase_url") and project.get("supabase_anon_key")),
                "status": "active" if bool(project and project.get("supabase_url") and project.get("supabase_anon_key")) else "inactive",
                "url": project.get("supabase_url", "") if project else "",
                "hasServiceKey": bool(project and project.get("supabase_service_key_encrypted"))
            }
        ]
        
        return DatabaseConnectionResponse(
            success=True,
            message="Connections retrieved successfully",
            data={
                "supabase": {
                    "connected": bool(project and project.get("supabase_url") and project.get("supabase_anon_key")),
                    "url": project.get("supabase_url", "") if project else "",
                    "hasServiceKey": bool(project and project.get("supabase_service_key_encrypted"))
                }
            }
        )
    except Exception as error:
        print(f"Get connections error: {error}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get connections"
        )

@router.post("/test-supabase/", response_model=SuccessResponse)
async def test_supabase(request: DatabaseConnectionRequest):
    """Test Supabase connection credentials - tries service key first, falls back to anon key"""
    try:
        url = request.url
        anon_key = request.anonKey
        service_key = request.serviceKey if hasattr(request, 'serviceKey') and request.serviceKey else None
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Try service key first if provided
            if service_key:
                response = await client.get(
                    f"{url}/rest/v1/",
                    headers={
                        'apikey': service_key,
                        'Authorization': f"Bearer {service_key}"
                    }
                )
                
                if response.is_success:
                    return SuccessResponse(
                        success=True,
                        message="Successfully connected with Service Role Key. Full admin access available."
                    )
                else:
                    # Service key failed, warn user
                    print(f"Service key test failed: {response.status_code}")
            
            # Fall back to anon key
            response = await client.get(
                f"{url}/rest/v1/",
                headers={
                    'apikey': anon_key,
                    'Authorization': f"Bearer {anon_key}"
                }
            )
            
            if response.is_success:
                if service_key:
                    # Service key was provided but failed
                    return SuccessResponse(
                        success=True,
                        message="Connected with Anon Key only. Service Role Key verification failed. Some admin features (users, RLS, storage, edge functions) may be unavailable."
                    )
                else:
                    return SuccessResponse(
                        success=True,
                        message="Connected with Anon Key. For full admin access (users, RLS, storage, edge functions), please add a Service Role Key."
                    )
            else:
                return SuccessResponse(
                    success=False,
                    message=f"Failed to connect: {response.status_code} - Invalid credentials"
                )
    except Exception as e:
        print(f"Test connection error: {e}")
        return SuccessResponse(
            success=False,
            message=f"Unable to reach Supabase server: {str(e)}"
        )

# Duplicate function removed

@router.get("/table-data/{table_name}/")
async def get_table_data(
    table_name: str,
    request: Request,
    limit: int = 20,
    offset: int = 0,
    orderBy: Optional[str] = None,
    orderDirection: Optional[str] = "asc",
    mode: str = "builder",
    select: str = "*",
    db: Session = Depends(get_db)
):
    """Get table data with pagination and filtering"""
    try:
        ctx = await get_project_context(db, mode)
        
        # Build query URL like Express does
        query_url = f"{ctx['url']}/rest/v1/{table_name}?select={select}"
        query_url += f"&limit={limit}&offset={offset}"
        
        # Add sorting
        if orderBy:
            direction = "desc" if orderDirection == "desc" else "asc"
            query_url += f"&order={orderBy}.{direction}"
        
        # Get filter parameters from query string
        query_params = dict(request.query_params)
        for key, value in query_params.items():
            if key.startswith('filter_') and value:
                filter_column = key.replace('filter_', '')
                if filter_column != 'search':
                    query_url += f"&{filter_column}=eq.{value}"
        
        # Handle global search
        search_value = query_params.get('filter_search', '')
        if search_value:
            # Try to detect text columns from a sample
            async with httpx.AsyncClient() as client:
                sample_response = await client.get(
                    f"{ctx['url']}/rest/v1/{table_name}?limit=1",
                    headers={
                        'apikey': ctx['auth_key'],
                        'Authorization': f"Bearer {ctx['auth_key']}"
                    }
                )
                if sample_response.is_success:
                    sample_data = sample_response.json()
                    if sample_data and len(sample_data) > 0:
                        text_columns = [k for k, v in sample_data[0].items() if isinstance(v, str)]
                        if text_columns:
                            search_val = f"*{search_value}*"
                            or_filter = ",".join([f"{col}.ilike.{search_val}" for col in text_columns])
                            query_url += f"&or=({or_filter})"
        
        print(f"Query URL: {query_url}")
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                query_url,
                headers={
                    'apikey': ctx['auth_key'],
                    'Authorization': f"Bearer {ctx['auth_key']}",
                    'Content-Type': 'application/json',
                    'Prefer': 'count=exact'
                }
            )
            
        if not response.is_success:
            error_text = response.text
            print(f"Table data error response: {error_text}")
            
            if response.status_code == 401 or 'RLS' in error_text:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Access denied: Table may have Row Level Security enabled. {error_text}"
                )
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch data for table {table_name}: {error_text}"
            )
            
        # Get total count from Content-Range header (format: 0-49/100)
        total = 0
        content_range = response.headers.get("Content-Range")
        if content_range and "/" in content_range:
            total_str = content_range.split("/")[-1]
            if total_str != "*":
                total = int(total_str)
        else:
            data = response.json()
            total = len(data) if isinstance(data, list) else 0
        
        data = response.json()
        return {
            "success": True,
            "message": "Data retrieved successfully",
            "data": data if isinstance(data, list) else [],
            "total": total,
            "authMethod": "service_key" if mode == "builder" else "anon"
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Get table data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/distinct-values/")
async def get_distinct_values(request: dict, db: Session = Depends(get_db)):
    """Get distinct values for a column"""
    try:
        ctx = await get_project_context(db, "builder")
        table_name = request.get("tableName")
        column = request.get("column")
        
        async with httpx.AsyncClient() as client:
            # We'll try the dedicated RPC first
            response = await client.post(
                f"{ctx['url']}/rest/v1/rpc/frontbase_get_distinct_values",
                json={
                    "t_name": table_name,
                    "c_name": column
                },
                headers={
                    'apikey': ctx['auth_key'],
                    'Authorization': f"Bearer {ctx['auth_key']}",
                    'Content-Type': 'application/json'
                }
            )
            
            if response.status_code == 404:
                # Fallback: Try a select query
                response = await client.get(
                    f"{ctx['url']}/rest/v1/{table_name}",
                    params={
                        "select": column,
                        "limit": 1000
                    },
                    headers={
                        'apikey': ctx['auth_key'],
                        'Authorization': f"Bearer {ctx['auth_key']}"
                    }
                )
                if response.is_success:
                    data = response.json()
                    distinct_values = sorted(list(set([row.get(column) for row in data if row.get(column) is not None])))
                    return {
                        "success": True,
                        "data": distinct_values
                    }

        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to get distinct values: {response.text}")
            
        return {
            "success": True,
            "data": response.json()
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Distinct values error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/advanced-query/")
async def advanced_query(request: dict, db: Session = Depends(get_db)):
    """Execute advanced query"""
    try:
        ctx = await get_project_context(db, "builder")
        rpc_name = request.get("rpcName")
        params = request.get("params", {})
        
        # Determine if we are calling a real RPC or a mock for schema
        if rpc_name == "frontbase_get_schema_info":
             # We can try to fetch the real schema info if the function exists in Supabase
             # For now, let's keep it somewhat compatible with what Frontbase expects
             pass
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{ctx['url']}/rest/v1/rpc/{rpc_name}",
                json=params,
                headers={
                    'apikey': ctx['auth_key'],
                    'Authorization': f"Bearer {ctx['auth_key']}"
                }
            )
            
        if not response.is_success:
            print(f"Advanced query error: {response.text}")
            # If RPC doesn't exist, we might want to return mock/manual schema info
            raise HTTPException(status_code=response.status_code, detail=f"RPC {rpc_name} failed: {response.text}")
        
        # Parse response
        result_data = response.json()
        
        # Handle both array and object responses
        if isinstance(result_data, list):
            return {
                "success": True,
                "data": result_data,
                "rows": result_data  # Frontend expects 'rows' for RPC results
            }
        else:
            # If response is an object, it may already have rows/total
            return {
                "success": True,
                **result_data,
                "rows": result_data.get("rows", result_data.get("data", []))
            }
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Advanced query error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def get_manual_schema_info(ctx):
    """Fallback to get schema info from OpenAPI/PostgREST if RPC is missing"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{ctx['url']}/rest/v1/",
            headers={
                'apikey': ctx['auth_key'],
                'Authorization': f"Bearer {ctx['auth_key']}"
            }
        )
    
    if not response.is_success:
        return {"success": False, "message": "Failed to fetch schema info"}
        
    data = response.json()
    tables = []
    
    if "definitions" in data:
        for table_name, definition in data["definitions"].items():
            columns = []
            properties = definition.get("properties", {})
            required = definition.get("required", [])
            
            for col_name, col_info in properties.items():
                columns.append({
                    "column_name": col_name,
                    "data_type": col_info.get("format", col_info.get("type", "text")).upper(),
                    "is_nullable": "NO" if col_name in required else "YES"
                })
            
            tables.append({
                "name": table_name,
                "schema": "public"
            })
            
    return {
        "success": True,
        "data": {
            "tables": tables
        }
    }

@router.get("/supabase-tables/")
async def get_supabase_tables(db: Session = Depends(get_db)):
    """Get database tables"""
    try:
        ctx = await get_project_context(db, "builder")
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{ctx['url']}/rest/v1/",
                headers={
                    'apikey': ctx['auth_key'],
                    'Authorization': f"Bearer {ctx['auth_key']}"
                }
            )
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch tables from Supabase")
            
        data = response.json()
        tables = []
        
        if "definitions" in data:
            for table_name in data["definitions"].keys():
                tables.append({
                    "name": table_name,
                    "schema": "public"
                })
        
        return {
            "success": True,
            "data": {
                "tables": tables
            }
        }
    except HTTPException as e:
        if e.status_code == 404:
             return {
                "success": True,
                "data": {
                    "tables": []
                }
            }
        raise e
    except Exception as e:
        print(f"Get tables error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables/")
async def get_tables(db: Session = Depends(get_db)):
    """Get database tables (aliased to supabase-tables)"""
    return await get_supabase_tables(db)

@router.get("/table-schema/{table_name}/")
async def get_table_schema(table_name: str, db: Session = Depends(get_db)):
    """Get table schema with foreign key information"""
    try:
        ctx = await get_project_context(db, "builder")
        
        # 1. Get column definitions from OpenAPI spec
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{ctx['url']}/rest/v1/",
                headers={
                    'apikey': ctx['auth_key'],
                    'Authorization': f"Bearer {ctx['auth_key']}"
                }
            )
            
        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch schema info from Supabase")
            
        data = response.json()
        
        # 2. Get FK info from the frontbase_get_schema_info RPC
        foreign_keys = []
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                fk_response = await client.post(
                    f"{ctx['url']}/rest/v1/rpc/frontbase_get_schema_info",
                    json={},
                    headers={
                        'Content-Type': 'application/json',
                        'apikey': ctx['auth_key'],
                        'Authorization': f"Bearer {ctx['auth_key']}"
                    }
                )
                if fk_response.is_success:
                    fk_data = fk_response.json()
                    foreign_keys = fk_data.get('foreign_keys', []) or []
        except Exception as e:
            print(f"Warning: Could not fetch FK info: {e}")
            # Continue without FK info
        
        # Build a FK lookup map: table_name.column_name -> FK info
        fk_map = {}
        for fk in foreign_keys:
            if fk.get('table_name') == table_name:
                fk_map[fk.get('column_name')] = {
                    'foreign_table': fk.get('foreign_table_name'),
                    'foreign_column': fk.get('foreign_column_name')
                }
        
        if "definitions" in data and table_name in data["definitions"]:
            definition = data["definitions"][table_name]
            properties = definition.get("properties", {})
            required = definition.get("required", [])
            
            columns = []
            for col_name, col_info in properties.items():
                columns.append({
                    "column_name": col_name,
                    "data_type": col_info.get("format", col_info.get("type", "text")),
                    "is_nullable": "YES" if col_name not in required else "NO",
                    "column_default": None,
                    "is_primary": col_name == 'id', # Simple heuristic for now
                    "is_foreign": col_name in fk_map,
                    "foreign_table": fk_map[col_name]["foreign_table"] if col_name in fk_map else None,
                    "foreign_column": fk_map[col_name]["foreign_column"] if col_name in fk_map else None,
                    
                    # Frontend Aliases (Required by useTableColumns etc)
                    "name": col_name,
                    "type": col_info.get("format", col_info.get("type", "text")).upper(),
                    "isForeign": col_name in fk_map,
                    "foreignTable": fk_map[col_name]["foreign_table"] if col_name in fk_map else None,
                    "foreignColumn": fk_map[col_name]["foreign_column"] if col_name in fk_map else None
                })
                
            return {
                "success": True,
                "data": {
                    "table_name": table_name,
                    "columns": columns
                }
            }
        else:
            raise HTTPException(status_code=404, detail=f"Table {table_name} not found in schema")
            
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Get table schema error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/connect-supabase/", response_model=SuccessResponse)
async def connect_supabase(request: DatabaseConnectionRequest, db: Session = Depends(get_db)):
    """Connect to Supabase"""
    try:
        # Save connection details at PROJECT level
        update_data = {
            "supabase_url": request.url,
            "supabase_anon_key": request.anonKey
        }
        
        # Save service key if provided
        if hasattr(request, 'serviceKey') and request.serviceKey:
            from ..database.utils import encrypt_data
            encrypted_service_key = encrypt_data(request.serviceKey)
            update_data["supabase_service_key_encrypted"] = encrypted_service_key
        
        update_project_settings(db, "default", update_data)
        
        return SuccessResponse(
            success=True,
            message="Supabase connection saved successfully"
        )
    except Exception as error:
        print(f"Save connection error: {error}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save connection"
        )

@router.delete("/disconnect-supabase/", response_model=SuccessResponse)
async def disconnect_supabase(db: Session = Depends(get_db)):
    """Disconnect from Supabase"""
    try:
        # Clear ALL project-level settings including service key
        update_data = {
            "supabase_url": None,
            "supabase_anon_key": None,
            "supabase_service_key_encrypted": None
        }
        
        update_project_settings(db, "default", update_data)
        
        return SuccessResponse(
            success=True,
            message="Supabase connection removed successfully"
        )
    except Exception as error:
        print(f"Disconnect error: {error}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to disconnect"
        )
