"""
Edge Databases router.

CRUD for managing named edge database connections (Turso, Neon, PlanetScale).
These replace the old global Turso settings in settings.json.

Each EdgeDatabase can be attached to one or more DeploymentTargets.
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List
from datetime import datetime
import uuid
import httpx

from ..database.config import SessionLocal
from ..models.models import EdgeDatabase, EdgeEngine
from ..schemas.edge_databases import (
    EdgeDatabaseCreate,
    EdgeDatabaseUpdate,
    EdgeDatabaseResponse,
    DiscoverSchemasRequest,
    CreateSchemaRequest,
    ResetRolePasswordRequest,
    BatchDeleteDatabaseRequest,
    BatchResult,
)
from ..schemas.edge_engines import TestConnectionResult

router = APIRouter(prefix="/api/edge-databases", tags=["edge-databases"])


# =============================================================================
# Helpers
# =============================================================================

def _serialize_edge_db(edb, db, target_count: int = 0, warning: Optional[str] = None) -> EdgeDatabaseResponse:
    """Serialize an EdgeDatabase ORM object."""
    from ..models.models import EdgeProviderAccount
    account_name = None
    if edb.provider_account_id:
        acct = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == edb.provider_account_id
        ).first()
        if acct:
            account_name = str(acct.name)
    from ..services.provider_resource_deleter import supports_remote_delete_for_model
    can_remote_delete = bool(edb.provider_account_id) and supports_remote_delete_for_model(
        "database", str(edb.provider)
    )
    # Extract schema_name from provider_config JSON
    config_schema_name = None
    if edb.provider_config:  # type: ignore[truthy-bool]
        import json as _json
        try:
            pc = _json.loads(str(edb.provider_config))
            config_schema_name = pc.get('schema_name')
        except (ValueError, TypeError):
            pass
    return EdgeDatabaseResponse(
        id=str(edb.id),
        name=str(edb.name),
        provider=str(edb.provider),
        db_url=str(edb.db_url),
        has_token=bool(edb.db_token) or bool(edb.provider_account_id),
        is_default=bool(edb.is_default),
        is_system=bool(edb.is_system),
        provider_account_id=str(edb.provider_account_id) if edb.provider_account_id else None,
        account_name=account_name,
        created_at=str(edb.created_at),
        updated_at=str(edb.updated_at),
        target_count=target_count,
        warning=warning,
        supports_remote_delete=can_remote_delete,
        schema_name=config_schema_name,
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/", response_model=List[EdgeDatabaseResponse])
async def list_edge_databases():
    """List all configured edge databases."""
    db = SessionLocal()
    try:
        edge_dbs = db.query(EdgeDatabase).order_by(EdgeDatabase.created_at.desc()).all()
        result = []
        for edb in edge_dbs:
            target_count = db.query(EdgeEngine).filter(
                EdgeEngine.edge_db_id == edb.id
            ).count()
            result.append(_serialize_edge_db(edb, db, target_count))
        return result
    finally:
        db.close()


@router.post("/", response_model=EdgeDatabaseResponse, status_code=201)
async def create_edge_database(payload: EdgeDatabaseCreate):
    """Create a new edge database connection.
    
    If provider_account_id is provided, db_token is optional — it will be
    resolved from the Connected Account at deploy time.
    """
    db = SessionLocal()
    try:
        now = datetime.utcnow().isoformat() + "Z"
        
        # If this is set as default, unset all others
        if payload.is_default:
            db.query(EdgeDatabase).filter(EdgeDatabase.is_default == True).update(
                {"is_default": False}
            )
        
        # If this is the first one, make it default
        count = db.query(EdgeDatabase).count()
        is_default = payload.is_default or count == 0
        
        from ..core.security import encrypt_field
        edge_db = EdgeDatabase(
            id=str(uuid.uuid4()),
            name=payload.name,
            provider=payload.provider,
            db_url=payload.db_url,
            db_token=encrypt_field(payload.db_token),
            provider_account_id=payload.provider_account_id,
            is_default=is_default,
            created_at=now,
            updated_at=now,
        )

        # Store schema_name in provider_config JSON (PG providers)
        if payload.schema_name and payload.provider in ('supabase', 'neon', 'postgres'):
            import json as _json
            existing_config = {}
            if edge_db.provider_config:  # type: ignore[truthy-bool]
                try:
                    existing_config = _json.loads(str(edge_db.provider_config))
                except (ValueError, TypeError):
                    pass
            existing_config['schema_name'] = payload.schema_name
            edge_db.provider_config = _json.dumps(existing_config)  # type: ignore[assignment]

        # Supabase lifecycle: auto-provision scoped role + schema + tables,
        # then replace the [YOUR-PASSWORD] placeholder in db_url with real creds.
        token_warning = None
        if payload.provider == 'supabase' and payload.provider_account_id:
            from ..services.supabase_state_db import provision_supabase_scoped_role
            provision_result = await provision_supabase_scoped_role(
                edge_db, payload.provider_account_id, payload.schema_name,
            )
            if provision_result.get('warning'):
                token_warning = provision_result['warning']

        # CF lifecycle: create scoped token for D1 resources
        if payload.provider == 'cloudflare' and payload.provider_account_id:
            import json
            from ..services.cf_token_manager import maybe_create_scoped_token_typed
            config = await maybe_create_scoped_token_typed(
                'cloudflare', 'd1', payload.name,
                payload.provider_account_id, db,
            )
            if config:
                token_warning = config.pop('_warning', None)
                edge_db.provider_config = json.dumps(config)  # type: ignore[assignment]

        db.add(edge_db)
        db.commit()
        db.refresh(edge_db)
        
        return _serialize_edge_db(edge_db, db, 0, warning=token_warning)
    finally:
        db.close()


@router.put("/{db_id}", response_model=EdgeDatabaseResponse)
async def update_edge_database(db_id: str, payload: EdgeDatabaseUpdate):
    """Update an existing edge database connection."""
    db = SessionLocal()
    try:
        edge_db = db.query(EdgeDatabase).filter(EdgeDatabase.id == db_id).first()
        if not edge_db:
            raise HTTPException(404, f"Edge database '{db_id}' not found")
        
        if payload.name is not None:
            edge_db.name = payload.name  # type: ignore[assignment]
        if payload.provider is not None:
            edge_db.provider = payload.provider  # type: ignore[assignment]
        if payload.db_url is not None:
            edge_db.db_url = payload.db_url  # type: ignore[assignment]
        if payload.db_token is not None:
            from ..core.security import encrypt_field
            edge_db.db_token = encrypt_field(payload.db_token)  # type: ignore[assignment]
        if payload.provider_account_id is not None:
            edge_db.provider_account_id = payload.provider_account_id  # type: ignore[assignment]
        if payload.is_default is not None:
            if payload.is_default:
                db.query(EdgeDatabase).filter(EdgeDatabase.id != db_id).update(
                    {"is_default": False}
                )
            edge_db.is_default = payload.is_default  # type: ignore[assignment]
        
        edge_db.updated_at = datetime.utcnow().isoformat() + "Z"  # type: ignore[assignment]
        db.commit()
        db.refresh(edge_db)
        
        target_count = db.query(EdgeEngine).filter(
            EdgeEngine.edge_db_id == db_id
        ).count()
        
        return _serialize_edge_db(edge_db, db, target_count)
    finally:
        db.close()


@router.delete("/{db_id}")
async def delete_edge_database(db_id: str, delete_remote: bool = False):
    """Delete an edge database connection.
    
    Fails if any deployment targets still reference this DB.
    If delete_remote=True and provider supports it, also deletes the remote resource.
    """
    db = SessionLocal()
    try:
        edge_db = db.query(EdgeDatabase).filter(EdgeDatabase.id == db_id).first()
        if not edge_db:
            raise HTTPException(404, f"Edge database '{db_id}' not found")
        
        if edge_db.is_system:  # type: ignore[truthy-bool]
            raise HTTPException(403, "Cannot delete a system edge database")
        
        # Check for referencing targets
        target_count = db.query(EdgeEngine).filter(
            EdgeEngine.edge_db_id == db_id
        ).count()
        if target_count > 0:
            raise HTTPException(
                409,
                f"Cannot delete: {target_count} deployment target(s) still reference this database. "
                f"Reassign them first."
            )
        
        was_default = bool(edge_db.is_default)
        remote_deleted = False
        db_name = str(edge_db.name)
        db_provider = str(edge_db.provider)

        # CF lifecycle: delete scoped token if exists
        if db_provider == 'cloudflare':
            from ..services.cf_token_manager import maybe_delete_scoped_token
            await maybe_delete_scoped_token(
                'cloudflare',
                str(edge_db.provider_config) if edge_db.provider_config is not None else None,
                str(edge_db.provider_account_id) if edge_db.provider_account_id is not None else None,
                db,
            )

        # Supabase lifecycle: drop schema, role, remove from PostgREST config
        if db_provider == 'supabase' and delete_remote and bool(edge_db.provider_account_id):
            import json as _json
            _raw_config = str(edge_db.provider_config) if edge_db.provider_config is not None else '{}'
            provider_config = _json.loads(_raw_config)
            schema_name = provider_config.get('schema_name')
            if schema_name:
                from ..services.supabase_state_db import cleanup_supabase_state_db
                from ..models.models import EdgeProviderAccount
                from ..core.security import decrypt_credentials
                acct = db.query(EdgeProviderAccount).filter(
                    EdgeProviderAccount.id == str(edge_db.provider_account_id)
                ).first()
                if acct:
                    creds = decrypt_credentials(str(acct.provider_credentials))
                    access_token = creds.get('access_token', '')
                    # Extract project ref from supabase_url (e.g. https://xxxx.supabase.co)
                    import re
                    supabase_url = provider_config.get('supabase_url', '')
                    ref_match = re.search(r'//([a-z0-9]+)\.supabase', supabase_url)
                    project_ref = ref_match.group(1) if ref_match else ''
                    if access_token and project_ref:
                        import logging
                        _logger = logging.getLogger(__name__)
                        cleanup_result = await cleanup_supabase_state_db(
                            token=access_token,
                            project_ref=project_ref,
                            schema_name=schema_name,
                        )
                        if cleanup_result.get('success'):
                            _logger.info("[Edge DB delete] ✅ Supabase cleanup done for schema '%s'", schema_name)
                            remote_deleted = True
                        else:
                            _logger.warning("[Edge DB delete] ⚠️ Supabase cleanup had errors: %s", cleanup_result.get('errors'))

        # Remote resource delete via unified service
        if delete_remote and bool(edge_db.provider_account_id):
            from ..services.provider_resource_deleter import delete_resource_for_edge_model
            remote_deleted = await delete_resource_for_edge_model(
                model_kind="database",
                provider=db_provider,
                resource_url=str(edge_db.db_url),
                provider_config_json=str(edge_db.provider_config) if edge_db.provider_config is not None else None,
                provider_account_id=str(edge_db.provider_account_id),
                db_session=db,
            )

        db.delete(edge_db)
        
        # If we deleted the default, promote the next one
        if was_default:
            next_db = db.query(EdgeDatabase).first()
            if next_db:
                next_db.is_default = True  # type: ignore[assignment]
        
        db.commit()
        msg = f"Edge database '{db_name}' deleted"
        if remote_deleted:
            msg += f" (also removed from {db_provider.title()})"
        return {"success": True, "message": msg, "remote_deleted": remote_deleted}
    finally:
        db.close()


@router.post("/batch/delete", response_model=BatchResult)
async def batch_delete_databases(payload: BatchDeleteDatabaseRequest):
    """Batch delete databases. Optionally delete remote resources in parallel."""
    import asyncio
    result = BatchResult(total=len(payload.ids))
    db = SessionLocal()
    try:
        # Phase 1: collect records
        records_to_delete: list[EdgeDatabase] = []
        for db_id in payload.ids:
            edge_db = db.query(EdgeDatabase).filter(EdgeDatabase.id == db_id).first()
            if not edge_db:
                result.failed.append({"id": db_id, "error": "Not found"})
                continue
            if edge_db.is_system:  # type: ignore[truthy-bool]
                result.failed.append({"id": db_id, "error": "Cannot delete system database"})
                continue
            # Check for referencing engines
            ref_count = db.query(EdgeEngine).filter(EdgeEngine.edge_db_id == db_id).count()
            if ref_count > 0:
                result.failed.append({"id": db_id, "error": f"{ref_count} engine(s) still reference this database"})
                continue
            records_to_delete.append(edge_db)

        # Phase 2: Remote delete in parallel
        if payload.delete_remote:
            async def _safe_delete(rec: EdgeDatabase):
                try:
                    if bool(rec.provider_account_id):
                        from ..services.provider_resource_deleter import delete_resource_for_edge_model
                        await delete_resource_for_edge_model(
                            model_kind="database",
                            provider=str(rec.provider),
                            resource_url=str(rec.db_url),
                            provider_config_json=str(rec.provider_config) if rec.provider_config is not None else None,
                            provider_account_id=str(rec.provider_account_id),
                            db_session=db,
                        )
                except Exception as e:
                    result.failed.append({"id": str(rec.id), "error": f"Remote delete failed: {e}"})
            await asyncio.gather(*[_safe_delete(rec) for rec in records_to_delete])

        # Phase 3: Delete from DB
        for rec in records_to_delete:
            rid = str(rec.id)
            if any(f.get("id") == rid for f in result.failed):
                continue
            try:
                # CF lifecycle: delete scoped token
                if str(rec.provider) == 'cloudflare':
                    from ..services.cf_token_manager import maybe_delete_scoped_token
                    await maybe_delete_scoped_token(
                        'cloudflare',
                        str(rec.provider_config) if rec.provider_config is not None else None,
                        str(rec.provider_account_id) if rec.provider_account_id is not None else None,
                        db,
                    )
                db.delete(rec)
                result.success.append(rid)
            except Exception as e:
                result.failed.append({"id": rid, "error": str(e)})

        db.commit()
        return result
    finally:
        db.close()


@router.post("/{db_id}/test", response_model=TestConnectionResult)
async def test_edge_database(db_id: str):
    """Test connectivity to an edge database."""
    db = SessionLocal()
    try:
        edge_db = db.query(EdgeDatabase).filter(EdgeDatabase.id == db_id).first()
        if not edge_db:
            raise HTTPException(404, f"Edge database '{db_id}' not found")
        
        db_token_raw = edge_db.db_token
        db_url = str(edge_db.db_url)
        from ..core.security import decrypt_field
        db_token = decrypt_field(str(db_token_raw)) if db_token_raw is not None else None
        edge_provider = str(edge_db.provider)
        acct_id = str(edge_db.provider_account_id) if edge_db.provider_account_id is not None else None
    finally:
        db.close()
    
    # Test based on provider
    from ..services.db_connection_tester import test_db_connection
    return await test_db_connection(edge_provider, db_url, db_token, acct_id)


@router.post("/test-connection", response_model=TestConnectionResult)
async def test_connection_inline(payload: EdgeDatabaseCreate):
    """Test a database connection before saving it."""
    from ..services.db_connection_tester import test_db_connection
    return await test_db_connection(payload.provider, payload.db_url, payload.db_token, payload.provider_account_id)


@router.post("/discover-schemas")
async def discover_schemas(payload: DiscoverSchemasRequest):
    """Discover existing frontbase_edge* schemas in a PG database.
    
    Called after user picks a Supabase/Neon/Postgres resource to list
    available schemas for state isolation.
    """
    if payload.provider == 'supabase' and payload.provider_account_id:
        # Use Supabase Management API — no pooler URL needed
        from ..services.supabase_state_db import discover_pg_schemas_supabase
        from ..services.db_connection_tester import get_supabase_api_context
        token, project_ref = await get_supabase_api_context(payload.db_url, payload.provider_account_id)
        if not token or not project_ref:
            raise HTTPException(400, "Could not resolve Supabase credentials")
        result = await discover_pg_schemas_supabase(token, project_ref)
    else:
        from ..services.supabase_state_db import discover_pg_schemas
        from ..services.db_connection_tester import resolve_pg_url
        resolved_url = await resolve_pg_url(payload.db_url, payload.provider, payload.provider_account_id)
        result = await discover_pg_schemas(resolved_url)
    if not result.get('success'):
        raise HTTPException(400, result.get('detail', 'Schema discovery failed'))
    return result


@router.post("/create-schema")
async def create_schema(payload: CreateSchemaRequest):
    """Create a new frontbase_edge_<suffix> schema in a PG database.
    
    Suffix must be lowercase alphanumeric + underscores.
    """
    if payload.provider == 'supabase' and payload.provider_account_id:
        # Use Supabase Management API — no pooler URL needed
        from ..services.supabase_state_db import create_pg_schema_supabase
        from ..services.db_connection_tester import get_supabase_api_context
        token, project_ref = await get_supabase_api_context(payload.db_url, payload.provider_account_id)
        if not token or not project_ref:
            raise HTTPException(400, "Could not resolve Supabase credentials")
        result = await create_pg_schema_supabase(token, project_ref, payload.suffix)
    else:
        from ..services.supabase_state_db import create_pg_schema
        from ..services.db_connection_tester import resolve_pg_url
        resolved_url = await resolve_pg_url(payload.db_url, payload.provider, payload.provider_account_id)
        result = await create_pg_schema(resolved_url, payload.suffix)
    if not result.get('success'):
        raise HTTPException(400, result.get('detail', 'Schema creation failed'))
    return result


@router.post("/reset-role-password")
async def reset_role_password(payload: ResetRolePasswordRequest):
    """Reset the scoped role password for an existing Supabase schema.

    Used during re-import: the schema exists but the password is lost.
    Returns {success, role_name, role_password}.
    """
    from ..services.db_connection_tester import get_supabase_api_context
    token, project_ref = await get_supabase_api_context(payload.db_url, payload.provider_account_id)
    if not token or not project_ref:
        raise HTTPException(400, "Could not resolve Supabase credentials")

    from ..services.supabase_state_db import reset_supabase_role_password
    result = await reset_supabase_role_password(token, project_ref, payload.schema_name)
    if not result.get('success'):
        raise HTTPException(400, result.get('detail', 'Role password reset failed'))
    return result
