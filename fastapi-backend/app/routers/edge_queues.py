"""
Edge Queues router.

CRUD for managing named edge queue connections (QStash, RabbitMQ, BullMQ, SQS).
Mirrors the EdgeCache / EdgeDatabase pattern — each EdgeQueue can be attached to
one or more EdgeEngines (one-to-many).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid
import httpx

from ..database.config import SessionLocal
from ..models.models import EdgeQueue, EdgeEngine

router = APIRouter(prefix="/api/edge-queues", tags=["edge-queues"])


# =============================================================================
# Schemas
# =============================================================================

class EdgeQueueCreate(BaseModel):
    name: str
    provider: str  # "qstash", "rabbitmq", "bullmq", "sqs"
    queue_url: str
    queue_token: Optional[str] = None
    signing_key: Optional[str] = None
    next_signing_key: Optional[str] = None
    provider_config: Optional[dict] = None
    provider_account_id: Optional[str] = None  # FK → Connected Account
    is_default: bool = False

class EdgeQueueUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    queue_url: Optional[str] = None
    queue_token: Optional[str] = None
    signing_key: Optional[str] = None
    next_signing_key: Optional[str] = None
    provider_config: Optional[dict] = None
    provider_account_id: Optional[str] = None
    is_default: Optional[bool] = None

class EdgeQueueResponse(BaseModel):
    id: str
    name: str
    provider: str
    queue_url: str
    has_token: bool  # Never expose the actual token
    has_signing_key: bool
    is_default: bool
    is_system: bool = False
    provider_account_id: Optional[str] = None
    account_name: Optional[str] = None
    created_at: str
    updated_at: str
    engine_count: int = 0  # Number of edge engines using this queue

class TestQueueResult(BaseModel):
    success: bool
    message: str
    latency_ms: Optional[float] = None


# =============================================================================
# Helpers
# =============================================================================

def _serialize_queue(queue, db, engine_count: int = 0) -> EdgeQueueResponse:
    """Serialize an EdgeQueue ORM object."""
    from ..models.models import EdgeProviderAccount
    account_name = None
    if queue.provider_account_id:
        acct = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == queue.provider_account_id
        ).first()
        if acct:
            account_name = str(acct.name)
    return EdgeQueueResponse(
        id=str(queue.id),
        name=str(queue.name),
        provider=str(queue.provider),
        queue_url=str(queue.queue_url),
        has_token=bool(queue.queue_token) or bool(queue.provider_account_id),
        has_signing_key=bool(queue.signing_key),
        is_default=bool(queue.is_default),
        is_system=bool(getattr(queue, 'is_system', False)),
        provider_account_id=str(queue.provider_account_id) if queue.provider_account_id else None,
        account_name=account_name,
        created_at=str(queue.created_at),
        updated_at=str(queue.updated_at),
        engine_count=engine_count,
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/", response_model=List[EdgeQueueResponse])
async def list_edge_queues():
    """List all configured edge queues."""
    db = SessionLocal()
    try:
        queues = db.query(EdgeQueue).order_by(EdgeQueue.created_at.desc()).all()
        result = []
        for queue in queues:
            engine_count = db.query(EdgeEngine).filter(
                EdgeEngine.edge_queue_id == queue.id
            ).count()
            result.append(_serialize_queue(queue, db, engine_count))
        return result
    finally:
        db.close()


# --- Static routes MUST come before /{queue_id} routes ---

class TestQueueInline(BaseModel):
    provider: str
    queue_url: str
    queue_token: Optional[str] = None

@router.post("/test-connection", response_model=TestQueueResult)
async def test_connection_inline(payload: TestQueueInline):
    """Test a queue connection before saving it."""
    return await _test_queue(payload.provider, payload.queue_url, payload.queue_token)



@router.post("/", response_model=EdgeQueueResponse, status_code=201)
async def create_edge_queue(payload: EdgeQueueCreate):
    """Create a new edge queue connection."""
    db = SessionLocal()
    try:
        import json
        # Prevent duplicate queue URLs
        existing = db.query(EdgeQueue).filter(
            EdgeQueue.queue_url == payload.queue_url
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"A queue with this URL already exists ('{existing.name}')"
            )

        now = datetime.utcnow().isoformat() + "Z"
        
        # If this is set as default, unset all others
        if payload.is_default:
            db.query(EdgeQueue).filter(EdgeQueue.is_default == True).update(
                {"is_default": False}
            )
        
        # If this is the first one, make it default
        count = db.query(EdgeQueue).count()
        is_default = payload.is_default or count == 0
        
        from ..core.security import encrypt_field
        queue = EdgeQueue(
            id=str(uuid.uuid4()),
            name=payload.name,
            provider=payload.provider,
            queue_url=payload.queue_url,
            queue_token=encrypt_field(payload.queue_token),
            signing_key=encrypt_field(payload.signing_key),
            next_signing_key=encrypt_field(payload.next_signing_key),
            provider_config=json.dumps(payload.provider_config) if payload.provider_config else None,
            provider_account_id=payload.provider_account_id,
            is_default=is_default,
            created_at=now,
            updated_at=now,
        )
        db.add(queue)
        db.commit()
        db.refresh(queue)
        
        return _serialize_queue(queue, db, 0)
    finally:
        db.close()


@router.put("/{queue_id}", response_model=EdgeQueueResponse)
async def update_edge_queue(queue_id: str, payload: EdgeQueueUpdate):
    """Update an existing edge queue connection."""
    db = SessionLocal()
    try:
        import json
        queue = db.query(EdgeQueue).filter(EdgeQueue.id == queue_id).first()
        if not queue:
            raise HTTPException(404, f"Edge queue '{queue_id}' not found")
        
        if payload.name is not None:
            queue.name = payload.name  # type: ignore[assignment]
        if payload.provider is not None:
            queue.provider = payload.provider  # type: ignore[assignment]
        if payload.queue_url is not None:
            queue.queue_url = payload.queue_url  # type: ignore[assignment]
        from ..core.security import encrypt_field
        if payload.queue_token is not None:
            queue.queue_token = encrypt_field(payload.queue_token)  # type: ignore[assignment]
        if payload.signing_key is not None:
            queue.signing_key = encrypt_field(payload.signing_key)  # type: ignore[assignment]
        if payload.next_signing_key is not None:
            queue.next_signing_key = encrypt_field(payload.next_signing_key)  # type: ignore[assignment]
        if payload.provider_config is not None:
            queue.provider_config = json.dumps(payload.provider_config)  # type: ignore[assignment]
        if payload.provider_account_id is not None:
            queue.provider_account_id = payload.provider_account_id  # type: ignore[assignment]
        if payload.is_default is not None:
            if payload.is_default:
                db.query(EdgeQueue).filter(EdgeQueue.id != queue_id).update(
                    {"is_default": False}
                )
            queue.is_default = payload.is_default  # type: ignore[assignment]
        
        queue.updated_at = datetime.utcnow().isoformat() + "Z"  # type: ignore[assignment]
        db.commit()
        db.refresh(queue)
        
        engine_count = db.query(EdgeEngine).filter(
            EdgeEngine.edge_queue_id == queue_id
        ).count()
        
        return _serialize_queue(queue, db, engine_count)
    finally:
        db.close()


@router.delete("/{queue_id}")
async def delete_edge_queue(queue_id: str):
    """Delete an edge queue connection.
    
    Fails if any edge engines still reference this queue.
    """
    db = SessionLocal()
    try:
        queue = db.query(EdgeQueue).filter(EdgeQueue.id == queue_id).first()
        if not queue:
            raise HTTPException(404, f"Edge queue '{queue_id}' not found")
        
        if getattr(queue, 'is_system', False):
            raise HTTPException(403, "System queues cannot be deleted")
        
        engine_count = db.query(EdgeEngine).filter(
            EdgeEngine.edge_queue_id == queue_id
        ).count()
        if engine_count > 0:
            raise HTTPException(
                409,
                f"Cannot delete: {engine_count} edge engine(s) still reference this queue. "
                f"Reassign them first."
            )
        
        was_default = bool(queue.is_default)
        db.delete(queue)
        
        if was_default:
            next_queue = db.query(EdgeQueue).first()
            if next_queue:
                next_queue.is_default = True  # type: ignore[assignment]
        
        db.commit()
        return {"success": True, "message": f"Edge queue '{queue.name}' deleted"}
    finally:
        db.close()


@router.post("/{queue_id}/test/", response_model=TestQueueResult)
async def test_edge_queue(queue_id: str):
    """Test connectivity to a saved edge queue."""
    db = SessionLocal()
    try:
        queue = db.query(EdgeQueue).filter(EdgeQueue.id == queue_id).first()
        if not queue:
            raise HTTPException(404, f"Edge queue '{queue_id}' not found")
        
        provider = str(queue.provider)
        from ..core.security import decrypt_field
        queue_token_raw = queue.queue_token
        queue_token = decrypt_field(str(queue_token_raw)) if queue_token_raw else None  # type: ignore[truthy-bool]
        queue_url = str(queue.queue_url)
    finally:
        db.close()
    
    return await _test_queue(provider, queue_url, queue_token)

    return await _test_queue(provider, queue_url, queue_token)


# =============================================================================
# Test Helpers
# =============================================================================

async def _test_queue(provider: str, queue_url: str, queue_token: Optional[str]) -> TestQueueResult:
    """Test connectivity to an edge queue by provider type."""
    if provider == "qstash":
        return await _test_qstash(queue_token)
    else:
        # Future providers (RabbitMQ, BullMQ, SQS) — not yet implemented
        return TestQueueResult(
            success=False,
            message=f"Test not yet implemented for provider: {provider}",
        )


async def _test_qstash(qstash_token: Optional[str]) -> TestQueueResult:
    """Test QStash connectivity by listing queues."""
    import time

    if not qstash_token:
        return TestQueueResult(
            success=False,
            message="QStash requires an API token",
        )

    start = time.time()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://qstash.upstash.io/v2/queues",
                headers={"Authorization": f"Bearer {qstash_token}"},
                timeout=10.0,
            )
        latency = round((time.time() - start) * 1000, 1)
        if resp.status_code == 200:
            return TestQueueResult(
                success=True,
                message=f"QStash connected in {latency}ms",
                latency_ms=latency,
            )
        else:
            return TestQueueResult(
                success=False,
                message=f"QStash returned HTTP {resp.status_code}: {resp.text[:200]}",
            )
    except Exception as e:
        return TestQueueResult(
            success=False,
            message=f"QStash connection failed: {str(e)}",
        )
