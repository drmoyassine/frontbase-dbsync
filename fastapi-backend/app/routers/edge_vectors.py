"""
Edge Vectors router.

CRUD for managing named edge vector connections (pgvector, cloudflare_vectorize, turso_vector, embedded_lancedb).
Mirrors the EdgeDatabase/EdgeCache pattern.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, UTC
import uuid
import ipaddress
import socket
import urllib.parse
from sqlalchemy import func

from ..database.config import SessionLocal
from ..models.models import EdgeVector, EdgeEngine, EdgeProviderAccount
from ..middleware.tenant_context import TenantContext, get_tenant_context
from ..database.utils import get_project
from ..schemas.edge_vectors import EdgeVectorCreate, EdgeVectorUpdate, EdgeVectorResponse
from ..core.security import encrypt_field, decrypt_field

router = APIRouter(prefix="/api/edge-vectors", tags=["edge-vectors"])


# =============================================================================
# Helper connection tester
# =============================================================================

# Metadata IP ranges that MUST be blocked (cloud provider metadata services)
METADATA_IP_RANGES = (
    ipaddress.ip_network('169.254.0.0/16'),  # AWS, GCP, Azure metadata
    ipaddress.ip_network('100.100.0.0/16'),  # Aliyun metadata
    ipaddress.ip_network('192.0.0.2/32'),     # Cloudflare DNS (metadata-like)
)

def _is_safe_url(url: str) -> bool:
    """Check if URL points to a safe global IP, preventing SSRF to local/metadata IPs."""
    try:
        hostname = urllib.parse.urlparse(url).hostname
        if not hostname:
            return False
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))

        # Explicitly check against metadata IP ranges
        if any(ip in network for network in METADATA_IP_RANGES):
            return False

        return ip.is_global
    except Exception:
        return False


async def test_vector_connection_raw(provider: str, url: str, token: Optional[str] = None, provider_account_id: Optional[str] = None) -> dict:
    """Test connection to a vector database with URL validation to prevent SSRF."""
    provider_lower = (provider or "").lower()
    url_lower = (url or "").lower()

    # Self-hosted embedded LanceDB check
    if provider_lower == "embedded_lancedb":
        if not url_lower.startswith("/app/data/") and not url_lower.startswith("./data/"):
            return {
                "success": False,
                "message": "Embedded LanceDB path must be under /app/data/ or ./data/ (self-hosted only)"
            }
        return {
            "success": True,
            "message": "Local LanceDB path validated."
        }

    # SSRF protection: restrict URL prefixes to known-safe patterns
    allowed_prefixes = (
        "postgres://", "postgresql://",  # PostgreSQL/pgvector
        "https://", "http://",            # Cloud providers (Cloudflare Vectorize, Turso, etc.)
    )
    if not url_lower.startswith(allowed_prefixes):
        return {
            "success": False,
            "message": f"Invalid URL format: must start with one of {allowed_prefixes}"
        }

    if url_lower.startswith("http://") or url_lower.startswith("https://"):
        if not _is_safe_url(url):
            return {
                "success": False,
                "message": "Invalid URL: resolved IP is private or reserved (SSRF protection)"
            }

    if provider_lower in ("pgvector", "postgres", "postgres_vector", "supabase", "neon"):
        try:
            import asyncpg
            # Simple connect check
            conn = await asyncpg.connect(url, timeout=5)
            try:
                await conn.execute("SELECT 1")
                has_vector = await conn.fetchval(
                    "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
                )
                message = "Successfully connected to database."
                if has_vector:
                    message += " pgvector extension is available."
                else:
                    message += " WARNING: pgvector extension is NOT installed. Run 'CREATE EXTENSION vector' on database."
                return {"success": True, "message": message}
            finally:
                await conn.close()
        except Exception as e:
            # Return generic error to prevent information disclosure
            return {"success": False, "message": "Connection failed: unable to reach database"}
    else:
        # Phase 1: Stubbed backends (cf vectorize, turso, etc.)
        # TODO: Phase 2 - Implement actual connection validation:
        # - Cloudflare Vectorize: Ping https://api.cloudflare.com/client/v4/accounts/{account_id}/vectorize/indexes
        # - Turso Vector: Execute a simple vector query via libsql client
        # Consider using httpx for HTTP-based validation and async-libsql for Turso
        return {
            "success": True,
            "message": f"Verification bypassed: provider '{provider}' is accepted, connection check is stubbed."
        }


# =============================================================================
# Inline schemas for batch operations / tests
# =============================================================================

class BatchDeleteVectorRequest(BaseModel):
    ids: List[str]

class BatchResult(BaseModel):
    success: List[str] = []
    failed: List[dict] = []
    total: int = 0

class TestConnectionRequest(BaseModel):
    provider: str
    vector_url: str
    vector_token: Optional[str] = None
    provider_account_id: Optional[str] = None


# =============================================================================
# Helpers
# =============================================================================

def _query_linked_engines(db, fk_column, resource_id, project_id: Optional[str] = None) -> tuple[int, list[dict]]:
    query = db.query(EdgeEngine).filter(fk_column == resource_id)
    if project_id:
        query = query.filter(EdgeEngine.project_id == project_id)
    engines = query.all()
    linked = [
        {
            "id": str(e.id),
            "name": str(e.name),
            "provider": str(e.edge_provider.provider) if e.edge_provider else "unknown",
        }
        for e in engines
    ]
    return len(linked), linked


def _validate_provider_account_ownership(db, ctx: TenantContext | None, provider_account_id: str | None) -> None:
    if ctx and ctx.tenant_id and provider_account_id:
        project = get_project(db, ctx)
        if not project:
            raise HTTPException(403, "Access denied: tenant project not found")
        acct = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == provider_account_id,
            EdgeProviderAccount.project_id == project.id
        ).first()
        if not acct:
            raise HTTPException(403, "Access denied: provider account not found or does not belong to this tenant")


def _serialize_vector(vector, db, engine_count: int = 0, linked_engines: Optional[list] = None) -> EdgeVectorResponse:
    account_name = None
    if vector.provider_account_id:
        acct = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == vector.provider_account_id
        ).first()
        if acct:
            account_name = str(acct.name)
    from ..services.provider_resource_deleter import supports_remote_delete_for_model
    can_remote_delete = bool(vector.provider_account_id) and supports_remote_delete_for_model(
        "vector", str(vector.provider)
    )
    return EdgeVectorResponse(
        id=str(vector.id),
        name=str(vector.name),
        provider=str(vector.provider),
        vector_url=str(vector.vector_url),
        has_token=bool(vector.vector_token) or bool(vector.provider_account_id),
        is_default=bool(vector.is_default),
        is_system=bool(getattr(vector, 'is_system', False)),
        provider_account_id=str(vector.provider_account_id) if vector.provider_account_id is not None else None,
        account_name=account_name,
        created_at=str(vector.created_at),
        updated_at=str(vector.updated_at),
        engine_count=engine_count,
        linked_engines=linked_engines or [],
        supports_remote_delete=can_remote_delete,
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/", response_model=List[EdgeVectorResponse])
async def list_edge_vectors(ctx: TenantContext | None = Depends(get_tenant_context)):
    """List all configured edge vector stores."""
    db = SessionLocal()
    try:
        query = db.query(EdgeVector)
        project = None
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                query = query.filter(EdgeVector.project_id == project.id)
            else:
                return []
                
        vectors = query.order_by(EdgeVector.created_at.desc()).all()
        
        # Pre-fetch engine counts + linked engines to avoid N+1 query
        # We query all engines linked to ANY of these vector stores for this tenant
        vector_ids = [v.id for v in vectors]
        engine_query = db.query(EdgeEngine).filter(EdgeEngine.edge_vector_id.in_(vector_ids))
        if ctx and ctx.tenant_id and project:
            engine_query = engine_query.filter(EdgeEngine.project_id == project.id)
            
        linked_engines_map = {vid: [] for vid in vector_ids}
        for e in engine_query.all():
            linked_engines_map[e.edge_vector_id].append({
                "id": str(e.id),
                "name": str(e.name),
                "provider": str(e.edge_provider.provider) if getattr(e, 'edge_provider', None) else "unknown",
            })

        result = []
        for vec in vectors:
            linked = linked_engines_map.get(vec.id, [])
            result.append(_serialize_vector(vec, db, len(linked), linked))
        return result
    finally:
        db.close()


@router.post("/", response_model=EdgeVectorResponse, status_code=201)
async def create_edge_vector(payload: EdgeVectorCreate, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Create a new edge vector store connection."""
    db = SessionLocal()
    try:
        _validate_provider_account_ownership(db, ctx, payload.provider_account_id)

        # Prevent duplicate vector URLs
        existing = db.query(EdgeVector).filter(
            EdgeVector.vector_url == payload.vector_url
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail="A vector store with this URL/DSN already exists"
            )

        now = datetime.now(UTC).isoformat() + "Z"

        # If this is the first one, make it default
        count = db.query(EdgeVector).count()
        is_default = payload.is_default or count == 0

        project_id = None
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                project_id = project.id

        vector = EdgeVector(
            id=str(uuid.uuid4()),
            name=payload.name,
            provider=payload.provider,
            vector_url=payload.vector_url,
            vector_token=encrypt_field(payload.vector_token),
            provider_account_id=payload.provider_account_id,
            is_default=False,  # Start as non-default to avoid race
            created_at=now,
            updated_at=now,
            project_id=project_id,
        )

        db.add(vector)
        db.flush()  # Get the ID without committing

        # If set as default, clear others atomically within transaction
        if is_default:
            clear_query = db.query(EdgeVector).filter(EdgeVector.id != vector.id)
            if project_id is not None:
                clear_query = clear_query.filter(EdgeVector.project_id == project_id)
            clear_query.update({"is_default": False}, synchronize_session=False)
            vector.is_default = True  # type: ignore[assignment]

        db.commit()
        db.refresh(vector)

        return _serialize_vector(vector, db, 0)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.put("/{vector_id}", response_model=EdgeVectorResponse)
async def update_edge_vector(vector_id: str, payload: EdgeVectorUpdate, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Update an existing edge vector store connection."""
    db = SessionLocal()
    try:
        query = db.query(EdgeVector).filter(EdgeVector.id == vector_id)
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                query = query.filter(EdgeVector.project_id == project.id)
            else:
                raise HTTPException(404, "Vector store not found")

        vector = query.first()
        if not vector:
            raise HTTPException(404, "Vector store not found")

        if payload.provider_account_id is not None:
            _validate_provider_account_ownership(db, ctx, payload.provider_account_id)

        if payload.name is not None:
            vector.name = payload.name  # type: ignore[assignment]
        if payload.provider is not None:
            vector.provider = payload.provider  # type: ignore[assignment]
        if payload.vector_url is not None:
            vector.vector_url = payload.vector_url  # type: ignore[assignment]
        if payload.vector_token is not None:
            vector.vector_token = encrypt_field(payload.vector_token)  # type: ignore[assignment]
        if payload.provider_account_id is not None:
            vector.provider_account_id = payload.provider_account_id  # type: ignore[assignment]
        if payload.is_default is not None:
            if payload.is_default:
                # Clear other defaults atomically within transaction
                clear_query = db.query(EdgeVector).filter(EdgeVector.id != vector_id)
                if vector.project_id is not None:
                    clear_query = clear_query.filter(EdgeVector.project_id == vector.project_id)
                clear_query.update({"is_default": False}, synchronize_session=False)
            vector.is_default = payload.is_default  # type: ignore[assignment]

        vector.updated_at = datetime.now(UTC).isoformat() + "Z"  # type: ignore[assignment]
        db.commit()
        db.refresh(vector)

        engine_count, linked = _query_linked_engines(db, EdgeEngine.edge_vector_id, vector_id)

        return _serialize_vector(vector, db, engine_count, linked)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.delete("/{vector_id}")
async def delete_edge_vector(vector_id: str, delete_remote: bool = False, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Delete an edge vector store connection."""
    db = SessionLocal()
    try:
        query = db.query(EdgeVector).filter(EdgeVector.id == vector_id)
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                query = query.filter(EdgeVector.project_id == project.id)
            else:
                raise HTTPException(404, "Vector store not found")

        vector = query.first()
        if not vector:
            raise HTTPException(404, "Vector store not found")
        
        if getattr(vector, 'is_system', False):
            raise HTTPException(403, "System vector stores cannot be deleted")
        
        # Check for referencing engines
        engines = db.query(EdgeEngine).filter(EdgeEngine.edge_vector_id == vector_id).all()
        if engines:
            names = ", ".join([f"'{e.name}'" for e in engines])
            raise HTTPException(
                status_code=409,
                detail=f"Cannot delete vector store: still in use by edge engines {names}. "
                       f"Reconfigure or detach them first."
            )

        db.delete(vector)
        db.commit()
        return {"success": True, "id": vector_id}
    finally:
        db.close()


@router.post("/{vector_id}/test")
async def test_edge_vector_connection(vector_id: str, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Test connection to an existing edge vector store."""
    db = SessionLocal()
    try:
        query = db.query(EdgeVector).filter(EdgeVector.id == vector_id)
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                query = query.filter(EdgeVector.project_id == project.id)
            else:
                raise HTTPException(404, "Vector store not found")
                
        vector = query.first()
        if not vector:
            raise HTTPException(404, "Vector store not found")
        
        decrypted_token = decrypt_field(str(vector.vector_token)) if vector.vector_token is not None else None
        return await test_vector_connection_raw(
            provider=str(vector.provider), 
            url=str(vector.vector_url), 
            token=decrypted_token,
            provider_account_id=str(vector.provider_account_id) if vector.provider_account_id is not None else None
        )
    finally:
        db.close()


@router.post("/test-connection")
async def test_connection_inline(payload: TestConnectionRequest, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Test connection using raw fields (pre-save)."""
    return await test_vector_connection_raw(
        provider=payload.provider, 
        url=payload.vector_url, 
        token=payload.vector_token,
        provider_account_id=payload.provider_account_id
    )


@router.post("/batch/delete", response_model=BatchResult)
async def batch_delete_vectors(payload: BatchDeleteVectorRequest, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Batch delete multiple edge vector stores."""
    db = SessionLocal()
    success = []
    failed = []
    project = None
    try:
        for vid in payload.ids:
            query = db.query(EdgeVector).filter(EdgeVector.id == vid)
            if ctx and ctx.tenant_id:
                project = get_project(db, ctx)
                if project:
                    query = query.filter(EdgeVector.project_id == project.id)
            vector = query.first()
            if not vector:
                failed.append({"id": vid, "error": "Deletion failed"})
                continue

            if getattr(vector, 'is_system', False):
                failed.append({"id": vid, "error": "Deletion failed"})
                continue

            engine_query = db.query(EdgeEngine).filter(EdgeEngine.edge_vector_id == vid)
            if ctx and ctx.tenant_id and project:
                engine_query = engine_query.filter(EdgeEngine.project_id == project.id)
            engines = engine_query.all()
            
            if engines:
                failed.append({"id": vid, "error": "Deletion failed"})
                continue

            db.delete(vector)
            success.append(vid)
        db.commit()
        return BatchResult(success=success, failed=failed, total=len(payload.ids))
    finally:
        db.close()
