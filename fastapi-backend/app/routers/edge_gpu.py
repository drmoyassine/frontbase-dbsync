"""
Edge GPU router — CRUD + catalog + test for AI inference models.

Provider-agnostic: uses gpu_adapters.get_adapter() factory to select the
correct implementation. The router is thin — all provider logic lives in
services/gpu_adapters.py.
"""

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database.config import get_db
from ..models.models import EdgeGPUModel, EdgeEngine, EdgeProviderAccount
from ..services.gpu_adapters import get_adapter, get_schema_for_model_type, IO_SCHEMAS, available_providers
from ..services.cloudflare_api import get_provider_credentials

router = APIRouter(prefix="/api/edge-gpu", tags=["edge-gpu"], redirect_slashes=False)


# =============================================================================
# Schemas
# =============================================================================

class GPUModelCreate(BaseModel):
    name: str
    model_type: str
    provider: str                  # "workers_ai", "huggingface", etc.
    model_id: str                  # "@cf/meta/llama-3.1-8b-instruct"
    edge_engine_id: str
    provider_config: Optional[dict] = None


class GPUModelUpdate(BaseModel):
    name: Optional[str] = None
    provider_config: Optional[dict] = None
    is_active: Optional[bool] = None


class GPUModelResponse(BaseModel):
    id: str
    name: str
    slug: str
    model_type: str
    provider: str
    model_id: str
    endpoint_url: Optional[str]
    provider_config: Optional[dict]
    edge_engine_id: str
    engine_name: Optional[str] = None
    is_active: bool
    schema: Optional[dict] = None
    created_at: str
    updated_at: str


# =============================================================================
# Helpers
# =============================================================================

def _slugify(name: str) -> str:
    """Convert model name to URL-safe slug."""
    s = name.lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')[:100]


def _serialize(model: EdgeGPUModel) -> dict:
    """Serialize EdgeGPUModel to response dict."""
    config = None
    if model.provider_config:
        try:
            config = json.loads(str(model.provider_config))
        except (json.JSONDecodeError, TypeError):
            config = None

    engine_name = None
    if model.edge_engine:
        engine_name = str(model.edge_engine.name)

    return {
        "id": str(model.id),
        "name": str(model.name),
        "slug": str(model.slug),
        "model_type": str(model.model_type),
        "provider": str(model.provider),
        "model_id": str(model.model_id),
        "endpoint_url": str(model.endpoint_url) if model.endpoint_url else None,
        "provider_config": config,
        "edge_engine_id": str(model.edge_engine_id),
        "engine_name": engine_name,
        "is_active": bool(model.is_active),
        "schema": get_schema_for_model_type(str(model.model_type)),
        "created_at": str(model.created_at),
        "updated_at": str(model.updated_at),
    }


# =============================================================================
# Catalog — provider-agnostic model discovery
# =============================================================================

@router.get("/catalog")
async def get_catalog(
    provider_id: str,
    provider: str = "workers_ai",
    db: Session = Depends(get_db),
):
    """Fetch available models from a GPU provider.

    Uses the adapter factory to select the correct implementation.
    For CF Workers AI, calls GET /accounts/{id}/ai/models/search.
    """
    adapter = get_adapter(provider)

    # Build credentials dict based on provider
    if provider == "workers_ai":
        api_token, account_id = get_provider_credentials(provider_id, db)
        if not account_id:
            raise HTTPException(400, "Provider account missing account_id. Re-connect the provider.")
        credentials = {"api_token": api_token, "account_id": account_id}
    else:
        raise HTTPException(400, f"Catalog not yet supported for provider: {provider}")

    catalog = await adapter.fetch_catalog(credentials)

    # Group by model_type for the UI
    grouped: dict[str, list] = {}
    for item in catalog:
        mt = item.get("model_type", "other")
        grouped.setdefault(mt, []).append(item)

    return {
        "provider": provider,
        "total": len(catalog),
        "models_by_type": grouped,
    }


@router.get("/schemas")
async def get_schemas():
    """Return all available I/O schemas by task type."""
    return {"schemas": IO_SCHEMAS, "providers": available_providers()}


# =============================================================================
# CRUD
# =============================================================================

@router.get("/")
async def list_gpu_models(db: Session = Depends(get_db)):
    """List all deployed GPU models."""
    models = db.query(EdgeGPUModel).all()
    return [_serialize(m) for m in models]


@router.post("/")
async def create_gpu_model(payload: GPUModelCreate, db: Session = Depends(get_db)):
    """Deploy a new GPU model to an edge engine."""
    # Validate engine exists
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == payload.edge_engine_id).first()
    if not engine:
        raise HTTPException(404, "Edge engine not found")

    # Validate adapter exists
    get_adapter(payload.provider)

    now = datetime.now(timezone.utc).isoformat()
    slug = _slugify(payload.name)

    # Check slug uniqueness on this engine
    existing = db.query(EdgeGPUModel).filter(
        EdgeGPUModel.edge_engine_id == payload.edge_engine_id,
        EdgeGPUModel.slug == slug,
    ).first()
    if existing:
        raise HTTPException(409, f"Model with slug '{slug}' already exists on this engine")

    endpoint_url = f"{str(engine.url).rstrip('/')}/api/ai/{slug}"

    model = EdgeGPUModel(
        id=str(uuid.uuid4()),
        name=payload.name,
        slug=slug,
        model_type=payload.model_type,
        provider=payload.provider,
        model_id=payload.model_id,
        endpoint_url=endpoint_url,
        provider_config=json.dumps(payload.provider_config) if payload.provider_config else None,
        edge_engine_id=payload.edge_engine_id,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(model)
    db.commit()
    db.refresh(model)

    return _serialize(model)


@router.put("/{model_id}")
async def update_gpu_model(model_id: str, payload: GPUModelUpdate, db: Session = Depends(get_db)):
    """Update a GPU model's configuration."""
    model = db.query(EdgeGPUModel).filter(EdgeGPUModel.id == model_id).first()
    if not model:
        raise HTTPException(404, "GPU model not found")

    if payload.name is not None:
        model.name = payload.name  # type: ignore[assignment]
        model.slug = _slugify(payload.name)  # type: ignore[assignment]
        engine = db.query(EdgeEngine).filter(EdgeEngine.id == model.edge_engine_id).first()
        if engine:
            model.endpoint_url = f"{str(engine.url).rstrip('/')}/api/ai/{model.slug}"  # type: ignore[assignment]

    if payload.provider_config is not None:
        model.provider_config = json.dumps(payload.provider_config)  # type: ignore[assignment]

    if payload.is_active is not None:
        model.is_active = payload.is_active  # type: ignore[assignment]

    model.updated_at = datetime.now(timezone.utc).isoformat()  # type: ignore[assignment]
    db.commit()
    db.refresh(model)

    return _serialize(model)


@router.delete("/{model_id}")
async def delete_gpu_model(model_id: str, db: Session = Depends(get_db)):
    """Delete a GPU model."""
    model = db.query(EdgeGPUModel).filter(EdgeGPUModel.id == model_id).first()
    if not model:
        raise HTTPException(404, "GPU model not found")

    db.delete(model)
    db.commit()
    return {"detail": "GPU model deleted", "id": model_id}


# =============================================================================
# Test Inference
# =============================================================================

@router.post("/{model_id}/test")
async def test_gpu_model(model_id: str, db: Session = Depends(get_db)):
    """Test a deployed GPU model by running a sample inference."""
    model = db.query(EdgeGPUModel).filter(EdgeGPUModel.id == model_id).first()
    if not model:
        raise HTTPException(404, "GPU model not found")

    engine = db.query(EdgeEngine).filter(EdgeEngine.id == model.edge_engine_id).first()
    if not engine:
        raise HTTPException(404, "Associated edge engine not found")

    adapter = get_adapter(str(model.provider))
    result = await adapter.test_inference(
        model_id=str(model.model_id),
        model_type=str(model.model_type),
        engine_url=str(engine.url),
        slug=str(model.slug),
    )
    return result
