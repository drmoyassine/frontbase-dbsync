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
from ..models.models import EdgeDatabase, EdgeCache, EdgeQueue, EdgeVector


# Frontbase-managed binding names — only these are touched during reconfigure
FRONTBASE_BINDING_NAMES = frozenset([
    'FRONTBASE_STATE_DB',
    'FRONTBASE_AUTH',
    'FRONTBASE_API_KEYS',
    'FRONTBASE_CACHE',
    'FRONTBASE_QUEUE',
    'FRONTBASE_VECTOR',
    'FRONTBASE_GPU',
    'FRONTBASE_DATASOURCES',
    'FRONTBASE_AGENT_PROFILES',
    'FRONTBASE_SECURITY',
    'FRONTBASE_STORAGE',
    'FRONTBASE_SECRETS_KEY',  # per-worker AES-256-GCM key for state-DB secrets (shared engines)
    'FRONTBASE_SECRETS_KEY_OLD',  # V2: retained old key during rotation transition window
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

            # Resolve tenant_slug
            tenant_slug = None
            if bool(k.project_id):
                from ..models.auth import Project
                proj = db.query(Project).filter(Project.id == k.project_id).first()
                if proj and proj.tenant:
                    tenant_slug = str(proj.tenant.slug)

            hashes.append({
                "prefix": str(k.prefix),
                "hash": derived,
                "scope": str(k.scope) if k.scope else 'user',  # type: ignore[truthy-bool]
                "expires_at": str(k.expires_at) if k.expires_at else None,  # type: ignore[truthy-bool]
                "tenantSlug": tenant_slug,
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

    from ..models.models import EdgeAgentProfile, EdgeEngine
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    is_shared = bool(engine.is_shared) if engine else False

    profiles = db.query(EdgeAgentProfile).filter(EdgeAgentProfile.engine_id == engine_id).all()
    
    for p in profiles:
        try:
            perms = json.loads(str(p.permissions)) if p.permissions is not None else {}
        except (json.JSONDecodeError, TypeError):
            perms = {}

        # Resolve tenant_slug
        tenant_slug = None
        if bool(p.project_id):
            from ..models.auth import Project
            proj = db.query(Project).filter(Project.id == p.project_id).first()
            if proj and proj.tenant:
                tenant_slug = str(proj.tenant.slug)

        if is_shared and tenant_slug:
            key = f"{tenant_slug}:{p.slug}"
        else:
            key = str(p.slug)

        config[key] = {
            "name": str(p.name),
            "slug": str(p.slug),
            "tenantSlug": tenant_slug,
            "systemPrompt": str(p.system_prompt) if p.system_prompt is not None else None,
            "permissions": perms
        }
        
    return config


def _build_project_auth_config(db: Session, project) -> dict:
    """Build AuthConfig for a specific Project."""
    from ..core.security import decrypt_field
    from ..models.models import EdgeProviderAccount
    
    auth: dict = {'provider': 'none'}
    
    # ── Auth Provider (Supabase) ─────────────────────────────────────────
    # Try to find a connected provider account linked to this project
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.provider == "supabase",
        EdgeProviderAccount.project_id == project.id,
        EdgeProviderAccount.is_active == True,
    ).first()
    
    url = None
    anon_key = None
    jwt_secret = None
    
    if provider:
        metadata = {}
        if provider.provider_metadata is not None:
            try:
                metadata = json.loads(str(provider.provider_metadata))
            except Exception:
                pass
        from ..core.security import decrypt_credentials
        creds = decrypt_credentials(str(provider.provider_credentials or "{}"))
        url = metadata.get("api_url") or project.supabase_url
        anon_key = creds.get("anon_key") or metadata.get("anon_key") or project.supabase_anon_key
        jwt_secret = creds.get("jwt_secret")
    else:
        url = project.supabase_url
        anon_key = project.supabase_anon_key
        
    if url and anon_key:
        auth['provider'] = 'supabase'
        auth['url'] = url
        auth['anonKey'] = anon_key
        if jwt_secret:
            auth['jwtSecret'] = jwt_secret

    # ── Users Config (contacts table, mapping, types, etc.) ──────────────
    try:
        if project.users_config and str(project.users_config or ""):
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
                    anon_key_ds = ds.anon_key_encrypted
                    if str(ds.type.value) == 'supabase':
                        anon_key_ds = auth.get('anonKey') or anon_key_ds
                        ds_url = ds_url or auth.get('url')
                    if not ds_url and ds.host:
                        ds_url = f"postgresql://{ds.host}:{ds.port}/{ds.database}"

                    contacts['datasource'] = {
                        'type': str(ds.type.value),
                        'url': ds_url,
                        'anonKey': anon_key_ds,
                    }

            auth['contacts'] = contacts
            auth['enabled'] = users_cfg.get('enabled', False)
    except Exception as e:
        print(f"[SecretsBuilder] Could not resolve users config for project {project.id}: {e}")

    return auth


def _build_auth_config(db: Session, engine_id: str | None) -> dict:
    """Build FRONTBASE_AUTH JSON blob.

    Contains user authentication config only (Supabase Auth, Clerk, etc.).
    In cloud mode, returns a dictionary of tenant slug -> AuthConfig.
    """
    from ..config.edition import is_cloud
    
    if is_cloud():
        from ..models.tenant import Tenant
        from ..models.models import Project
        
        auth_map = {}
        tenants = db.query(Tenant).all()
        for t in tenants:
            project = db.query(Project).filter(Project.tenant_id == t.id).first()
            if project:
                auth_cfg = _build_project_auth_config(db, project)
                if auth_cfg.get('provider') != 'none':
                    auth_map[str(t.slug)] = auth_cfg
        
        default_project = db.query(Project).filter(Project.tenant_id == None).first()
        if default_project:
            auth_map['_default'] = _build_project_auth_config(db, default_project)
            
        return auth_map

    # Single-tenant / Self-host mode
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


def _build_datasources_config(db: Session, engine_id: str | None) -> dict:
    """Build FRONTBASE_DATASOURCES JSON blob.

    Maps datasource IDs → credentials needed for proxy-strategy data fetching.
    Only includes datasources that use non-Supabase providers (proxy strategy).

    Shape: { "<datasource_id>": { "type": "neon", "connectionString": "...", ... } }
    """
    if not engine_id:
        return {}

    from app.models.edge import engine_datasources
    from app.services.sync.models.datasource import Datasource
    import sqlalchemy as sa
    from ..core.security import decrypt_field

    datasources: dict[str, dict] = {}

    try:
        # Query datasource IDs bound to this engine
        stmt = sa.select(engine_datasources.c.datasource_id).where(engine_datasources.c.engine_id == engine_id)
        bound_ids = db.execute(stmt).scalars().all()
        if not bound_ids:
            return datasources

        # Query the actual Datasource records
        datasources_list = db.query(Datasource).filter(
            Datasource.id.in_(bound_ids),
            Datasource.is_active == True
        ).all()

        for ds in datasources_list:
            ds_type = str(ds.type.value) if ds.type else ''

            # Supabase uses direct strategy (browser → PostgREST), skip
            if ds_type == 'supabase':
                continue

            entry: dict[str, str] = {'type': ds_type}

            # Build connection string for SQL databases
            if ds_type in ('neon', 'postgres', 'mysql'):
                user = str(ds.username or '')
                password = decrypt_field(str(ds.password_encrypted)) if ds.password_encrypted else ''
                host = str(ds.host or '')
                port = str(ds.port or '5432')
                database = str(ds.database or '')

                if ds_type == 'mysql':
                    entry['connectionString'] = f"mysql://{user}:{password}@{host}:{port}/{database}"
                else:
                    sslmode = 'require' if ds_type == 'neon' else 'prefer'
                    entry['connectionString'] = f"postgresql://{user}:{password}@{host}:{port}/{database}?sslmode={sslmode}"

                # Neon HTTP API (for serverless HTTP queries)
                if ds_type == 'neon' and host:
                    entry['httpUrl'] = f"https://{host}"

            # API key for HTTP-based providers
            if ds.api_key_encrypted:
                api_key = decrypt_field(str(ds.api_key_encrypted))
                if api_key:
                    entry['apiKey'] = api_key

            if ds.api_url:
                entry['apiUrl'] = str(ds.api_url)

            # Resolve missing credentials from Connected Account
            if ds.provider_account_id and (not entry.get('apiKey') or not entry.get('apiUrl')):
                from app.models.models import EdgeProviderAccount
                from ..core.security import decrypt_credentials
                provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == ds.provider_account_id).first()
                if provider:
                    # Resolve URL from metadata
                    if not entry.get('apiUrl') and provider.provider_metadata is not None:
                        try:
                            meta = json.loads(str(provider.provider_metadata))
                            resolved_url = meta.get("api_url") or meta.get("base_url")
                            if resolved_url:
                                entry['apiUrl'] = resolved_url
                        except (json.JSONDecodeError, TypeError):
                            pass
                    # Resolve keys from decrypted credentials
                    if not entry.get('apiKey') and provider.provider_credentials is not None:
                        creds = decrypt_credentials(str(provider.provider_credentials))
                        resolved_key = creds.get("app_password") or creds.get("api_key") or creds.get("anon_key")
                        if resolved_key:
                            entry['apiKey'] = resolved_key

            # Extra config (JSON string with provider-specific fields)
            if ds.extra_config:
                try:
                    extra = json.loads(str(ds.extra_config))
                    if isinstance(extra, dict):
                        entry.update(extra)
                except (json.JSONDecodeError, TypeError):
                    pass

            datasources[str(ds.id)] = entry

    except Exception as e:
        print(f"[SecretsBuilder] Could not build datasources config: {e}")

    return datasources


def _build_tenant_datasources_blob(
    db: Session,
    engine_id: str,
    tenant_project_ids: list[str],
) -> str:
    """Build the FRONTBASE_DATASOURCES JSON blob scoped to ONE tenant.

    Mirrors `_build_datasources_config`, but only includes datasources that are
    (a) bound to this engine and (b) owned by one of the tenant's projects.
    This is the per-tenant plaintext pushed to the worker's state-DB on shared
    engines (see edge_secrets_push.sync_shared_engine_tenant_secrets).
    """
    from app.models.edge import engine_datasources
    from app.services.sync.models.datasource import Datasource
    from ..core.security import decrypt_field, decrypt_credentials
    import sqlalchemy as sa

    datasources: dict[str, dict] = {}
    if not tenant_project_ids:
        return json.dumps(datasources)

    try:
        bound_ids = db.execute(
            sa.select(engine_datasources.c.datasource_id).where(
                engine_datasources.c.engine_id == engine_id
            )
        ).scalars().all()
        if not bound_ids:
            return json.dumps(datasources)

        datasources_list = db.query(Datasource).filter(
            Datasource.id.in_(bound_ids),
            Datasource.is_active == True,
            Datasource.project_id.in_(tenant_project_ids),
        ).all()

        for ds in datasources_list:
            ds_type = str(ds.type.value) if ds.type else ''

            # Supabase uses direct strategy (browser → PostgREST), skip
            if ds_type == 'supabase':
                continue

            entry: dict[str, str] = {'type': ds_type}

            if ds_type in ('neon', 'postgres', 'mysql'):
                user = str(ds.username or '')
                password = decrypt_field(str(ds.password_encrypted)) if ds.password_encrypted else ''
                host = str(ds.host or '')
                port = str(ds.port or '5432')
                database = str(ds.database or '')

                if ds_type == 'mysql':
                    entry['connectionString'] = f"mysql://{user}:{password}@{host}:{port}/{database}"
                else:
                    sslmode = 'require' if ds_type == 'neon' else 'prefer'
                    entry['connectionString'] = f"postgresql://{user}:{password}@{host}:{port}/{database}?sslmode={sslmode}"

                if ds_type == 'neon' and host:
                    entry['httpUrl'] = f"https://{host}"

            if ds.api_key_encrypted:
                api_key = decrypt_field(str(ds.api_key_encrypted))
                if api_key:
                    entry['apiKey'] = api_key

            if ds.api_url:
                entry['apiUrl'] = str(ds.api_url)

            # Resolve missing credentials from Connected Account
            if ds.provider_account_id and (not entry.get('apiKey') or not entry.get('apiUrl')):
                from app.models.models import EdgeProviderAccount
                from ..core.security import decrypt_credentials
                provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == ds.provider_account_id).first()
                if provider:
                    # Resolve URL from metadata
                    if not entry.get('apiUrl') and provider.provider_metadata is not None:
                        try:
                            meta = json.loads(str(provider.provider_metadata))
                            resolved_url = meta.get("api_url") or meta.get("base_url")
                            if resolved_url:
                                entry['apiUrl'] = resolved_url
                        except (json.JSONDecodeError, TypeError):
                            pass
                    # Resolve keys from decrypted credentials
                    if not entry.get('apiKey') and provider.provider_credentials is not None:
                        creds = decrypt_credentials(str(provider.provider_credentials))
                        resolved_key = creds.get("app_password") or creds.get("api_key") or creds.get("anon_key")
                        if resolved_key:
                            entry['apiKey'] = resolved_key

            if ds.extra_config:
                try:
                    extra = json.loads(str(ds.extra_config))
                    if isinstance(extra, dict):
                        entry.update(extra)
                except (json.JSONDecodeError, TypeError):
                    pass

            datasources[str(ds.id)] = entry
    except Exception as e:
        print(f"[SecretsBuilder] Could not build tenant datasources blob: {e}")

    return json.dumps(datasources)


def build_tenant_secret_blobs(
    db: Session,
    engine_id: str,
    tenant_id: str,
    kinds: set | None = None,
) -> dict:
    """Build per-tenant secret blobs for state-DB routing (shared engines).

    Returns {kind: plaintext_json_string} for the given tenant. Only
    `datasources` is routed in v1 (other kinds land in follow-up sprints).

    Each blob is the same JSON that would have gone into the env var, but
    scoped to ONE tenant only. The push layer AES-256-GCM-encrypts it before
    sending it to the worker's state-DB.
    """
    from app.models.auth import Project

    kinds = kinds or {'datasources'}
    result: dict[str, str] = {}

    tenant_project_ids = [
        pid for (pid,) in db.query(Project.id).filter(Project.tenant_id == tenant_id).all()
    ]

    if 'datasources' in kinds:
        result['datasources'] = _build_tenant_datasources_blob(db, engine_id, tenant_project_ids)

    return result


def _build_storage_config(db: Session, engine_id: str | None) -> dict:
    """Build FRONTBASE_STORAGE JSON blob.

    Maps storage provider IDs → credentials needed for file storage operations at the edge.
    
    Shape: {
        "<storage_provider_id>": {
            "provider": "supabase" | "cloudflare" | "vercel" | "netlify",
            "credentials": { ... }
        }
    }
    """
    if not engine_id:
        return {}

    from app.models.edge import engine_storages
    from app.models.storage_provider import StorageProvider
    from app.core.credential_resolver import get_provider_context_by_id
    import sqlalchemy as sa

    storage_config: dict = {}

    try:
        # Query storage IDs bound to this engine
        stmt = sa.select(engine_storages.c.storage_id).where(engine_storages.c.engine_id == engine_id)
        bound_ids = db.execute(stmt).scalars().all()
        if not bound_ids:
            return storage_config

        providers = db.query(StorageProvider).filter(
            StorageProvider.id.in_(bound_ids),
            StorageProvider.is_active == True
        ).all()

        for sp in providers:
            try:
                ctx = get_provider_context_by_id(db, str(sp.provider_account_id))
            except Exception:
                continue

            provider_type = str(sp.provider)
            entry: dict = {
                "provider": provider_type,
                "credentials": {}
            }

            if provider_type == "supabase":
                entry["credentials"]["url"] = ctx.get("api_url", "")
                entry["credentials"]["authKey"] = ctx.get("service_role_key", "") or ctx.get("anon_key", "")
            elif provider_type == "cloudflare":
                entry["credentials"]["apiToken"] = ctx.get("api_token", "")
                # Resolve account_id from context or fetch via API if possible
                account_id = ctx.get("account_id", "")
                if not account_id:
                    try:
                        import httpx
                        resp = httpx.get(
                            "https://api.cloudflare.com/client/v4/accounts",
                            headers={"Authorization": f"Bearer {ctx.get('api_token', '')}"},
                            params={"per_page": 1},
                        )
                        if resp.is_success:
                            accounts = resp.json().get("result", [])
                            if accounts:
                                account_id = accounts[0]["id"]
                    except Exception:
                        pass
                entry["credentials"]["accountId"] = account_id
            elif provider_type == "vercel":
                entry["credentials"]["apiToken"] = ctx.get("api_token", "")
            elif provider_type == "netlify":
                entry["credentials"]["apiToken"] = ctx.get("api_token", "")
                try:
                    sp_config = json.loads(str(sp.config or "{}"))
                    entry["credentials"]["siteId"] = sp_config.get("site_id", "")
                except Exception:
                    pass

            storage_config[str(sp.id)] = entry

    except Exception as e:
        print(f"[SecretsBuilder] Could not build storage config: {e}")

    return storage_config


def _build_security_config(db: Session, engine_id: str | None = None) -> dict:
    """Build FRONTBASE_SECURITY JSON blob.
    
    Contains:
      - ipBlocklist: dict of { tenant_slug: [ip_strings] }
      - botProtection: { enabled, provider, siteKey, secretKey, ... }
    """
    from app.routers.settings import load_settings
    from app.models.models import IPBlocklist
    from app.models.edge import EdgeEngine
    from app.models.models import Project
    from app.models.tenant import Tenant
    
    config = {}
    
    # 1. Resolve the current engine's tenant_slug
    engine_tenant_slug = None
    if engine_id:
        engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
        if engine is not None and engine.project_id is not None:
            project = db.query(Project).filter(Project.id == engine.project_id).first()
            if project is not None and project.tenant_id is not None:
                tenant = db.query(Tenant).filter(Tenant.id == project.tenant_id).first()
                if tenant is not None:
                    engine_tenant_slug = str(tenant.slug)
    
    # 2. Get IP Blocklist
    items = db.query(IPBlocklist).all()
    blocklist_map = {}  # { tenant_slug: [ips] }
    for item in items:
        slug = str(item.tenant_slug) if (getattr(item, 'tenant_slug', None) is not None) else '_default'
        if engine_tenant_slug and slug != engine_tenant_slug:
            continue
        if slug not in blocklist_map:
            blocklist_map[slug] = []
        blocklist_map[slug].append(str(item.ip_or_range).strip())
    config['ipBlocklist'] = blocklist_map
    
    # 3. Bot Protection Settings
    settings_dict = load_settings(engine_tenant_slug)
    bot_settings = settings_dict.get("security", {}).get("bot_protection", {})
    if bot_settings.get("enabled"):
        config['botProtection'] = {
            'enabled': True,
            'provider': bot_settings.get('provider', 'cloudflare'),
            'siteKey': bot_settings.get('site_key', ''),
            'secretKey': bot_settings.get('secret_key', ''),
            'protectLogin': bot_settings.get('protect_login', True),
            'protectForgotPassword': bot_settings.get('protect_forgot_password', True),
        }
    
    return config


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

    # ─── SENTRY_DSN (platform-wide; propagates to every edge runtime) ──────
    # Propagate the backend's own Sentry DSN to every deployed edge so edge
    # errors land in the same project. Read straight from the platform env; if
    # unset, edges deploy telemetry-free. Each deploy API pushes this dict
    # wholesale (CF set_secrets / Vercel set_env_vars / …) — see engine_deploy.py.
    import os as _os
    _sentry_dsn = _os.getenv("SENTRY_DSN")
    if _sentry_dsn:
        secrets["SENTRY_DSN"] = _sentry_dsn

    # ─── Shared-engine detection (community workers) ─────────────────────
    # On shared engines, per-tenant secrets (datasources in v1) live in the
    # worker's state-DB as AES-256-GCM rows instead of env blobs — keeping
    # env size O(1) as tenant count grows. See edge_secrets_push +
    # services/edge/src/config/tenantSecrets.ts.
    is_shared = False
    engine = None
    if engine_id:
        from ..models.models import EdgeEngine as _EdgeEngine
        engine = db.query(_EdgeEngine).filter(_EdgeEngine.id == engine_id).first()
        is_shared = bool(engine and getattr(engine, 'is_shared', False))

    if is_shared and engine is not None:
        from .edge_secrets_push import resolve_secrets_key, _engine_config
        secrets['FRONTBASE_SECRETS_KEY'] = resolve_secrets_key(engine, db)

        # V2 rotation transition window: emit the retained old key so the edge
        # can decrypt ciphertext not yet re-pushed under the new key. Cleared
        # automatically once the window elapses (prune_expired_rotation).
        _cfg = _engine_config(engine)
        _encrypted_old = _cfg.get('secrets_key_old')
        if _encrypted_old:
            from ..core.security import decrypt_field as _decrypt
            _old_key = _decrypt(_encrypted_old)
            if _old_key:
                secrets['FRONTBASE_SECRETS_KEY_OLD'] = str(_old_key)

    # ─── FRONTBASE_AUTH ──────────────────────────────────────────────────
    auth = _build_auth_config(db, engine_id)
    if is_shared:
        # Keep only the platform-wide (_default / master-admin) auth entry.
        # Per-tenant auth is empty for free shared tenants today; follow-up
        # sprint V1.1 routes tenant auth via state-DB. This closes the latent
        # over-share where every tenant's auth shipped to every shared engine.
        default_auth = auth.get('_default') if isinstance(auth, dict) else None
        if isinstance(default_auth, dict) and default_auth.get('provider') != 'none':
            secrets['FRONTBASE_AUTH'] = json.dumps({'_default': default_auth})
    elif auth.get('provider') != 'none':
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

            # Guard: file: URLs are only valid for local/Docker edges
            db_url = state_db.get('url', '')
            if db_url.startswith('file:') and deploy_provider is not None:
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

    # ─── FRONTBASE_VECTOR ────────────────────────────────────────────────
    # Resolve from engine.edge_vector_id
    if engine and getattr(engine, 'edge_vector_id', None):
        edge_vector = db.query(EdgeVector).filter(EdgeVector.id == engine.edge_vector_id).first()
        if edge_vector:
            vector_provider = str(edge_vector.provider)
            vector: dict = {'provider': vector_provider}
            vector['url'] = str(edge_vector.vector_url)
            token = decrypt_field(str(edge_vector.vector_token)) if edge_vector.vector_token is not None else None
            if token:
                vector['token'] = token
            
            # Provider-specific config (like dimensions, metric, etc.)
            config = _get_provider_config(edge_vector)
            if config:
                vector.update(config)
            
            secrets['FRONTBASE_VECTOR'] = json.dumps(vector)

    # ─── FRONTBASE_DATASOURCES ──────────────────────────────────────────
    if not is_shared:
        # Dedicated / self-host: bake the full datasources blob into env (one
        # tenant — no size explosion).
        datasources = _build_datasources_config(db, engine_id)
        if datasources:
            secrets['FRONTBASE_DATASOURCES'] = json.dumps(datasources)
    # Shared engines: datasources are pushed to the worker's state-DB per
    # tenant at deploy time (edge_secrets_push.sync_shared_engine_tenant_secrets),
    # NOT baked into env. The edge resolves them via getTenantSecret().

    # ─── FRONTBASE_STORAGE ───────────────────────────────────────────────
    storage = _build_storage_config(db, engine_id)
    if storage:
        secrets['FRONTBASE_STORAGE'] = json.dumps(storage)

    # ─── FRONTBASE_AGENT_PROFILES ─────────────────────────────────────────
    agent_profiles = _build_agent_profiles_config(db, engine_id)
    if agent_profiles:
        secrets['FRONTBASE_AGENT_PROFILES'] = json.dumps(agent_profiles)

    # ─── FRONTBASE_SECURITY ──────────────────────────────────────────────
    security = _build_security_config(db, engine_id)
    if security:
        secrets['FRONTBASE_SECURITY'] = json.dumps(security)

    return secrets
