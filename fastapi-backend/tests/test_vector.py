"""Tests for vector backend factory + embedding dimension validation (Sprint 4C)."""
import pytest

from app.services.vector import get_vector_backend, PgVectorBackend
from app.services.vector.base import NotSupportedVectorBackend
from app.services.vector.embeddings import assert_dimensions


def test_pgvector_backend_resolved():
    b = get_vector_backend("pgvector", dsn="postgres://u:p@localhost/db")
    assert isinstance(b, PgVectorBackend)


def test_pgvector_aliases():
    for alias in ("supabase", "neon", "postgres", "postgres_vector"):
        b = get_vector_backend(alias, dsn="postgres://x")
        assert isinstance(b, PgVectorBackend)


def test_pgvector_requires_dsn():
    with pytest.raises(ValueError):
        get_vector_backend("pgvector")


def test_stubbed_backends_raise_on_use():
    for key in ("cloudflare_vectorize", "cf_vectorize", "vectorize"):
        b = get_vector_backend(key)
        assert isinstance(b, NotSupportedVectorBackend)
        import asyncio
        with pytest.raises(NotImplementedError):
            asyncio.run(b.search(table="t", column="c", query_vector=[0.1], top_k=5))


def test_edge_proxy_backends_require_db():
    for key in ("libsql_vector", "turso_vector", "embedded_lancedb", "embedded_sql_vector", "lancedb"):
        with pytest.raises(ValueError, match="requires a database session"):
            get_vector_backend(key)



def test_unknown_provider_raises():
    with pytest.raises(ValueError):
        get_vector_backend("pinecone")  # explicitly excluded from v1 trim


def test_dimension_validation():
    assert_dimensions([[1.0, 2.0, 3.0]], 3)  # ok
    with pytest.raises(ValueError):
        assert_dimensions([[1.0, 2.0]], 3)  # mismatch
    assert_dimensions([[1.0]], None)  # no expected dim → no-op
