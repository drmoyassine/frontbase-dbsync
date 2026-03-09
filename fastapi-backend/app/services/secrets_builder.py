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
    'FRONTBASE_API_KEY_HASHES',
])


def build_engine_secrets(
    db: Session,
    edge_db_id: str | None,
    edge_cache_id: str | None,
    edge_queue_id: str | None,
    engine_id: str | None = None,
) -> dict[str, str]:
    """Build FRONTBASE_* env vars from DB/cache/queue/GPU records.
    
    Returns a dict of secret_name → secret_value.
    Only includes non-None values.
    """
    import json
    from ..core.security import decrypt_field
    secrets: dict[str, str] = {}

    # GPU Models — serialize model registry for the AI route
    if engine_id:
        from ..models.models import EdgeGPUModel
        gpu_models = db.query(EdgeGPUModel).filter(
            EdgeGPUModel.edge_engine_id == engine_id,
            EdgeGPUModel.is_active == True,
        ).all()
        if gpu_models:
            models_data = [{
                "slug": str(m.slug),
                "model_id": str(m.model_id),
                "model_type": str(m.model_type),
                "provider": str(m.provider),
            } for m in gpu_models]
            secrets['FRONTBASE_GPU_MODELS'] = json.dumps(models_data)

    # API Keys — serialize key hashes for edge auth middleware
    if engine_id:
        from ..models.models import EdgeAPIKey
        api_keys = db.query(EdgeAPIKey).filter(
            EdgeAPIKey.is_active == True,
            (EdgeAPIKey.edge_engine_id == engine_id) | (EdgeAPIKey.edge_engine_id == None),
        ).all()
        if api_keys:
            keys_data = [{
                "prefix": str(k.prefix),
                "hash": str(k.key_hash),
                "expires_at": str(k.expires_at) if k.expires_at else None,  # type: ignore[truthy-bool]
            } for k in api_keys]
            secrets['FRONTBASE_API_KEY_HASHES'] = json.dumps(keys_data)

    # Database
    if edge_db_id:
        edge_db = db.query(EdgeDatabase).filter(EdgeDatabase.id == edge_db_id).first()
        if edge_db:
            secrets['FRONTBASE_STATE_DB_URL'] = str(edge_db.db_url)
            token = decrypt_field(str(edge_db.db_token)) if edge_db.db_token else None  # type: ignore[truthy-bool]
            if token:
                secrets['FRONTBASE_STATE_DB_TOKEN'] = token

    # Cache
    if edge_cache_id:
        edge_cache = db.query(EdgeCache).filter(EdgeCache.id == edge_cache_id).first()
        if edge_cache:
            secrets['FRONTBASE_CACHE_URL'] = str(edge_cache.cache_url)
            token = decrypt_field(str(edge_cache.cache_token)) if edge_cache.cache_token else None  # type: ignore[truthy-bool]
            if token:
                secrets['FRONTBASE_CACHE_TOKEN'] = token

    # Queue (provider-agnostic)
    if edge_queue_id:
        edge_queue = db.query(EdgeQueue).filter(EdgeQueue.id == edge_queue_id).first()
        if edge_queue:
            secrets['FRONTBASE_QUEUE_PROVIDER'] = str(edge_queue.provider)
            secrets['FRONTBASE_QUEUE_URL'] = str(edge_queue.queue_url)
            token = decrypt_field(str(edge_queue.queue_token)) if edge_queue.queue_token else None  # type: ignore[truthy-bool]
            if token:
                secrets['FRONTBASE_QUEUE_TOKEN'] = token
            sk = decrypt_field(str(edge_queue.signing_key)) if edge_queue.signing_key else None  # type: ignore[truthy-bool]
            if sk:
                secrets['FRONTBASE_QUEUE_SIGNING_KEY'] = sk
            nsk = decrypt_field(str(edge_queue.next_signing_key)) if edge_queue.next_signing_key else None  # type: ignore[truthy-bool]
            if nsk:
                secrets['FRONTBASE_QUEUE_NEXT_SIGNING_KEY'] = nsk

    return secrets
