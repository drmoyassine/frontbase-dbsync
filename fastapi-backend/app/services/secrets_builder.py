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
    # PG schema isolation
    'FRONTBASE_SCHEMA_NAME',
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

            config = _get_provider_config(edge_db)

            if db_provider == 'supabase':
                # PostgREST via @supabase/postgrest-js — env vars from provider_config
                supabase_url = config.get('supabase_url', str(edge_db.db_url))
                anon_key = config.get('anon_key', '')
                scoped_jwt = config.get('scoped_jwt', '')
                schema_name = config.get('schema_name', 'frontbase_edge')

                secrets['FRONTBASE_SUPABASE_URL'] = supabase_url
                if anon_key:
                    secrets['FRONTBASE_SUPABASE_ANON_KEY'] = anon_key
                if scoped_jwt:
                    secrets['FRONTBASE_SUPABASE_JWT'] = scoped_jwt
                if schema_name:
                    secrets['FRONTBASE_SCHEMA_NAME'] = str(schema_name)
            else:
                # Non-Supabase providers: PG wire protocol URL
                secrets['FRONTBASE_STATE_DB_URL'] = str(edge_db.db_url)

                token = decrypt_field(str(edge_db.db_token)) if edge_db.db_token else None  # type: ignore[truthy-bool]
                if token:
                    secrets['FRONTBASE_STATE_DB_TOKEN'] = token

                # PG schema isolation
                if db_provider in ('neon', 'postgres'):
                    schema_name = config.get('schema_name')
                    if schema_name:
                        secrets['FRONTBASE_SCHEMA_NAME'] = str(schema_name)

            # CF D1 databases: always inject CF API credentials.
            # CfD1HttpProvider uses HTTP REST API (not native bindings),
            # so it needs these env vars regardless of deploy target.
            if db_provider == 'cloudflare':
                config = _get_provider_config(edge_db)
                scoped_value = config.get('scoped_token_value')
                if scoped_value:
                    decrypted = decrypt_field(scoped_value)
                    if decrypted:
                        secrets['FRONTBASE_CF_API_TOKEN'] = decrypted
                cf_account = config.get('cf_account_id')
                if cf_account:
                    secrets['FRONTBASE_CF_ACCOUNT_ID'] = cf_account

                # Fallback: if no scoped token in provider_config, use the
                # linked provider account's API token (CF-on-CF deploys)
                if 'FRONTBASE_CF_API_TOKEN' not in secrets and edge_db.provider_account_id:
                    from ..models.models import EdgeProviderAccount
                    provider_acct = db.query(EdgeProviderAccount).filter(
                        EdgeProviderAccount.id == edge_db.provider_account_id
                    ).first()
                    if provider_acct and provider_acct.provider_credentials:
                        from ..core.security import decrypt_credentials
                        creds = decrypt_credentials(str(provider_acct.provider_credentials))
                        if creds.get('api_token'):
                            secrets['FRONTBASE_CF_API_TOKEN'] = creds['api_token']
                        if creds.get('account_id') and 'FRONTBASE_CF_ACCOUNT_ID' not in secrets:
                            secrets['FRONTBASE_CF_ACCOUNT_ID'] = creds['account_id']

    # ─── Cache ───────────────────────────────────────────────────────────
    if edge_cache_id:
        edge_cache = db.query(EdgeCache).filter(EdgeCache.id == edge_cache_id).first()
        if edge_cache:
            cache_provider = str(edge_cache.provider)
            secrets['FRONTBASE_CACHE_PROVIDER'] = cache_provider

            # Deno KV: built-in runtime feature, no URL/token needed
            if cache_provider == 'deno_kv':
                pass  # Only FRONTBASE_CACHE_PROVIDER is needed
            elif cache_provider == 'cloudflare':
                cache_url = str(edge_cache.cache_url)
                # CF KV: normalize namespace ID to kv:// convention
                if not cache_url.startswith('kv://'):
                    cache_url = f'kv://{cache_url}'
                secrets['FRONTBASE_CACHE_URL'] = cache_url
                token = decrypt_field(str(edge_cache.cache_token)) if edge_cache.cache_token else None  # type: ignore[truthy-bool]
                if token:
                    secrets['FRONTBASE_CACHE_TOKEN'] = token
            else:
                cache_url = str(edge_cache.cache_url)
                secrets['FRONTBASE_CACHE_URL'] = cache_url
                token = decrypt_field(str(edge_cache.cache_token)) if edge_cache.cache_token else None  # type: ignore[truthy-bool]
                if token:
                    secrets['FRONTBASE_CACHE_TOKEN'] = token

            # CF KV cache: inject CF API credentials if not already set by DB section.
            # All CF resources share FRONTBASE_CF_API_TOKEN — first (broadest) token wins
            # to prevent narrowly-scoped KV tokens from breaking D1 access.
            if cache_provider == 'cloudflare' and 'FRONTBASE_CF_API_TOKEN' not in secrets:
                config = _get_provider_config(edge_cache)
                scoped_value = config.get('scoped_token_value')
                if scoped_value:
                    decrypted = decrypt_field(scoped_value)
                    if decrypted:
                        secrets['FRONTBASE_CF_API_TOKEN'] = decrypted
                cf_account = config.get('cf_account_id')
                if cf_account and 'FRONTBASE_CF_ACCOUNT_ID' not in secrets:
                    secrets['FRONTBASE_CF_ACCOUNT_ID'] = cf_account

                # Fallback: resolve from linked provider account
                if 'FRONTBASE_CF_API_TOKEN' not in secrets and edge_cache.provider_account_id:
                    from ..models.models import EdgeProviderAccount
                    provider_acct = db.query(EdgeProviderAccount).filter(
                        EdgeProviderAccount.id == edge_cache.provider_account_id
                    ).first()
                    if provider_acct and provider_acct.provider_credentials:
                        from ..core.security import decrypt_credentials
                        creds = decrypt_credentials(str(provider_acct.provider_credentials))
                        if creds.get('api_token'):
                            secrets['FRONTBASE_CF_API_TOKEN'] = creds['api_token']
                        if creds.get('account_id') and 'FRONTBASE_CF_ACCOUNT_ID' not in secrets:
                            secrets['FRONTBASE_CF_ACCOUNT_ID'] = creds['account_id']

    # ─── Queue (provider-agnostic) ───────────────────────────────────────
    if edge_queue_id:
        edge_queue = db.query(EdgeQueue).filter(EdgeQueue.id == edge_queue_id).first()
        if edge_queue:
            queue_provider = str(edge_queue.provider)
            secrets['FRONTBASE_QUEUE_PROVIDER'] = queue_provider
            queue_url = str(edge_queue.queue_url)
            # CF Queues: normalize queue ID to cfq:// convention (matches d1:// for D1)
            if queue_provider == 'cloudflare' and not queue_url.startswith('cfq://'):
                queue_url = f'cfq://{queue_url}'
            secrets['FRONTBASE_QUEUE_URL'] = queue_url
            token = decrypt_field(str(edge_queue.queue_token)) if edge_queue.queue_token else None  # type: ignore[truthy-bool]
            if token:
                secrets['FRONTBASE_QUEUE_TOKEN'] = token
            sk = decrypt_field(str(edge_queue.signing_key)) if edge_queue.signing_key else None  # type: ignore[truthy-bool]
            if sk:
                secrets['FRONTBASE_QUEUE_SIGNING_KEY'] = sk
            nsk = decrypt_field(str(edge_queue.next_signing_key)) if edge_queue.next_signing_key else None  # type: ignore[truthy-bool]
            if nsk:
                secrets['FRONTBASE_QUEUE_NEXT_SIGNING_KEY'] = nsk

            # CF Queues: inject CF API credentials if not already set.
            if queue_provider == 'cloudflare' and 'FRONTBASE_CF_API_TOKEN' not in secrets:
                config = _get_provider_config(edge_queue)
                scoped_value = config.get('scoped_token_value')
                if scoped_value:
                    decrypted = decrypt_field(scoped_value)
                    if decrypted:
                        secrets['FRONTBASE_CF_API_TOKEN'] = decrypted
                cf_account = config.get('cf_account_id')
                if cf_account and 'FRONTBASE_CF_ACCOUNT_ID' not in secrets:
                    secrets['FRONTBASE_CF_ACCOUNT_ID'] = cf_account

                # Fallback: resolve from linked provider account
                if 'FRONTBASE_CF_API_TOKEN' not in secrets and edge_queue.provider_account_id:
                    from ..models.models import EdgeProviderAccount
                    provider_acct = db.query(EdgeProviderAccount).filter(
                        EdgeProviderAccount.id == edge_queue.provider_account_id
                    ).first()
                    if provider_acct and provider_acct.provider_credentials:
                        from ..core.security import decrypt_credentials
                        creds = decrypt_credentials(str(provider_acct.provider_credentials))
                        if creds.get('api_token'):
                            secrets['FRONTBASE_CF_API_TOKEN'] = creds['api_token']
                        if creds.get('account_id') and 'FRONTBASE_CF_ACCOUNT_ID' not in secrets:
                            secrets['FRONTBASE_CF_ACCOUNT_ID'] = creds['account_id']

    return secrets
