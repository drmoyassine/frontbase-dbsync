"""
Engine Secrets Builder — Single Source of Truth.

Builds FRONTBASE_* environment variables from DB/cache/queue records.
Used by: deploy_to_cloudflare, redeploy_engine, reconfigure_engine.

Previously this logic was duplicated 3x across cloudflare.py and edge_engines.py.
"""

from sqlalchemy.orm import Session
from ..models.models import EdgeDatabase, EdgeCache, EdgeQueue


# Frontbase-managed binding names — only these are touched during reconfigure
FRONTBASE_BINDING_NAMES = frozenset([
    'FRONTBASE_STATE_DB_URL',
    'FRONTBASE_STATE_DB_TOKEN',
    'FRONTBASE_CACHE_URL',
    'FRONTBASE_CACHE_TOKEN',
    'FRONTBASE_QUEUE_PROVIDER',
    'FRONTBASE_QUEUE_URL',
    'FRONTBASE_QUEUE_TOKEN',
    'FRONTBASE_QUEUE_SIGNING_KEY',
    'FRONTBASE_QUEUE_NEXT_SIGNING_KEY',
])


def build_engine_secrets(
    db: Session,
    edge_db_id: str | None,
    edge_cache_id: str | None,
    edge_queue_id: str | None,
) -> dict[str, str]:
    """Build FRONTBASE_* env vars from DB/cache/queue records.
    
    Returns a dict of secret_name → secret_value.
    Only includes non-None values.
    """
    secrets: dict[str, str] = {}

    # Database
    if edge_db_id:
        edge_db = db.query(EdgeDatabase).filter(EdgeDatabase.id == edge_db_id).first()
        if edge_db:
            secrets['FRONTBASE_STATE_DB_URL'] = str(edge_db.db_url)
            if edge_db.db_token:  # type: ignore[truthy-bool]
                secrets['FRONTBASE_STATE_DB_TOKEN'] = str(edge_db.db_token)

    # Cache
    if edge_cache_id:
        edge_cache = db.query(EdgeCache).filter(EdgeCache.id == edge_cache_id).first()
        if edge_cache:
            secrets['FRONTBASE_CACHE_URL'] = str(edge_cache.cache_url)
            if edge_cache.cache_token:  # type: ignore[truthy-bool]
                secrets['FRONTBASE_CACHE_TOKEN'] = str(edge_cache.cache_token)

    # Queue (provider-agnostic)
    if edge_queue_id:
        edge_queue = db.query(EdgeQueue).filter(EdgeQueue.id == edge_queue_id).first()
        if edge_queue:
            secrets['FRONTBASE_QUEUE_PROVIDER'] = str(edge_queue.provider)
            secrets['FRONTBASE_QUEUE_URL'] = str(edge_queue.queue_url)
            if edge_queue.queue_token:  # type: ignore[truthy-bool]
                secrets['FRONTBASE_QUEUE_TOKEN'] = str(edge_queue.queue_token)
            if edge_queue.signing_key:  # type: ignore[truthy-bool]
                secrets['FRONTBASE_QUEUE_SIGNING_KEY'] = str(edge_queue.signing_key)
            if edge_queue.next_signing_key:  # type: ignore[truthy-bool]
                secrets['FRONTBASE_QUEUE_NEXT_SIGNING_KEY'] = str(edge_queue.next_signing_key)

    return secrets
