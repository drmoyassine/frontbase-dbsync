"""
Engine Secrets Builder — Single Source of Truth.

Builds 6 JSON FRONTBASE_* environment variables from DB/cache/queue/auth records.
Used by: deploy APIs, redeploy, reconfigure, inspector.

Output env vars:
  FRONTBASE_STATE_DB      — State DB config (provider-discriminated JSON)
  FRONTBASE_AUTH          — Auth + users config (JSON)
  FRONTBASE_CACHE         — Cache config (provider-discriminated JSON)
  FRONTBASE_QUEUE         — Queue config (provider-discriminated JSON)
  FRONTBASE_GPU           — GPU model registry (JSON array)
  FRONTBASE_DATASOURCES   — Datasource credentials for proxy-strategy data fetching (JSON)
"""

import json
from sqlalchemy.orm import Session
from ..models.models import EdgeDatabase, EdgeCache, EdgeQueue


# Frontbase-managed binding names — only these are touched during reconfigure
FRONTBASE_BINDING_NAMES = frozenset([
    'FRONTBASE_STATE_DB',
    'FRONTBASE_AUTH',
    'FRONTBASE_API_KEYS',
    'FRONTBASE_CACHE',
    'FRONTBASE_QUEUE',
    'FRONTBASE_GPU',
    'FRONTBASE_DATASOURCES',
    'FRONTBASE_AGENT_PROFILES',
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


def _resolve_cf_credentials(db: Session, resource: object) -> dict:
    """Resolve Cloudflare API credentials from a resource.
    
    Chain: scoped_token_value in provider_config → linked provider account.
    Returns dict with cfApiToken, cfAccountId (only non-None entries).
    """
    from ..core.security import decrypt_field
    result: dict[str, str] = {}
    config = _get_provider_config(resource)

    # 1. Scoped token from provider_config
    scoped_value = config.get('scoped_token_value')
    if scoped_value:
        decrypted = decrypt_field(scoped_value)
        if decrypted:
            result['cfApiToken'] = decrypted
    cf_account = config.get('cf_account_id')
    if cf_account:
        result['cfAccountId'] = cf_account

    # 2. Fallback: linked provider account
    provider_account_id = getattr(resource, 'provider_account_id', None)
    if 'cfApiToken' not in result and str(provider_account_id or ''):
        from ..models.models import EdgeProviderAccount
        from ..core.security import decrypt_credentials
        provider_acct = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == provider_account_id
        ).first()
        if provider_acct and str(provider_acct.provider_credentials or ''):
            creds = decrypt_credentials(str(provider_acct.provider_credentials))
            if creds.get('api_token'):
                result['cfApiToken'] = creds['api_token']
            if creds.get('account_id') and 'cfAccountId' not in result:
                result['cfAccountId'] = creds['account_id']

    return result


def _build_api_keys_config(db: Session, engine_id: str | None) -> dict:
    """Build FRONTBASE_API_KEYS JSON blob.

    Contains engine access control — system key + user API key hashes.
    Separated from FRONTBASE_AUTH (user authentication) to avoid mixed concerns.
    """
    from ..core.security import decrypt_field
    config: dict = {}

    if not engine_id:
        return config

    # ── System Key ───────────────────────────────────────────────────────
    from ..models.models import EdgeEngine as _EdgeEngine
    _engine = db.query(_EdgeEngine).filter(_EdgeEngine.id == engine_id).first()
    if _engine and str(_engine.engine_config or ''):
        try:
            _cfg = json.loads(str(_engine.engine_config))
            _encrypted_key = _cfg.get('system_key')
            if _encrypted_key:
                _raw_key = decrypt_field(_encrypted_key)
                if _raw_key:
                    config['systemKey'] = _raw_key
        except (json.JSONDecodeError, TypeError):
            pass

    # ── API Key Hashes ───────────────────────────────────────────────────
    from ..models.models import EdgeAPIKey
    from ..database.utils import decrypt_data
    import hashlib
    api_keys = db.query(EdgeAPIKey).filter(
        EdgeAPIKey.is_active == True,
        (EdgeAPIKey.edge_engine_id == engine_id) | (EdgeAPIKey.edge_engine_id == None),
    ).all()
    if api_keys:
        hashes = []
        for k in api_keys:
            raw_hash = str(k.key_hash)
            # Fernet-encrypted keys start with 'gAAAAA' — decrypt and SHA-256
            # Legacy keys are already 64-char hex SHA-256 hashes
            if raw_hash.startswith('gAAAAA'):
                try:
                    full_key = decrypt_data(raw_hash)
                    derived = hashlib.sha256(full_key.encode()).hexdigest()
                except Exception:
                    derived = raw_hash  # Fallback: push as-is
            else:
                derived = raw_hash  # Already a legacy SHA-256 hash
            hashes.append({
                "prefix": str(k.prefix),
                "hash": derived,
                "scope": str(k.scope) if k.scope else 'user',  # type: ignore[truthy-bool]
                "expires_at": str(k.expires_at) if k.expires_at else None,  # type: ignore[truthy-bool]
            })
        config['apiKeyHashes'] = hashes

    return config


def _build_agent_profiles_config(db: Session, engine_id: str | None) -> dict:
    """Build FRONTBASE_AGENT_PROFILES JSON blob.

    Contains all AI Agent Personas registered to this engine, including their Let
    system prompts and granular data-access permissions.
    """
    config: dict = {}
    if not engine_id:
        return config

    from ..models.models import EdgeAgentProfile
    profiles = db.query(EdgeAgentProfile).filter(EdgeAgentProfile.engine_id == engine_id).all()
    
    for p in profiles:
        try:
            perms = json.loads(str(p.permissions)) if p.permissions is not None else {}
        except (json.JSONDecodeError, TypeError):
            perms = {}

        config[str(p.slug)] = {
            "name": str(p.name),
            "systemPrompt": str(p.system_prompt) if p.system_prompt is not None else None,
            "permissions": perms
        }
        
    return config


def _build_auth_config(db: Session, engine_id: str | None) -> dict:
    """Build FRONTBASE_AUTH JSON blob.

    Contains user authentication config only (Supabase Auth, Clerk, etc.).
    Engine access control (system key, API key hashes) is in FRONTBASE_API_KEYS.
    """
    auth: dict = {'provider': 'none'}

    if not engine_id:
        return auth

    # ── Auth Provider (Supabase) ─────────────────────────────────────────
    ctx: dict = {}
    try:
        from ..core.credential_resolver import get_supabase_context
        ctx = get_supabase_context(db, mode="public")
        if ctx.get('url'):
            auth['provider'] = 'supabase'
            auth['url'] = ctx.get('url')
            auth['anonKey'] = ctx.get('anon_key')
            print(f"[SecretsBuilder] Auth provider → FRONTBASE_AUTH env var: {ctx.get('url', '')[:40]}...")
    except Exception as e:
        print(f"[SecretsBuilder] Could not resolve auth provider: {e}")

    # ── JWT Secret (from encrypted provider_credentials via get_supabase_context) ──
    if not auth.get('jwtSecret') and ctx.get('jwt_secret'):
        auth['jwtSecret'] = ctx['jwt_secret']

    # ── Users Config (contacts table, mapping, types, etc.) ──────────────
    try:
        from ..models.models import Project
        project = db.query(Project).first()
        if project and str(project.users_config or ""):
            users_cfg = json.loads(str(project.users_config)) if not isinstance(project.users_config, dict) else project.users_config

            contacts: dict = {}
            contacts['table'] = users_cfg.get('contactsTable', 'contacts')
            
            if users_cfg.get('columnMapping'):
                contacts['columnMapping'] = users_cfg['columnMapping']
            if users_cfg.get('contactTypes'):
                contacts['contactTypes'] = users_cfg['contactTypes']
            if users_cfg.get('contactTypeHomePages'):
                contacts['contactTypeHomePages'] = users_cfg['contactTypeHomePages']
            if users_cfg.get('permissionLevels'):
                contacts['permissionLevels'] = users_cfg['permissionLevels']

            # Resolve contacts datasource credentials
            contacts_db_id = users_cfg.get('contactsDbId') or users_cfg.get('authDataSourceId')
            if contacts_db_id:
                from ..services.sync.models.datasource import Datasource
                ds = db.query(Datasource).filter(Datasource.id == contacts_db_id).first()
                if ds:
                    ds_url = ds.api_url
                    anon_key = ds.anon_key_encrypted
                    if str(ds.type.value) == 'supabase':
                        # For Supabase datasources, reuse auth provider URL as fallback
                        anon_key = auth.get('anonKey') or anon_key
                        ds_url = ds_url or auth.get('url')
                    if not ds_url and ds.host:
                        ds_url = f"postgresql://{ds.host}:{ds.port}/{ds.database}"

                    contacts['datasource'] = {
                        'type': str(ds.type.value),
                        'url': ds_url,
                        'anonKey': anon_key,
                    }

            auth['contacts'] = contacts
            auth['enabled'] = users_cfg.get('enabled', False)
    except Exception as e:
        print(f"[SecretsBuilder] Could not resolve users config: {e}")

    return auth


def _build_datasources_config(db: Session) -> dict:
    """Build FRONTBASE_DATASOURCES JSON blob.

    Maps datasource IDs → credentials needed for proxy-strategy data fetching.
    Only includes datasources that use non-Supabase providers (proxy strategy).

    Shape: { "<datasource_id>": { "type": "neon", "connectionString": "...", ... } }
    
    Uses direct sqlite3 for unified.db (same pattern as data_request.py).
    """
    import os
    import sqlite3
    from ..core.security import decrypt_field

    datasources: dict[str, dict] = {}

    # unified.db is at fastapi-backend/unified.db
    db_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        'unified.db'
    )

    if not os.path.exists(db_path):
        return datasources

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT id, name, type, host, port, database, username, password_encrypted, "
            "api_url, api_key_encrypted, extra_config "
            "FROM datasources WHERE is_active = 1"
        )
        rows = cursor.fetchall()
        conn.close()

        for row in rows:
            ds_type = str(row['type'])

            # Supabase uses direct strategy (browser → PostgREST), skip
            if ds_type == 'supabase':
                continue

            entry: dict[str, str] = {'type': ds_type}

            # Build connection string for SQL databases
            if ds_type in ('neon', 'postgres', 'mysql'):
                user = str(row['username'] or '')
                password = decrypt_field(str(row['password_encrypted'])) if row['password_encrypted'] else ''
                host = str(row['host'] or '')
                port = str(row['port'] or '5432')
                database = str(row['database'] or '')

                if ds_type == 'mysql':
                    entry['connectionString'] = f"mysql://{user}:{password}@{host}:{port}/{database}"
                else:
                    sslmode = 'require' if ds_type == 'neon' else 'prefer'
                    entry['connectionString'] = f"postgresql://{user}:{password}@{host}:{port}/{database}?sslmode={sslmode}"

                # Neon HTTP API (for serverless HTTP queries)
                if ds_type == 'neon' and host:
                    entry['httpUrl'] = f"https://{host}"

            # API key for HTTP-based providers
            if row['api_key_encrypted']:
                api_key = decrypt_field(str(row['api_key_encrypted']))
                if api_key:
                    entry['apiKey'] = api_key

            if row['api_url']:
                entry['apiUrl'] = str(row['api_url'])

            # Extra config (JSON string with provider-specific fields)
            if row['extra_config']:
                try:
                    extra = json.loads(str(row['extra_config']))
                    if isinstance(extra, dict):
                        entry.update(extra)
                except (json.JSONDecodeError, TypeError):
                    pass

            datasources[str(row['id'])] = entry

    except Exception as e:
        print(f"[SecretsBuilder] Could not build datasources config: {e}")

    return datasources


def build_engine_secrets(
    db: Session,
    edge_db_id: str | None,
    edge_cache_id: str | None,
    edge_queue_id: str | None,
    engine_id: str | None = None,
    deploy_provider: str | None = None,
) -> dict[str, str]:
    """Build 6 FRONTBASE_* JSON env vars from DB/cache/queue/auth records.
    
    Args:
        db: SQLAlchemy session
        edge_db_id: EdgeDatabase record ID
        edge_cache_id: EdgeCache record ID
        edge_queue_id: EdgeQueue record ID
        engine_id: EdgeEngine record ID (for GPU models, API keys, auth)
        deploy_provider: The engine's provider type (e.g. "cloudflare", "vercel").
    
    Returns a dict of secret_name → secret_value (JSON strings).
    Only includes non-empty values.
    """
    from ..core.security import decrypt_field
    secrets: dict[str, str] = {}

    # ─── FRONTBASE_AUTH ──────────────────────────────────────────────────
    auth = _build_auth_config(db, engine_id)
    if auth.get('provider') != 'none':
        secrets['FRONTBASE_AUTH'] = json.dumps(auth)

    # ─── FRONTBASE_API_KEYS ──────────────────────────────────────────────
    api_keys_config = _build_api_keys_config(db, engine_id)
    if api_keys_config.get('systemKey') or api_keys_config.get('apiKeyHashes'):
        secrets['FRONTBASE_API_KEYS'] = json.dumps(api_keys_config)

    # ─── FRONTBASE_GPU ───────────────────────────────────────────────────
    if engine_id:
        from ..models.models import EdgeGPUModel
        gpu_models = db.query(EdgeGPUModel).filter(
            EdgeGPUModel.edge_engine_id == engine_id,
            EdgeGPUModel.is_active == True,
        ).all()
        if gpu_models:
            models_data = []
            for m in gpu_models:
                entry: dict[str, str] = {
                    "slug": str(m.slug),
                    "modelId": str(m.model_id),
                    "modelType": str(m.model_type),
                    "provider": str(m.provider),
                }
                # Decrypt and push API key for non-CF providers
                if str(m.api_key or ''):
                    decrypted_key = decrypt_field(str(m.api_key))
                    if decrypted_key:
                        entry["apiKey"] = decrypted_key
                # Push custom base URL (Ollama, OpenAI-compatible, etc.)
                if str(m.base_url or ''):
                    entry["baseUrl"] = str(m.base_url)
                models_data.append(entry)
            secrets['FRONTBASE_GPU'] = json.dumps(models_data)

    # ─── FRONTBASE_STATE_DB ──────────────────────────────────────────────
    if edge_db_id:
        edge_db = db.query(EdgeDatabase).filter(EdgeDatabase.id == edge_db_id).first()
        if edge_db:
            db_provider = str(edge_db.provider)
            state_db: dict = {'provider': db_provider}
            config = _get_provider_config(edge_db)

            if db_provider == 'supabase':
                state_db['url'] = config.get('supabase_url', str(edge_db.db_url))
                anon_key = config.get('anon_key', '')
                if anon_key:
                    state_db['anonKey'] = anon_key
                scoped_jwt = config.get('scoped_jwt', '')
                if scoped_jwt:
                    state_db['jwt'] = scoped_jwt
                schema_name = config.get('schema_name', 'frontbase_edge')
                if schema_name:
                    state_db['schema'] = str(schema_name)

            elif db_provider == 'cloudflare':
                state_db['url'] = str(edge_db.db_url)
                # CF D1: embed CF credentials directly in state_db blob
                cf_creds = _resolve_cf_credentials(db, edge_db)
                state_db.update(cf_creds)

            else:
                # Turso, Neon, Postgres
                state_db['url'] = str(edge_db.db_url)
                token = decrypt_field(str(edge_db.db_token)) if edge_db.db_token else None  # type: ignore[truthy-bool]
                if token:
                    state_db['token'] = token
                # PG schema isolation
                if db_provider in ('neon', 'postgres'):
                    schema_name = config.get('schema_name')
                    if schema_name:
                        state_db['schema'] = str(schema_name)

            # Guard: cloud providers cannot use file: URLs
            db_url = state_db.get('url', '')
            if deploy_provider in ('cloudflare', 'vercel', 'netlify', 'deno', 'supabase') and db_url.startswith('file:'):
                print(f"[SecretsBuilder] WARNING: Engine {engine_id} is cloud ({deploy_provider}) "
                      f"but linked to local DB ({db_url}). Skipping FRONTBASE_STATE_DB to avoid file: URL error.")
            else:
                secrets['FRONTBASE_STATE_DB'] = json.dumps(state_db)

    # ─── FRONTBASE_CACHE ─────────────────────────────────────────────────
    if edge_cache_id:
        edge_cache = db.query(EdgeCache).filter(EdgeCache.id == edge_cache_id).first()
        if edge_cache:
            cache_provider = str(edge_cache.provider)
            cache: dict = {'provider': cache_provider}

            if cache_provider == 'deno_kv':
                pass  # No credentials needed
            elif cache_provider == 'cloudflare':
                cache_url = str(edge_cache.cache_url)
                if not cache_url.startswith('kv://'):
                    cache_url = f'kv://{cache_url}'
                cache['url'] = cache_url
                token = decrypt_field(str(edge_cache.cache_token)) if edge_cache.cache_token else None  # type: ignore[truthy-bool]
                if token:
                    cache['token'] = token
                # CF KV: embed CF credentials directly
                cf_creds = _resolve_cf_credentials(db, edge_cache)
                cache.update(cf_creds)
            else:
                # Upstash, Redis
                cache['url'] = str(edge_cache.cache_url)
                token = decrypt_field(str(edge_cache.cache_token)) if edge_cache.cache_token else None  # type: ignore[truthy-bool]
                if token:
                    cache['token'] = token

            secrets['FRONTBASE_CACHE'] = json.dumps(cache)

    # ─── FRONTBASE_QUEUE ─────────────────────────────────────────────────
    if edge_queue_id:
        edge_queue = db.query(EdgeQueue).filter(EdgeQueue.id == edge_queue_id).first()
        if edge_queue:
            queue_provider = str(edge_queue.provider)
            queue: dict = {'provider': queue_provider}

            queue_url = str(edge_queue.queue_url)
            if queue_provider == 'cloudflare' and not queue_url.startswith('cfq://'):
                queue_url = f'cfq://{queue_url}'
            queue['url'] = queue_url

            token = decrypt_field(str(edge_queue.queue_token)) if edge_queue.queue_token else None  # type: ignore[truthy-bool]
            if token:
                queue['token'] = token
            sk = decrypt_field(str(edge_queue.signing_key)) if edge_queue.signing_key else None  # type: ignore[truthy-bool]
            if sk:
                queue['signingKey'] = sk
            nsk = decrypt_field(str(edge_queue.next_signing_key)) if edge_queue.next_signing_key else None  # type: ignore[truthy-bool]
            if nsk:
                queue['nextSigningKey'] = nsk

            # CF Queues: embed CF credentials directly
            if queue_provider == 'cloudflare':
                cf_creds = _resolve_cf_credentials(db, edge_queue)
                queue.update(cf_creds)

            secrets['FRONTBASE_QUEUE'] = json.dumps(queue)

    # ─── FRONTBASE_DATASOURCES ──────────────────────────────────────────
    datasources = _build_datasources_config(db)
    if datasources:
        secrets['FRONTBASE_DATASOURCES'] = json.dumps(datasources)

    # ─── FRONTBASE_AGENT_PROFILES ─────────────────────────────────────────
    agent_profiles = _build_agent_profiles_config(db, engine_id)
    if agent_profiles:
        secrets['FRONTBASE_AGENT_PROFILES'] = json.dumps(agent_profiles)

    return secrets
