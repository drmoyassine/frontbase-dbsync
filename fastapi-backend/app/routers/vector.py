"""
Vector search router (Sprint 4C) — semantic-search RPC seam.

POST /api/vector/search  → embed the query, run nearest-neighbour on the backend.
POST /api/vector/upsert  → embed texts, store vectors.

Both accept an explicit provider + connection + embedding config so they work as a
generic seam; a higher-level integration can resolve these from a datasource record.
Cloud-gated + tenant-scoped.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.config import get_db
from app.middleware.tenant_context import TenantContext, get_tenant_context
from app.services.vector import get_vector_backend
from app.services.vector.embeddings import EmbeddingConfig, embed, assert_dimensions

router = APIRouter(prefix="/api/vector", tags=["vector"])


class EmbeddingParams(BaseModel):
    base_url: str
    api_key: Optional[str] = None
    model: str = "text-embedding-3-small"
    dimensions: Optional[int] = None


class VectorSearchParams(BaseModel):
    provider: str = "pgvector"
    dsn: Optional[str] = None            # required for pgvector
    table: str
    column: str = "embedding"
    query: str
    top_k: int = 10
    embedding: EmbeddingParams


class VectorUpsertItem(BaseModel):
    id: str
    text: str


class VectorUpsertParams(BaseModel):
    provider: str = "pgvector"
    dsn: Optional[str] = None
    table: str
    column: str = "embedding"
    dimensions: Optional[int] = None
    items: list[VectorUpsertItem]
    embedding: EmbeddingParams


def _backend(provider: str, dsn: Optional[str], db, tenant_id: Optional[str] = None):
    try:
        return get_vector_backend(provider, dsn=dsn, db=db, tenant_id=tenant_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/search")
async def vector_search(
    params: VectorSearchParams,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Embed the query and return the top_k nearest rows from the vector store."""
    backend = _backend(params.provider, params.dsn, db, ctx.tenant_id if ctx else None)
    emb_cfg = EmbeddingConfig(**params.embedding.model_dump())

    try:
        vectors = await embed([params.query], emb_cfg)
        if not vectors:
            raise HTTPException(502, "Embedding service returned no vectors")
        assert_dimensions(vectors, emb_cfg.dimensions)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Embedding failed: {e}")

    try:
        results = await backend.search(
            table=params.table,
            column=params.column,
            query_vector=vectors[0],
            top_k=params.top_k,
        )
    except NotImplementedError as e:
        raise HTTPException(501, str(e))
    except Exception as e:
        raise HTTPException(500, f"Vector search failed: {e}")

    return {"success": True, "results": results}


@router.post("/upsert")
async def vector_upsert(
    params: VectorUpsertParams,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Embed a batch of texts and upsert them into the vector store."""
    if not params.items:
        return {"success": True, "upserted": 0}
    backend = _backend(params.provider, params.dsn, db, ctx.tenant_id if ctx else None)
    emb_cfg = EmbeddingConfig(**params.embedding.model_dump())
    dims = params.dimensions or emb_cfg.dimensions

    try:
        texts = [item.text for item in params.items]
        vectors = await embed(texts, emb_cfg)
        assert_dimensions(vectors, dims)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Embedding failed: {e}")

    rows = [{"id": item.id, "vector": vec} for item, vec in zip(params.items, vectors)]

    # Ensure the column + index exist before the first write (idempotent).
    if dims:
        try:
            await backend.ensure_index(table=params.table, column=params.column, dimensions=dims)
        except NotImplementedError:
            pass  # stubbed backends have no schema step

    try:
        upserted = await backend.upsert(table=params.table, column=params.column, rows=rows)
    except NotImplementedError as e:
        raise HTTPException(501, str(e))
    except Exception as e:
        raise HTTPException(500, f"Vector upsert failed: {e}")

    return {"success": True, "upserted": upserted}
