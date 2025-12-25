from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from ..database.config import get_db
from ..database.utils import get_project_settings, decrypt_data
import httpx
import json
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

router = APIRouter(prefix="/api/database/rls", tags=["rls"])

# Request/Response Models
class CreatePolicyRequest(BaseModel):
    tableName: str
    policyName: str
    operation: str
    usingExpression: Optional[str] = None
    checkExpression: Optional[str] = None
    roles: List[str] = ["authenticated"]
    permissive: bool = True
    propagateTo: Optional[List[dict]] = []

class UpdatePolicyRequest(BaseModel):
    newPolicyName: Optional[str] = None
    operation: str
    usingExpression: Optional[str] = None
    checkExpression: Optional[str] = None
    roles: List[str] = ["authenticated"]
    permissive: bool = True

class ToggleRLSRequest(BaseModel):
    enable: bool

class RLSMetadataRequest(BaseModel):
    tableName: str
    policyName: str
    formData: dict
    generatedUsing: Optional[str] = None
    generatedCheck: Optional[str] = None

class VerifyRLSRequest(BaseModel):
    tableName: str
    policyName: str
    currentUsing: Optional[str] = None


async def get_rls_context(db: Session):
    """Get project context for RLS operations (requires service key)"""
    project = get_project_settings(db, "default")
    if not project or not project.get("supabase_url"):
        raise HTTPException(status_code=404, detail="Supabase connection not configured")
    
    url = project["supabase_url"]
    anon_key = project.get("supabase_anon_key")
    encrypted_service_key = project.get("supabase_service_key_encrypted")
    
    auth_key = None
    if encrypted_service_key:
        try:
            auth_key = decrypt_data(encrypted_service_key)
        except Exception as e:
            print(f"Decryption error: {e}")
            auth_key = anon_key
    else:
        auth_key = anon_key
    
    return {
        "url": url,
        "anon_key": anon_key,
        "auth_key": auth_key
    }


async def call_rls_function(function_name: str, params: dict, ctx: dict):
    """Call Supabase RPC function for RLS management"""
    url = f"{ctx['url']}/rest/v1/rpc/{function_name}"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            json=params,
            headers={
                'Content-Type': 'application/json',
                'apikey': ctx['auth_key'],
                'Authorization': f"Bearer {ctx['auth_key']}"
            }
        )
    
    if not response.is_success:
        error_text = response.text
        print(f"RLS RPC error: {error_text}")
        raise HTTPException(
            status_code=response.status_code,
            detail=f"RPC {function_name} failed: {error_text}"
        )
    
    return response.json()


# ============================================================
# RLS POLICY ROUTES
# ============================================================

@router.get("/policies")
async def list_policies(schema: str = Query("public"), db: Session = Depends(get_db)):
    """List all RLS policies in the schema"""
    try:
        ctx = await get_rls_context(db)
        
        policies = await call_rls_function('frontbase_list_rls_policies', {
            'p_schema_name': schema
        }, ctx)
        
        return {
            "success": True,
            "data": policies or []
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"List RLS policies error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tables")
async def get_tables_rls_status(schema: str = Query("public"), db: Session = Depends(get_db)):
    """Get RLS status for all tables"""
    try:
        ctx = await get_rls_context(db)
        
        tables = await call_rls_function('frontbase_get_rls_status', {
            'p_schema_name': schema
        }, ctx)
        
        return {
            "success": True,
            "data": tables or []
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Get RLS table status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/policies/{table_name}")
async def get_table_policies(
    table_name: str, 
    schema: str = Query("public"), 
    db: Session = Depends(get_db)
):
    """Get policies for a specific table"""
    try:
        ctx = await get_rls_context(db)
        
        all_policies = await call_rls_function('frontbase_list_rls_policies', {
            'p_schema_name': schema
        }, ctx)
        
        table_policies = [p for p in (all_policies or []) if p.get('table_name') == table_name]
        
        return {
            "success": True,
            "data": table_policies
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Get table RLS policies error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/policies")
async def create_policy(request: CreatePolicyRequest, db: Session = Depends(get_db)):
    """Create a new RLS policy"""
    try:
        ctx = await get_rls_context(db)
        
        result = await call_rls_function('frontbase_create_rls_policy', {
            'p_table_name': request.tableName,
            'p_policy_name': request.policyName,
            'p_operation': request.operation.upper(),
            'p_using_expr': request.usingExpression,
            'p_check_expr': request.checkExpression,
            'p_roles': request.roles,
            'p_permissive': request.permissive
        }, ctx)
        
        if not result.get('success', True):
            raise HTTPException(status_code=400, detail=result.get('error', 'Policy creation failed'))
        
        # Handle propagation
        propagated_policies = []
        if request.propagateTo:
            for target in request.propagateTo:
                try:
                    derived_name = f"{request.policyName}_on_{target.get('tableName')}"
                    
                    derived_using = None
                    if request.usingExpression:
                        derived_using = f"{target.get('fkColumn')} IN (SELECT {target.get('fkReferencedColumn')} FROM {request.tableName} WHERE {request.usingExpression})"
                    
                    derived_check = None
                    if request.checkExpression:
                        derived_check = f"{target.get('fkColumn')} IN (SELECT {target.get('fkReferencedColumn')} FROM {request.tableName} WHERE {request.checkExpression})"
                    
                    await call_rls_function('frontbase_create_rls_policy', {
                        'p_table_name': target.get('tableName'),
                        'p_policy_name': derived_name,
                        'p_operation': request.operation.upper(),
                        'p_using_expr': derived_using,
                        'p_check_expr': derived_check,
                        'p_roles': request.roles,
                        'p_permissive': request.permissive
                    }, ctx)
                    
                    propagated_policies.append(target.get('tableName'))
                except Exception as e:
                    print(f"Failed to propagate to {target.get('tableName')}: {e}")
        
        message = result.get('message', 'Policy created successfully')
        if propagated_policies:
            message += f" (Propagated to {', '.join(propagated_policies)})"
        
        return {
            "success": True,
            "message": message,
            "sql": result.get('sql'),
            "propagatedTo": propagated_policies
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Create RLS policy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/policies/{table_name}/{policy_name}")
async def update_policy(
    table_name: str,
    policy_name: str,
    request: UpdatePolicyRequest,
    db: Session = Depends(get_db)
):
    """Update an existing RLS policy"""
    try:
        ctx = await get_rls_context(db)
        
        result = await call_rls_function('frontbase_update_rls_policy', {
            'p_table_name': table_name,
            'p_old_policy_name': policy_name,
            'p_new_policy_name': request.newPolicyName or policy_name,
            'p_operation': request.operation.upper(),
            'p_using_expr': request.usingExpression,
            'p_check_expr': request.checkExpression,
            'p_roles': request.roles,
            'p_permissive': request.permissive
        }, ctx)
        
        if result.get('success'):
            return {
                "success": True,
                "message": result.get('message', 'Policy updated')
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', 'Update failed'))
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Update RLS policy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/policies/{table_name}/{policy_name}")
async def delete_policy(
    table_name: str,
    policy_name: str,
    db: Session = Depends(get_db)
):
    """Delete an RLS policy"""
    try:
        ctx = await get_rls_context(db)
        
        result = await call_rls_function('frontbase_drop_rls_policy', {
            'p_table_name': table_name,
            'p_policy_name': policy_name
        }, ctx)
        
        if result.get('success'):
            return {
                "success": True,
                "message": result.get('message', 'Policy deleted')
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', 'Delete failed'))
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Delete RLS policy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tables/{table_name}/toggle")
async def toggle_table_rls(
    table_name: str,
    request: ToggleRLSRequest,
    db: Session = Depends(get_db)
):
    """Enable or disable RLS on a table"""
    try:
        ctx = await get_rls_context(db)
        
        result = await call_rls_function('frontbase_toggle_table_rls', {
            'p_table_name': table_name,
            'p_enable': request.enable
        }, ctx)
        
        if result.get('success'):
            return {
                "success": True,
                "message": result.get('message', f"RLS {'enabled' if request.enable else 'disabled'}")
            }
        else:
            raise HTTPException(status_code=400, detail=result.get('error', 'Toggle failed'))
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Toggle table RLS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# RLS METADATA ROUTES (Local SQLite storage)
# ============================================================

def generate_sql_hash(sql: Optional[str]) -> str:
    """Generate a simple hash of an SQL expression for comparison"""
    if not sql:
        return ''
    import re
    normalized = re.sub(r'\s+', ' ', sql).strip().lower()
    hash_val = 0
    for char in normalized:
        hash_val = ((hash_val << 5) - hash_val) + ord(char)
        hash_val = hash_val & 0xFFFFFFFF  # Keep it 32-bit
    return format(hash_val, 'x')


@router.get("/metadata/{table_name}/{policy_name}")
async def get_rls_metadata(
    table_name: str,
    policy_name: str,
    db: Session = Depends(get_db)
):
    """Get stored metadata for a policy"""
    try:
        result = db.execute(
            text("SELECT * FROM rls_metadata WHERE table_name = :table_name AND policy_name = :policy_name"),
            {"table_name": table_name, "policy_name": policy_name}
        )
        row = result.fetchone()
        
        if row:
            return {
                "success": True,
                "data": {
                    "tableName": row.table_name,
                    "policyName": row.policy_name,
                    "formData": json.loads(row.form_data) if row.form_data else {},
                    "generatedUsing": row.generated_using,
                    "generatedCheck": row.generated_check,
                    "sqlHash": row.sql_hash
                }
            }
        else:
            return {
                "success": True,
                "data": None
            }
    except Exception as e:
        print(f"Get RLS metadata error: {e}")
        return {
            "success": True,
            "data": None
        }


@router.post("/metadata")
async def save_rls_metadata(request: RLSMetadataRequest, db: Session = Depends(get_db)):
    """Save metadata when creating a policy"""
    try:
        sql_hash = generate_sql_hash(request.generatedUsing)
        
        # Ensure table exists
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS rls_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                policy_name TEXT NOT NULL,
                form_data TEXT,
                generated_using TEXT,
                generated_check TEXT,
                sql_hash TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(table_name, policy_name)
            )
        """))
        
        db.execute(
            text("""
                INSERT OR REPLACE INTO rls_metadata 
                (table_name, policy_name, form_data, generated_using, generated_check, sql_hash)
                VALUES (:table_name, :policy_name, :form_data, :generated_using, :generated_check, :sql_hash)
            """),
            {
                "table_name": request.tableName,
                "policy_name": request.policyName,
                "form_data": json.dumps(request.formData),
                "generated_using": request.generatedUsing,
                "generated_check": request.generatedCheck,
                "sql_hash": sql_hash
            }
        )
        db.commit()
        
        return {
            "success": True,
            "data": {
                "tableName": request.tableName,
                "policyName": request.policyName,
                "sqlHash": sql_hash
            }
        }
    except Exception as e:
        print(f"Save RLS metadata error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/metadata/{table_name}/{policy_name}")
async def delete_rls_metadata(
    table_name: str,
    policy_name: str,
    db: Session = Depends(get_db)
):
    """Delete metadata"""
    try:
        db.execute(
            text("DELETE FROM rls_metadata WHERE table_name = :table_name AND policy_name = :policy_name"),
            {"table_name": table_name, "policy_name": policy_name}
        )
        db.commit()
        
        return {
            "success": True,
            "message": "Metadata deleted"
        }
    except Exception as e:
        print(f"Delete RLS metadata error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/metadata/verify")
async def verify_rls_metadata(request: VerifyRLSRequest, db: Session = Depends(get_db)):
    """Verify if a policy's current USING expression matches the stored hash"""
    try:
        result = db.execute(
            text("SELECT * FROM rls_metadata WHERE table_name = :table_name AND policy_name = :policy_name"),
            {"table_name": request.tableName, "policy_name": request.policyName}
        )
        row = result.fetchone()
        
        if not row:
            return {
                "success": True,
                "data": {
                    "hasMetadata": False,
                    "isVerified": False,
                    "reason": "no_metadata"
                }
            }
        
        current_hash = generate_sql_hash(request.currentUsing)
        is_verified = current_hash == row.sql_hash
        
        return {
            "success": True,
            "data": {
                "hasMetadata": True,
                "isVerified": is_verified,
                "reason": "match" if is_verified else "modified_externally",
                "formData": json.loads(row.form_data) if is_verified and row.form_data else None
            }
        }
    except Exception as e:
        print(f"Verify RLS metadata error: {e}")
        return {
            "success": True,
            "data": {
                "hasMetadata": False,
                "isVerified": False,
                "reason": "error"
            }
        }
