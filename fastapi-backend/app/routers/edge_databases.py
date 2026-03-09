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

class TestConnectionResult(BaseModel):
    success: bool
    message: str
    latency_ms: Optional[float] = None


# =============================================================================
# Endpoints
# =============================================================================

def _serialize_edge_db(edb, db, target_count: int = 0) -> EdgeDatabaseResponse:
    """Serialize an EdgeDatabase ORM object."""
    from ..models.models import EdgeProviderAccount
    account_name = None
    if edb.provider_account_id:
        acct = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == edb.provider_account_id
        ).first()
        if acct:
            account_name = str(acct.name)
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
        db.add(edge_db)
        db.commit()
        db.refresh(edge_db)
        
        return _serialize_edge_db(edge_db, db, 0)
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
async def delete_edge_database(db_id: str):
    """Delete an edge database connection.
    
    Fails if any deployment targets still reference this DB.
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
        db.delete(edge_db)
        
        # If we deleted the default, promote the next one
        if was_default:
            next_db = db.query(EdgeDatabase).first()
            if next_db:
                next_db.is_default = True  # type: ignore[assignment]
        
        db.commit()
        return {"success": True, "message": f"Edge database '{edge_db.name}' deleted"}
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
        db_token = decrypt_field(str(db_token_raw)) if db_token_raw else None  # type: ignore[truthy-bool]
        edge_provider = str(edge_db.provider)
    finally:
        db.close()
    
    # Test based on provider
    return await _test_connection(edge_provider, db_url, db_token)


@router.post("/test-connection", response_model=TestConnectionResult)
async def test_connection_inline(payload: EdgeDatabaseCreate):
    """Test a database connection before saving it."""
    return await _test_connection(payload.provider, payload.db_url, payload.db_token)


# =============================================================================
# Helpers
# =============================================================================

async def _test_connection(provider: str, db_url: str, db_token: Optional[str]) -> TestConnectionResult:
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
        return TestConnectionResult(
            success=False,
            message="Neon HTTP testing not yet implemented. Connection saved.",
        )
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
