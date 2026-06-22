"""
Vector backend factory (Sprint 4C).

get_vector_backend(provider) → VectorBackend

v1 concrete: 'pgvector' (reuses Postgres; zero new infra).
Stubbed (interface-conforming, raise on use): 'cloudflare_vectorize', 'turso_vector',
'embedded_lancedb'. See base.NotSupportedVectorBackend.

Trimmed from the original 8-provider ask (Pinecone/Weaviate/Qdrant/ChromaDB Cloud
excluded — they'd need new provider accounts + billing). See sprint4.md §4C.
"""

from __future__ import annotations

from typing import Optional

from .base import VectorBackend, NotSupportedVectorBackend
from .pgvector_backend import PgVectorBackend


def get_vector_backend(provider: str, *, dsn: Optional[str] = None) -> VectorBackend:
    """Resolve a vector backend by provider key.

    `dsn` is required for pgvector (the Postgres connection string of the target
    datasource). The cloud/vector-native backends carry their own creds at call time.
    """
    key = (provider or "").lower()

    if key in ("pgvector", "postgres", "postgres_vector", "supabase", "neon"):
        if not dsn:
            raise ValueError("pgvector backend requires a Postgres DSN")
        return PgVectorBackend(dsn)

    if key in ("cloudflare_vectorize", "cf_vectorize", "vectorize"):
        return NotSupportedVectorBackend(
            "cloudflare_vectorize",
            "Cloudflare Vectorize is stubbed for v1. Implement via "
            "POST /accounts/{id}/vectorize/v2/indexes/{name}/query.",
        )

    if key in ("turso_vector", "libsql_vector"):
        return NotSupportedVectorBackend(
            "turso_vector",
            "Turso vector (libsql) is stubbed for v1. Implement vector_match() via libsql.",
        )

    if key in ("embedded_lancedb", "lancedb"):
        return NotSupportedVectorBackend(
            "embedded_lancedb",
            "Embedded LanceDB is stubbed for v1. Implement via @lancedb/lancedb on the edge.",
        )

    raise ValueError(f"Unknown vector provider: {provider!r}")


__all__ = ["get_vector_backend", "VectorBackend", "PgVectorBackend"]
