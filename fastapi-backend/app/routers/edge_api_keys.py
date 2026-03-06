"""
Edge API Keys router — CRUD for tenant-facing API key management.

Keys secure the /v1/* OpenAI-compatible endpoints on edge engines.
Full key is shown once at creation; only the SHA-256 hash is stored.
"""

import hashlib
import secrets
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from ..database.config import get_db
from ..models.models import EdgeAPIKey, EdgeEngine


router = APIRouter(prefix="/api/edge-api-keys", tags=["edge-api-keys"])


# =============================================================================
# Schemas
# =============================================================================

class APIKeyCreate(BaseModel):
    name: str
    edge_engine_id: Optional[str] = None  # null = all engines
    expires_at: Optional[str] = None       # ISO datetime or null = never


class APIKeyUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    expires_at: Optional[str] = None


class APIKeyResponse(BaseModel):
    id: str
    name: str
    prefix: str
    edge_engine_id: Optional[str]
    engine_name: Optional[str] = None
    is_active: bool
    expires_at: Optional[str]
    last_used_at: Optional[str]
    created_at: str
    updated_at: str


class APIKeyCreatedResponse(APIKeyResponse):
    """Response after creation — includes the full key (shown once)."""
    key: str


# =============================================================================
# Helpers
# =============================================================================

def _generate_key() -> tuple[str, str, str]:
    """Generate a new API key, returning (full_key, prefix, hash)."""
    raw = secrets.token_hex(24)  # 48-char hex string
    full_key = f"fb_sk_{raw}"
    prefix = full_key[:14] + "..."  # "fb_sk_a1b2c3d4..."
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return full_key, prefix, key_hash


def _serialize(key: EdgeAPIKey, engine: Optional[EdgeEngine] = None) -> dict:
    """Serialize EdgeAPIKey to response dict."""
    return {
        "id": str(key.id),
        "name": str(key.name),
        "prefix": str(key.prefix),
        "edge_engine_id": str(key.edge_engine_id) if key.edge_engine_id else None,  # type: ignore[truthy-bool]
        "engine_name": str(engine.name) if engine else None,
        "is_active": bool(key.is_active),
        "expires_at": str(key.expires_at) if key.expires_at else None,  # type: ignore[truthy-bool]
        "last_used_at": str(key.last_used_at) if key.last_used_at else None,  # type: ignore[truthy-bool]
        "created_at": str(key.created_at),
        "updated_at": str(key.updated_at),
    }


# =============================================================================
# CRUD
# =============================================================================

@router.get("")
def list_api_keys(db: Session = Depends(get_db)):
    """List all API keys (prefix only, never full key)."""
    keys = db.query(EdgeAPIKey).order_by(EdgeAPIKey.created_at.desc()).all()
    result = []
    for key in keys:
        engine = None
        if key.edge_engine_id:  # type: ignore[truthy-bool]
            engine = db.query(EdgeEngine).filter(
                EdgeEngine.id == key.edge_engine_id
            ).first()
        result.append(_serialize(key, engine))
    return {"keys": result, "total": len(result)}


@router.post("", status_code=201)
def create_api_key(payload: APIKeyCreate, db: Session = Depends(get_db)):
    """Create a new API key. Returns the full key ONCE."""
    # Validate engine if specified
    if payload.edge_engine_id:
        engine = db.query(EdgeEngine).filter(
            EdgeEngine.id == payload.edge_engine_id
        ).first()
        if not engine:
            raise HTTPException(404, "Edge engine not found")

    full_key, prefix, key_hash = _generate_key()
    now = datetime.utcnow().isoformat()

    api_key = EdgeAPIKey(
        id=str(uuid.uuid4()),
        name=payload.name,
        prefix=prefix,
        key_hash=key_hash,
        edge_engine_id=payload.edge_engine_id,
        is_active=True,
        expires_at=payload.expires_at,
        created_at=now,
        updated_at=now,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    engine = None
    if api_key.edge_engine_id:  # type: ignore[truthy-bool]
        engine = db.query(EdgeEngine).filter(
            EdgeEngine.id == api_key.edge_engine_id
        ).first()

    response = _serialize(api_key, engine)
    response["key"] = full_key  # Only returned at creation
    return response


@router.put("/{key_id}")
def update_api_key(
    key_id: str,
    payload: APIKeyUpdate,
    db: Session = Depends(get_db),
):
    """Update an API key's name, active status, or expiry."""
    api_key = db.query(EdgeAPIKey).filter(EdgeAPIKey.id == key_id).first()
    if not api_key:
        raise HTTPException(404, "API key not found")

    if payload.name is not None:
        api_key.name = payload.name  # type: ignore[assignment]
    if payload.is_active is not None:
        api_key.is_active = payload.is_active  # type: ignore[assignment]
    if payload.expires_at is not None:
        api_key.expires_at = payload.expires_at  # type: ignore[assignment]

    api_key.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()
    db.refresh(api_key)

    engine = None
    if api_key.edge_engine_id:  # type: ignore[truthy-bool]
        engine = db.query(EdgeEngine).filter(
            EdgeEngine.id == api_key.edge_engine_id
        ).first()

    return _serialize(api_key, engine)


@router.delete("/{key_id}", status_code=204)
def delete_api_key(key_id: str, db: Session = Depends(get_db)):
    """Revoke and delete an API key."""
    api_key = db.query(EdgeAPIKey).filter(EdgeAPIKey.id == key_id).first()
    if not api_key:
        raise HTTPException(404, "API key not found")
    db.delete(api_key)
    db.commit()
