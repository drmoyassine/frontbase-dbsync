"""
Engine Secrets Builder — Single Source of Truth.

Builds FRONTBASE_* environment variables from DB/cache/queue records.
Used by: deploy_to_cloudflare, redeploy_engine, reconfigure_engine.

Provider-aware: emits FRONTBASE_STATE_DB_PROVIDER, FRONTBASE_CACHE_PROVIDER,
and for CF resources on non-CF targets: FRONTBASE_CF_API_TOKEN + _CF_ACCOUNT_ID.
"""

import json
from sqlalchemy.orm import Session
from ..models.models import EdgeDatabase, EdgeCache, EdgeQueue


# Frontbase-managed binding names — only these are touched during reconfigure
FRONTBASE_BINDING_NAMES = frozenset([
    # Database
    'FRONTBASE_STATE_DB_URL',
    'FRONTBASE_STATE_DB_TOKEN',
    'FRONTBASE_STATE_DB_PROVIDER',
    # Cache
    'FRONTBASE_CACHE_URL',
    'FRONTBASE_CACHE_TOKEN',
    'FRONTBASE_CACHE_PROVIDER',
    # Queue
    'FRONTBASE_QUEUE_PROVIDER',
    'FRONTBASE_QUEUE_URL',
    'FRONTBASE_QUEUE_TOKEN',
    'FRONTBASE_QUEUE_SIGNING_KEY',
    'FRONTBASE_QUEUE_NEXT_SIGNING_KEY',
    # CF cross-platform (injected for CF resources on non-CF engines)
    'FRONTBASE_CF_API_TOKEN',
    'FRONTBASE_CF_ACCOUNT_ID',
    # Auth
    'FRONTBASE_API_KEY_HASHES',
    # GPU
    'FRONTBASE_GPU_MODELS',
])


def _get_provider_config(resource: object) -> dict:
    """Safely parse the provider_config JSON from a resource record."""
    config_str = getattr(resource, 'provider_config', None)
    if not config_str:
        return {}
    try:
        return json.loads(str(config_str))
    except (json.JSONDecodeError, TypeError):
        return {}


def build_engine_secrets(
    db: Session,
    edge_db_id: str | None,
    edge_cache_id: str | None,
    edge_queue_id: str | None,
    engine_id: str | None = None,
    deploy_provider: str | None = None,
) -> dict[str, str]:
    """Build FRONTBASE_* env vars from DB/cache/queue/GPU records.
    
    Args:
        db: SQLAlchemy session
        edge_db_id: EdgeDatabase record ID
        edge_cache_id: EdgeCache record ID
        edge_queue_id: EdgeQueue record ID
        engine_id: EdgeEngine record ID (for GPU models and API keys)
        deploy_provider: The engine's provider type (e.g. "cloudflare", "vercel").
                         Used for deploy-time dual path: CF resources on CF engines
                         use native bindings, on others use HTTP API + scoped token.
    
    Returns a dict of secret_name → secret_value.
    Only includes non-None values.
    """
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

    # ─── Database ────────────────────────────────────────────────────────
    if edge_db_id:
        edge_db = db.query(EdgeDatabase).filter(EdgeDatabase.id == edge_db_id).first()
        if edge_db:
            db_provider = str(edge_db.provider)
            secrets['FRONTBASE_STATE_DB_PROVIDER'] = db_provider
            secrets['FRONTBASE_STATE_DB_URL'] = str(edge_db.db_url)
            token = decrypt_field(str(edge_db.db_token)) if edge_db.db_token else None  # type: ignore[truthy-bool]
            if token:
                secrets['FRONTBASE_STATE_DB_TOKEN'] = token

            # CF resources on non-CF engines: inject scoped token for HTTP API access
            if db_provider == 'cloudflare' and deploy_provider != 'cloudflare':
                config = _get_provider_config(edge_db)
                scoped_value = config.get('scoped_token_value')
                if scoped_value:
                    decrypted = decrypt_field(scoped_value)
                    if decrypted:
                        secrets['FRONTBASE_CF_API_TOKEN'] = decrypted
                cf_account = config.get('cf_account_id')
                if cf_account:
                    secrets['FRONTBASE_CF_ACCOUNT_ID'] = cf_account

    # ─── Cache ───────────────────────────────────────────────────────────
    if edge_cache_id:
        edge_cache = db.query(EdgeCache).filter(EdgeCache.id == edge_cache_id).first()
        if edge_cache:
            cache_provider = str(edge_cache.provider)
            secrets['FRONTBASE_CACHE_PROVIDER'] = cache_provider
            secrets['FRONTBASE_CACHE_URL'] = str(edge_cache.cache_url)
            token = decrypt_field(str(edge_cache.cache_token)) if edge_cache.cache_token else None  # type: ignore[truthy-bool]
            if token:
                secrets['FRONTBASE_CACHE_TOKEN'] = token

            # CF KV on non-CF engines: inject scoped token
            if cache_provider == 'cloudflare' and deploy_provider != 'cloudflare':
                config = _get_provider_config(edge_cache)
                scoped_value = config.get('scoped_token_value')
                if scoped_value:
                    decrypted = decrypt_field(scoped_value)
                    if decrypted:
                        secrets['FRONTBASE_CF_API_TOKEN'] = decrypted
                cf_account = config.get('cf_account_id')
                if cf_account:
                    secrets['FRONTBASE_CF_ACCOUNT_ID'] = cf_account

    # ─── Queue (provider-agnostic) ───────────────────────────────────────
    if edge_queue_id:
        edge_queue = db.query(EdgeQueue).filter(EdgeQueue.id == edge_queue_id).first()
        if edge_queue:
            queue_provider = str(edge_queue.provider)
            secrets['FRONTBASE_QUEUE_PROVIDER'] = queue_provider
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

            # CF Queues on non-CF engines: inject scoped token
            if queue_provider == 'cloudflare' and deploy_provider != 'cloudflare':
                config = _get_provider_config(edge_queue)
                scoped_value = config.get('scoped_token_value')
                if scoped_value:
                    decrypted = decrypt_field(scoped_value)
                    if decrypted:
                        secrets['FRONTBASE_CF_API_TOKEN'] = decrypted
                cf_account = config.get('cf_account_id')
                if cf_account:
                    secrets['FRONTBASE_CF_ACCOUNT_ID'] = cf_account

    return secrets
