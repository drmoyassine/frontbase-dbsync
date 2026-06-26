"""
Vector backend factory (Sprint 4C + libSQL proxy).

get_vector_backend(provider, db=..., tenant_id=...) → VectorBackend

v1 concrete:
  - 'pgvector' (reuses Postgres; zero new infra)
  - 'libsql_vector' / 'turso_vector' / 'embedded_lancedb' → EdgeVectorProxyBackend

Stubbed (interface-conforming, raise on use): 'cloudflare_vectorize'.
See base.NotSupportedVectorBackend.

The proxy backends (libsql_vector, turso_vector, embedded_lancedb) route vector
operations to the local edge engine over HTTP. The edge hosts libSQL (default)
or LanceDB (opt-in LANCEDB_ENABLED=true). Tenant isolation is enforced via
table name prefixing (tenant_{tenant_id}_{table}).
"""

from __future__ import annotations

import json
from logging import getLogger
from typing import Optional

from sqlalchemy.orm import Session

from .base import VectorBackend, NotSupportedVectorBackend
from .pgvector_backend import PgVectorBackend
from .edge_proxy_backend import EdgeVectorProxyBackend

logger = getLogger(__name__)


def get_vector_backend(
    provider: str,
    *,
    dsn: Optional[str] = None,
    db: Optional[Session] = None,
    tenant_id: Optional[str] = None,
) -> VectorBackend:
    """Resolve a vector backend by provider key.

    Args:
        provider: The vector provider key (pgvector, libsql_vector, etc.)
        dsn: Required for pgvector (Postgres connection string of the target datasource)
        db: Required for edge proxy backends (libsql_vector, embedded_lancedb, etc.)
            Used to query the system EdgeEngine for its URL and system_key.
        tenant_id: Used for edge proxy backends to enforce tenant isolation via
            table name prefixing.

    Returns:
        A VectorBackend instance.

    Raises:
        ValueError: If required parameters are missing or provider is unknown.
    """
    key = (provider or "").lower()

    # pgvector: direct Postgres connection
    if key in ("pgvector", "postgres", "postgres_vector", "supabase", "neon"):
        if not dsn:
            raise ValueError("pgvector backend requires a Postgres DSN")
        return PgVectorBackend(dsn)

    # Edge proxy backends: libsql_vector, turso_vector, embedded_lancedb, embedded_sql_vector
    # All route to the local edge engine over HTTP with x-system-key auth.
    if key in ("libsql_vector", "turso_vector", "embedded_lancedb", "embedded_sql_vector", "lancedb"):
        if not db:
            raise ValueError(f"{provider} backend requires a database session to resolve the edge engine")
        return _resolve_edge_proxy_backend(provider, db, tenant_id)

    # Cloud stubs
    if key in ("cloudflare_vectorize", "cf_vectorize", "vectorize"):
        return NotSupportedVectorBackend(
            "cloudflare_vectorize",
            "Cloudflare Vectorize is stubbed for v1. Implement via "
            "POST /accounts/{id}/vectorize/v2/indexes/{name}/query.",
        )

    raise ValueError(f"Unknown vector provider: {provider!r}")


def _resolve_edge_proxy_backend(provider: str, db: Session, tenant_id: Optional[str]) -> VectorBackend:
    """Resolve the edge proxy backend by querying the system EdgeEngine.

    The edge engine is the is_system=True EdgeEngine record. Its URL and
    system_key (encrypted in engine_config) are used to proxy vector requests.
    """
    from app.models.models import EdgeEngine

    # Find the system edge engine
    sys_engine = db.query(EdgeEngine).filter(EdgeEngine.is_system == True).first()
    if not sys_engine:
        raise ValueError("System edge engine not found. Vector backends require a configured edge engine.")

    edge_url = sys_engine.url
    if not edge_url:
        raise ValueError("System edge engine has no URL configured")

    # Decrypt system_key from engine_config
    from app.services.secrets_builder import decrypt_field

    config = json.loads(sys_engine.engine_config or "{}")
    system_key = decrypt_field(config.get("system_key", ""))

    if not system_key:
        raise ValueError("System edge engine has no system_key configured")

    logger.debug(f"Resolved edge proxy backend for {provider}: {edge_url}")

    return EdgeVectorProxyBackend(edge_url, system_key, tenant_id)


__all__ = ["get_vector_backend", "VectorBackend", "PgVectorBackend", "EdgeVectorProxyBackend"]
