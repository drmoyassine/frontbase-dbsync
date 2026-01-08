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


# Batch policy creation models
class TableRulePolicyData(BaseModel):
    tableName: str
    operation: str
    usingExpression: str
    checkExpression: Optional[str] = None


class CreateBatchPolicyRequest(BaseModel):
    policyBaseName: str
    tableRules: List[TableRulePolicyData]
    roles: List[str] = ["authenticated"]
    permissive: bool = True


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

@router.get("/policies/")
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


@router.get("/tables/")
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


@router.post("/policies/")
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


@router.post("/tables/{table_name}/toggle/")
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
# BATCH POLICY CREATION
# ============================================================

@router.post("/batch/")
async def create_batch_policies(request: CreateBatchPolicyRequest, db: Session = Depends(get_db)):
    """Create multiple RLS policies in a single HTTP request using batch RPC function"""
    try:
        ctx = await get_rls_context(db)
        
        # Build the policies array for the batch RPC call
        policies_array = []
        for rule in request.tableRules:
            policy_name = f"{request.policyBaseName}_{rule.tableName}"
            policies_array.append({
                "table_name": rule.tableName,
                "policy_name": policy_name,
                "operation": rule.operation.upper(),
                "using_expr": rule.usingExpression,
                "check_expr": rule.checkExpression,
                "roles": request.roles,
                "permissive": request.permissive
            })
        
        # Single RPC call to create all policies
        result = await call_rls_function('frontbase_create_rls_policies_batch', {
            'p_policies': policies_array
        }, ctx)
        
        # Transform the response to match expected format
        policies = result.get('policies', [])
        transformed_policies = []
        for p in policies:
            transformed_policies.append({
                "tableName": p.get('table_name'),
                "policyName": p.get('policy_name'),
                "success": p.get('success', False),
                "sql": p.get('sql'),
                "error": p.get('error')
            })
        
        return {
            "success": result.get('success', False),
            "message": result.get('message', 'Batch creation completed'),
            "policies": transformed_policies,
            "successCount": result.get('success_count', 0),
            "errorCount": result.get('error_count', 0)
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Create batch RLS policies error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# BULK DELETE POLICIES (from Supabase)
# ============================================================

class BulkDeleteRequest(BaseModel):
    policies: List[dict]  # List of {tableName, policyName}


@router.post("/bulk-delete/")
async def bulk_delete_policies(request: BulkDeleteRequest, db: Session = Depends(get_db)):
    """Delete multiple RLS policies from Supabase in bulk"""
    try:
        ctx = await get_rls_context(db)
        ensure_rls_metadata_table(db)
        
        results = []
        success_count = 0
        error_count = 0
        
        for policy in request.policies:
            table_name = policy.get('tableName')
            policy_name = policy.get('policyName')
            
            if not table_name or not policy_name:
                results.append({
                    "tableName": table_name,
                    "policyName": policy_name,
                    "success": False,
                    "error": "Missing tableName or policyName"
                })
                error_count += 1
                continue
            
            try:
                # Delete from Supabase via RPC
                result = await call_rls_function('frontbase_drop_rls_policy', {
                    'p_table_name': table_name,
                    'p_policy_name': policy_name
                }, ctx)
                
                if result.get('success', False):
                    # Also delete metadata from local DB (using raw SQL)
                    db.execute(
                        text("DELETE FROM rls_metadata WHERE table_name = :table AND policy_name = :policy"),
                        {"table": table_name, "policy": policy_name}
                    )
                    
                    results.append({
                        "tableName": table_name,
                        "policyName": policy_name,
                        "success": True
                    })
                    success_count += 1
                else:
                    results.append({
                        "tableName": table_name,
                        "policyName": policy_name,
                        "success": False,
                        "error": result.get('error', 'Delete failed')
                    })
                    error_count += 1
            except Exception as e:
                results.append({
                    "tableName": table_name,
                    "policyName": policy_name,
                    "success": False,
                    "error": str(e)
                })
                error_count += 1
        
        db.commit()
        
        return {
            "success": error_count == 0,
            "message": f"Deleted {success_count} policies" + (f", {error_count} failed" if error_count > 0 else ""),
            "results": results,
            "successCount": success_count,
            "errorCount": error_count
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Bulk delete RLS policies error: {e}")
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


def ensure_rls_metadata_table(db: Session):
    """Ensure the rls_metadata table exists"""
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
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(table_name, policy_name)
        )
    """))
    db.commit()


@router.get("/metadata/")
async def get_all_rls_metadata(db: Session = Depends(get_db)):
    """Get all stored RLS metadata for categorization by contact_type"""
    try:
        ensure_rls_metadata_table(db)
        result = db.execute(
            text("SELECT table_name, policy_name, form_data, generated_using FROM rls_metadata")
        )
        rows = result.fetchall()
        
        data = []
        for row in rows:
            data.append({
                "tableName": row.table_name,
                "policyName": row.policy_name,
                "formData": json.loads(row.form_data) if row.form_data else {},
                "generatedUsing": row.generated_using
            })
        
        return {
            "success": True,
            "data": data
        }
    except Exception as e:
        print(f"Get all RLS metadata error: {e}")
        return {
            "success": True,
            "data": []
        }


@router.get("/metadata/{table_name}/{policy_name}")
async def get_rls_metadata(
    table_name: str,
    policy_name: str,
    db: Session = Depends(get_db)
):
    """Get stored metadata for a policy"""
    try:
        ensure_rls_metadata_table(db)
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


@router.post("/metadata/")
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
        ensure_rls_metadata_table(db)
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


@router.post("/metadata/verify/")
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
