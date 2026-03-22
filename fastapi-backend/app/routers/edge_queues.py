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
    warning: Optional[str] = None
    supports_remote_delete: bool = False

class TestQueueResult(BaseModel):
    success: bool
    message: str
    latency_ms: Optional[float] = None


# =============================================================================
# Helpers
# =============================================================================

def _serialize_queue(queue, db, engine_count: int = 0, warning: Optional[str] = None) -> EdgeQueueResponse:
    """Serialize an EdgeQueue ORM object."""
    from ..models.models import EdgeProviderAccount
    account_name = None
    if queue.provider_account_id:
        acct = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == queue.provider_account_id
        ).first()
        if acct:
            account_name = str(acct.name)
    from ..services.provider_resource_deleter import supports_remote_delete_for_model
    can_remote_delete = bool(queue.provider_account_id) and supports_remote_delete_for_model(
        "queue", str(queue.provider)
    )
    return EdgeQueueResponse(
        id=str(queue.id),
        name=str(queue.name),
        provider=str(queue.provider),
        queue_url=str(queue.queue_url),
        has_token=bool(queue.queue_token) or bool(queue.provider_account_id),
        has_signing_key=bool(queue.signing_key),
        is_default=bool(queue.is_default),
        is_system=bool(getattr(queue, 'is_system', False)),
        provider_account_id=str(queue.provider_account_id) if queue.provider_account_id is not None else None,
        account_name=account_name,
        created_at=str(queue.created_at),
        updated_at=str(queue.updated_at),
        engine_count=engine_count,
        warning=warning,
        supports_remote_delete=can_remote_delete,
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
    provider_account_id: Optional[str] = None

@router.post("/test-connection", response_model=TestQueueResult)
async def test_connection_inline(payload: TestQueueInline):
    """Test a queue connection before saving it."""
    return await _test_queue(payload.provider, payload.queue_url, payload.queue_token, payload.provider_account_id)



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

        # CF lifecycle: create scoped token for Queue resources
        token_warning = None
        if payload.provider == 'cloudflare' and payload.provider_account_id:
            from ..services.cf_token_manager import maybe_create_scoped_token_typed
            config = await maybe_create_scoped_token_typed(
                'cloudflare', 'queue', payload.name,
                payload.provider_account_id, db,
            )
            if config:
                token_warning = config.pop('_warning', None)
                # Merge with existing provider_config if any
                existing_config = json.loads(str(queue.provider_config) or '{}') if queue.provider_config is not None else {}
                existing_config.update(config)
                queue.provider_config = json.dumps(existing_config)  # type: ignore[assignment]

        db.add(queue)
        db.commit()
        db.refresh(queue)
        
        return _serialize_queue(queue, db, 0, warning=token_warning)
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
async def delete_edge_queue(queue_id: str, delete_remote: bool = False):
    """Delete an edge queue connection.
    
    Fails if any edge engines still reference this queue.
    If delete_remote=True and provider supports it, also deletes the remote resource.
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
        remote_deleted = False
        queue_name = str(queue.name)
        queue_provider = str(queue.provider)

        # CF lifecycle: delete scoped token if exists
        if queue_provider == 'cloudflare':
            from ..services.cf_token_manager import maybe_delete_scoped_token
            await maybe_delete_scoped_token(
                'cloudflare',
                str(queue.provider_config) if queue.provider_config is not None else None,
                str(queue.provider_account_id) if queue.provider_account_id is not None else None,
                db,
            )

        # Remote resource delete via unified service
        if delete_remote and queue.provider_account_id is not None:
            from ..services.provider_resource_deleter import delete_resource_for_edge_model
            remote_deleted = await delete_resource_for_edge_model(
                model_kind="queue",
                provider=queue_provider,
                resource_url=str(queue.queue_url),
                provider_config_json=str(queue.provider_config) if queue.provider_config is not None else None,
                provider_account_id=str(queue.provider_account_id),
                db_session=db,
            )

        db.delete(queue)
        
        if was_default:
            next_queue = db.query(EdgeQueue).first()
            if next_queue:
                next_queue.is_default = True  # type: ignore[assignment]
        
        db.commit()
        msg = f"Edge queue '{queue_name}' deleted"
        if remote_deleted:
            msg += f" (also removed from {queue_provider.title()})"
        return {"success": True, "message": msg, "remote_deleted": remote_deleted}
    finally:
        db.close()


class BatchDeleteQueueRequest(BaseModel):
    ids: List[str]
    delete_remote: bool = False


class BatchResult(BaseModel):
    success: List[str] = []
    failed: List[dict] = []
    total: int = 0


@router.post("/batch/delete", response_model=BatchResult)
async def batch_delete_queues(payload: BatchDeleteQueueRequest):
    """Batch delete queues. Optionally delete remote resources in parallel."""
    import asyncio
    result = BatchResult(total=len(payload.ids))
    db = SessionLocal()
    try:
        records_to_delete: list[EdgeQueue] = []
        for qid in payload.ids:
            queue = db.query(EdgeQueue).filter(EdgeQueue.id == qid).first()
            if not queue:
                result.failed.append({"id": qid, "error": "Not found"})
                continue
            if getattr(queue, 'is_system', False):
                result.failed.append({"id": qid, "error": "Cannot delete system queue"})
                continue
            ref_count = db.query(EdgeEngine).filter(EdgeEngine.edge_queue_id == qid).count()
            if ref_count > 0:
                result.failed.append({"id": qid, "error": f"{ref_count} engine(s) still reference this queue"})
                continue
            records_to_delete.append(queue)

        if payload.delete_remote:
            async def _safe_delete(rec: EdgeQueue):
                try:
                    if rec.provider_account_id is not None:
                        from ..services.provider_resource_deleter import delete_resource_for_edge_model
                        await delete_resource_for_edge_model(
                            model_kind="queue",
                            provider=str(rec.provider),
                            resource_url=str(rec.queue_url),
                            provider_config_json=str(rec.provider_config) if rec.provider_config is not None else None,
                            provider_account_id=str(rec.provider_account_id),
                            db_session=db,
                        )
                except Exception as e:
                    result.failed.append({"id": str(rec.id), "error": f"Remote delete failed: {e}"})
            await asyncio.gather(*[_safe_delete(rec) for rec in records_to_delete])

        for rec in records_to_delete:
            rid = str(rec.id)
            if any(f.get("id") == rid for f in result.failed):
                continue
            try:
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
        queue_token = decrypt_field(str(queue_token_raw)) if queue_token_raw is not None else None
        queue_url = str(queue.queue_url)
        acct_id = str(queue.provider_account_id) if queue.provider_account_id is not None else None
    finally:
        db.close()
    
    return await _test_queue(provider, queue_url, queue_token, acct_id)


# =============================================================================
# Test Helpers
# =============================================================================

async def _test_queue(provider: str, queue_url: str, queue_token: Optional[str], provider_account_id: Optional[str] = None) -> TestQueueResult:
    """Test connectivity to an edge queue by provider type."""
    if provider == "qstash":
        return await _test_qstash(queue_token)
    elif provider == "cloudflare":
        return await _test_cf_queue(queue_url, provider_account_id)
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


async def _test_cf_queue(queue_url: str, provider_account_id: Optional[str]) -> TestQueueResult:
    """Test CF Queue connectivity by querying queue info via CF API."""
    import time

    if not provider_account_id:
        return TestQueueResult(success=False, message="No connected account — cannot test Queue")

    queue_id = queue_url.strip()
    if not queue_id:
        return TestQueueResult(success=False, message="No queue ID")

    from ..core.security import get_provider_creds
    db = SessionLocal()
    try:
        creds = get_provider_creds(provider_account_id, db)
    finally:
        db.close()

    if not creds:
        return TestQueueResult(success=False, message="Could not resolve account credentials")

    token = creds.get("api_token", "")
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            accts_resp = await client.get(
                "https://api.cloudflare.com/client/v4/accounts",
                headers={"Authorization": f"Bearer {token}"},
            )
            if accts_resp.status_code != 200:
                return TestQueueResult(success=False, message=f"CF API error: {accts_resp.status_code}")
            accounts = accts_resp.json().get("result", [])
            if not accounts:
                return TestQueueResult(success=False, message="No Cloudflare accounts found")
            acct_id = accounts[0].get("id", "")

            resp = await client.get(
                f"https://api.cloudflare.com/client/v4/accounts/{acct_id}/queues/{queue_id}",
                headers={"Authorization": f"Bearer {token}"},
            )

        latency = round((time.time() - start) * 1000, 1)
        data = resp.json()
        if data.get("success"):
            q_name = data.get("result", {}).get("queue_name", queue_id)
            return TestQueueResult(
                success=True,
                message=f"Queue '{q_name}' accessible in {latency}ms",
                latency_ms=latency,
            )
        errors = data.get("errors", [{}])
        return TestQueueResult(
            success=False,
            message=f"Queue error: {errors[0].get('message', 'Unknown')}",
        )
    except Exception as e:
        return TestQueueResult(success=False, message=f"Connection failed: {str(e)}")
