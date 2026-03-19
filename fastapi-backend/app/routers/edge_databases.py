"""
Edge Databases router.

CRUD for managing named edge database connections (Turso, Neon, PlanetScale).
These replace the old global Turso settings in settings.json.

Each EdgeDatabase can be attached to one or more DeploymentTargets.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid
import httpx

from ..database.config import SessionLocal
from ..models.models import EdgeDatabase, EdgeEngine

router = APIRouter(prefix="/api/edge-databases", tags=["edge-databases"])


# =============================================================================
# Schemas
# =============================================================================

class EdgeDatabaseCreate(BaseModel):
    name: str
    provider: str  # "turso", "neon", "planetscale"
    db_url: str
    db_token: Optional[str] = None
    provider_account_id: Optional[str] = None  # FK → Connected Account
    is_default: bool = False

class EdgeDatabaseUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    db_url: Optional[str] = None
    db_token: Optional[str] = None
    provider_account_id: Optional[str] = None
    is_default: Optional[bool] = None

class EdgeDatabaseResponse(BaseModel):
    id: str
    name: str
    provider: str
    db_url: str
    has_token: bool  # Never expose the actual token
    is_default: bool
    is_system: bool = False  # True = pre-seeded, cannot be deleted
    provider_account_id: Optional[str] = None
    account_name: Optional[str] = None
    created_at: str
    updated_at: str
    target_count: int = 0  # Number of deployment targets using this DB
    warning: Optional[str] = None  # Scoped token creation warnings
    supports_remote_delete: bool = False  # Whether this resource can be deleted remotely

class TestConnectionResult(BaseModel):
    success: bool
    message: str
    latency_ms: Optional[float] = None


# =============================================================================
# Endpoints
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
    )


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

        # CF lifecycle: create scoped token for D1 resources
        token_warning = None
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

        # Remote resource delete via unified service
        if delete_remote and edge_db.provider_account_id:
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


class BatchDeleteDatabaseRequest(BaseModel):
    ids: List[str]
    delete_remote: bool = False


class BatchResult(BaseModel):
    success: List[str] = []
    failed: List[dict] = []
    total: int = 0


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
                    if rec.provider_account_id:
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
    return await _test_connection(edge_provider, db_url, db_token, acct_id)


@router.post("/test-connection", response_model=TestConnectionResult)
async def test_connection_inline(payload: EdgeDatabaseCreate):
    """Test a database connection before saving it."""
    return await _test_connection(payload.provider, payload.db_url, payload.db_token, payload.provider_account_id)


# =============================================================================
# Helpers
# =============================================================================

async def _test_connection(provider: str, db_url: str, db_token: Optional[str], provider_account_id: Optional[str] = None) -> TestConnectionResult:
    """Test connectivity to an edge-compatible database."""
    import time
    
    if provider == "turso":
        return await _test_turso(db_url, db_token)
    elif provider == "sqlite":
        return TestConnectionResult(
            success=True,
            message="Local SQLite is always available",
            latency_ms=0,
        )
    elif provider == "neon":
        return await _test_neon(db_url, db_token)
    elif provider == "cloudflare":
        return await _test_cloudflare_d1(db_url, provider_account_id)
    elif provider == "supabase":
        return await _test_supabase_db(db_url, provider_account_id)
    else:
        return TestConnectionResult(
            success=False,
            message=f"Unknown provider: {provider}",
        )


async def _test_turso(db_url: str, db_token: Optional[str]) -> TestConnectionResult:
    """Test Turso connectivity via HTTP API."""
    import time
    
    # Convert libsql:// to https:// for HTTP API
    http_url = db_url
    if http_url.startswith("libsql://"):
        http_url = http_url.replace("libsql://", "https://")
    
    if not http_url.startswith("https://"):
        http_url = f"https://{http_url}"
    
    pipeline_url = f"{http_url}/v2/pipeline"
    
    start = time.time()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                pipeline_url,
                json={"requests": [
                    {"type": "execute", "stmt": {"sql": "SELECT 1 AS ping"}},
                    {"type": "close"},
                ]},
                headers={
                    "Authorization": f"Bearer {db_token}",
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )
        
        latency = round((time.time() - start) * 1000, 1)
        
        if resp.status_code == 200:
            return TestConnectionResult(
                success=True,
                message=f"Connected to Turso in {latency}ms",
                latency_ms=latency,
            )
        else:
            return TestConnectionResult(
                success=False,
                message=f"Turso returned HTTP {resp.status_code}: {resp.text[:200]}",
            )
    except Exception as e:
        return TestConnectionResult(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


async def _test_neon(db_url: str, db_token: Optional[str]) -> TestConnectionResult:
    """Test Neon connectivity via asyncpg (standard PostgreSQL connection)."""
    import time
    import asyncpg

    if not db_url:
        return TestConnectionResult(success=False, message="No connection URI provided")

    start = time.time()
    try:
        conn = await asyncpg.connect(db_url, timeout=10)
        try:
            await conn.fetchval("SELECT 1")
        finally:
            await conn.close()

        latency = round((time.time() - start) * 1000, 1)
        return TestConnectionResult(
            success=True,
            message=f"Connected to Neon in {latency}ms",
            latency_ms=latency,
        )
    except Exception as e:
        err = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
        return TestConnectionResult(
            success=False,
            message=f"Connection failed: {err}",
        )


async def _test_cloudflare_d1(db_url: str, provider_account_id: Optional[str]) -> TestConnectionResult:
    """Test CF D1 connectivity by querying database info via the CF API."""
    import time

    if not provider_account_id:
        return TestConnectionResult(success=False, message="No connected account — cannot test D1")

    # Extract UUID from d1:// URL
    db_uuid = db_url.replace("d1://", "").strip()
    if not db_uuid:
        return TestConnectionResult(success=False, message="Invalid D1 URL")

    # Resolve credentials from connected account
    from ..core.security import get_provider_creds
    db = SessionLocal()
    try:
        creds = get_provider_creds(provider_account_id, db)
    finally:
        db.close()

    if not creds:
        return TestConnectionResult(success=False, message="Could not resolve account credentials")

    token = creds.get("api_token", "")
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Get CF account ID
            accts_resp = await client.get(
                "https://api.cloudflare.com/client/v4/accounts",
                headers={"Authorization": f"Bearer {token}"},
            )
            if accts_resp.status_code != 200:
                return TestConnectionResult(success=False, message=f"CF API error: {accts_resp.status_code}")
            accounts = accts_resp.json().get("result", [])
            if not accounts:
                return TestConnectionResult(success=False, message="No Cloudflare accounts found")
            acct_id = accounts[0].get("id", "")

            # Query the D1 database info
            resp = await client.get(
                f"https://api.cloudflare.com/client/v4/accounts/{acct_id}/d1/database/{db_uuid}",
                headers={"Authorization": f"Bearer {token}"},
            )

        latency = round((time.time() - start) * 1000, 1)
        data = resp.json()
        if data.get("success"):
            db_name = data.get("result", {}).get("name", db_uuid)
            return TestConnectionResult(
                success=True,
                message=f"Connected to D1 '{db_name}' in {latency}ms",
                latency_ms=latency,
            )
        errors = data.get("errors", [{}])
        return TestConnectionResult(
            success=False,
            message=f"D1 error: {errors[0].get('message', 'Unknown')}",
        )
    except Exception as e:
        return TestConnectionResult(success=False, message=f"Connection failed: {str(e)}")


async def _test_supabase_db(db_url: str, provider_account_id: Optional[str] = None) -> TestConnectionResult:
    """Test Supabase DB connectivity.
    
    Strategy:
      1. If db_url is a valid postgresql:// URI → asyncpg direct connection
      2. Otherwise, resolve credentials from connected account → REST API ping
    """
    import time

    # Strategy 1: direct PG connection if we have a valid URI
    if db_url and db_url.startswith(('postgresql://', 'postgres://')) and '[YOUR-PASSWORD]' not in db_url:
        start = time.time()
        try:
            import asyncpg
            conn = await asyncpg.connect(db_url, timeout=10)
            try:
                await conn.fetchval("SELECT 1")
            finally:
                await conn.close()
            latency = round((time.time() - start) * 1000, 1)
            return TestConnectionResult(
                success=True,
                message=f"Connected to Supabase DB in {latency}ms (direct PG)",
                latency_ms=latency,
            )
        except Exception as e:
            err = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
            return TestConnectionResult(success=False, message=f"Connection failed: {err}")

    # Strategy 2: REST API ping via connected account credentials
    if not provider_account_id:
        return TestConnectionResult(
            success=False,
            message="No valid PostgreSQL URI and no connected account. "
                    "Please connect a Supabase account first.",
        )

    import logging
    _log = logging.getLogger(__name__)

    from ..core.security import get_provider_creds
    db = SessionLocal()
    try:
        creds = get_provider_creds(provider_account_id, db)
    finally:
        db.close()

    if not creds:
        return TestConnectionResult(success=False, message="Could not resolve account credentials")

    api_url = creds.get("api_url", "")
    service_key = creds.get("service_role_key", "")
    anon_key = creds.get("anon_key", "")
    key_to_use = service_key or anon_key

    if not api_url or not key_to_use:
        _log.warning("[Supabase test] Missing api_url=%s or keys for acct=%s. Keys: %s",
                     bool(api_url), provider_account_id, list(creds.keys()))
        return TestConnectionResult(
            success=False,
            message=f"Connected account is missing api_url or service_role_key. "
                    f"Available credential keys: {', '.join(creds.keys())}",
        )

    # Ping the Supabase REST API
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{api_url}/rest/v1/",
                headers={
                    "apikey": key_to_use,
                    "Authorization": f"Bearer {key_to_use}",
                },
            )
        latency = round((time.time() - start) * 1000, 1)
        if resp.status_code in (200, 204):
            return TestConnectionResult(
                success=True,
                message=f"Connected to Supabase in {latency}ms (REST API)",
                latency_ms=latency,
            )
        else:
            return TestConnectionResult(
                success=False,
                message=f"Supabase REST API returned HTTP {resp.status_code}: {resp.text[:200]}",
            )
    except Exception as e:
        err = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
        return TestConnectionResult(success=False, message=f"Connection failed: {err}")


async def _resolve_supabase_pooler(db_url_or_ref: str, provider_account_id: str) -> Optional[str]:
    """Resolve the Supabase pooler URI from the connected account credentials."""
    import logging
    logger = logging.getLogger(__name__)

    from ..core.security import get_provider_creds
    from ..services.provider_discovery import _fetch_supabase_pooler_uri

    db = SessionLocal()
    try:
        creds = get_provider_creds(provider_account_id, db)
    finally:
        db.close()

    if not creds:
        logger.warning("[Supabase test] No creds found for account %s", provider_account_id)
        return None

    token = creds.get("access_token", "")
    if not token:
        logger.warning("[Supabase test] No access_token in creds for account %s", provider_account_id)
        return None

    # Extract project ref: either a plain ref or from the db_url
    project_ref = db_url_or_ref
    if '.' in project_ref or '/' in project_ref:
        # Try to extract ref from URL patterns like db.xxxx.supabase.co
        import re
        match = re.search(r'db\.([a-z0-9]+)\.supabase', project_ref)
        if match:
            project_ref = match.group(1)

    try:
        uri = await _fetch_supabase_pooler_uri(token, project_ref)
        if uri:
            return uri
        logger.warning("[Supabase test] Pooler API returned no URI for ref=%s", project_ref)
    except Exception as e:
        logger.warning("[Supabase test] Pooler API failed for ref=%s: %s", project_ref, e)

    # Fallback: try the database settings endpoint
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.supabase.com/v1/projects/{project_ref}/config/database",
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                host = data.get("host", "")
                if host:
                    # Build a standard pooler URI
                    port = data.get("port", 5432)
                    db_name = data.get("db_name", "postgres")
                    return f"postgresql://postgres.{project_ref}:{token}@{host}:{port}/{db_name}"
            else:
                logger.warning("[Supabase test] Settings API returned %d for ref=%s", resp.status_code, project_ref)
    except Exception as e:
        logger.warning("[Supabase test] Settings API failed for ref=%s: %s", project_ref, e)

    return None
