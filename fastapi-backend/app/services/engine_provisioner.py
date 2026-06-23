"""
Engine Provisioner — Create/update an engine record + trigger deploy.

Extracted from edge_engines router to isolate the complex deploy_engine
business logic. The router endpoint becomes a thin 10-line handler.

Per-provider hooks:
  - pre_deploy_hook() handles provider-specific setup (e.g. CF workers.dev)
  - Adding a new provider: add a case to PRE_DEPLOY_HOOKS dict

Dependencies:
  - services/engine_deploy.py (redeploy)
  - services/provider_registry.py (URL builders, labels, config keys)
  - services/cloudflare_api.py (CF-specific pre-deploy)
"""

import json
import uuid
from datetime import datetime, UTC

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..middleware.tenant_context import TenantContext
from ..database.utils import get_project

from ..models.models import EdgeEngine, EdgeProviderAccount
from ..schemas.edge_engines import GenericDeployRequest
from ..services.provider_registry import (
    PROVIDER_LABELS, PROVIDER_CONFIG_KEY,
    build_engine_url as _build_engine_url,
)
from ..services import engine_deploy


# =============================================================================
# Per-Provider Pre-Deploy Hooks
# =============================================================================
# Each hook receives (ctx, provider_orm, worker_name, db) and returns the
# final engine_url. Providers without hooks use the default URL builder.

async def _cf_pre_deploy(ctx: dict, provider: EdgeProviderAccount, worker_name: str, db: Session) -> str:
    """Cloudflare: detect account_id if missing, build the workers.dev URL.
    
    NOTE: We do NOT enable the subdomain here — the worker doesn't exist yet.
    Subdomain enable happens in _deploy_cloudflare() AFTER the upload.
    """
    from ..services import cloudflare_api
    from ..core.security import encrypt_credentials
    import re

    account_id = ctx.get("account_id")
    api_token = str(ctx.get("api_token") or "")

    if not account_id:
        account_id = await cloudflare_api.detect_account_id(api_token)
        # Save detected account_id back to encrypted credentials
        raw_creds = dict(ctx.get("_creds", {}))
        raw_creds["account_id"] = account_id
        provider.provider_credentials = encrypt_credentials(raw_creds)  # type: ignore[assignment]
        db.commit()

    # Construct URL (matches what enable_workers_dev will return after upload)
    normalized_name = re.sub(r'[^a-z0-9-]', '-', worker_name.lower()).strip('-')
    # Get the subdomain for this CF account
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{cloudflare_api.CF_API}/accounts/{account_id}/workers/subdomain",
                headers=cloudflare_api.headers(str(api_token)),
                timeout=10.0,
            )
            subdomain = "workers.dev"
            if resp.status_code == 200:
                sub_data = resp.json()
                subdomain_name = sub_data.get("result", {}).get("subdomain", "")
                if subdomain_name:
                    subdomain = f"{subdomain_name}.workers.dev"
    except Exception:
        subdomain = "workers.dev"

    return f"https://{normalized_name}.{subdomain}"


async def _deno_pre_deploy(ctx: dict, provider: EdgeProviderAccount, worker_name: str, db: Session) -> str:
    """Deno Deploy: build the correct URL using org_slug from credentials.
    
    Org accounts: https://{slug}.{org_slug}.deno.net
    Personal/missing org_slug: https://{slug}.deno.dev
    """
    from ..services import deno_deploy_api

    org_slug = ctx.get('org_slug', '')
    url = deno_deploy_api.get_project_url(worker_name, org_slug or None)
    if org_slug:
        print(f"[Deno Deploy] Using org slug from credentials: {org_slug} → {url}")
    return url


async def _netlify_pre_deploy(ctx: dict, provider: EdgeProviderAccount, worker_name: str, db: Session) -> str:
    """Netlify: validate API token and return predictable URL.
    
    Site creation is deferred to deploy() which stores site_id
    per-engine in engine_config. Each engine gets its own Netlify site.
    """
    from ..services import netlify_deploy_api
    import httpx

    api_token = ctx.get('api_token', '')
    if not api_token:
        raise HTTPException(400, "Missing Netlify API token in provider account")

    # Validate the API token by checking the user's account
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{netlify_deploy_api.NETLIFY_API}/user",
                headers=netlify_deploy_api._headers(api_token),
            )
            if resp.status_code == 401:
                raise HTTPException(401, "Invalid Netlify API token")
    except httpx.HTTPError as e:
        print(f"[Netlify] Token validation failed: {e}")

    # Return predictable URL — deploy() will create the site and
    # update engine.url to the actual Netlify subdomain if different
    return f"https://{worker_name}.netlify.app"


# Registry: provider_type → async pre-deploy hook
# Extend this dict when adding new providers that need pre-deploy setup.
PRE_DEPLOY_HOOKS: dict = {
    "cloudflare": _cf_pre_deploy,
    "deno": _deno_pre_deploy,
    "netlify": _netlify_pre_deploy,
}


# =============================================================================
# Provision + Deploy
# =============================================================================

async def provision_and_deploy(payload: GenericDeployRequest, db: Session, ctx: TenantContext | None = None) -> dict:
    """Provider-agnostic one-click deploy.

    1. Resolve provider type from provider_id
    2. Run per-provider pre-deploy hook (if any)
    3. Construct engine URL + config
    4. Create or update EdgeEngine record
    5. Delegate to engine_deploy.redeploy()

    Returns dict with success, url, worker_name, engine_id, provider, deploy_result.
    """
    from ..models.models import EdgeDatabase
    from ..core.credential_resolver import get_provider_context_by_id

    # --- Resolve provider ---
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == payload.provider_id
    ).first()
    if not provider:
        raise HTTPException(400, "Provider account not found")

    provider_type = str(provider.provider)
    if provider_type not in PROVIDER_LABELS:
        raise HTTPException(400, f"Unsupported provider type: {provider_type}")

    provider_ctx = get_provider_context_by_id(db, payload.provider_id)
    label = PROVIDER_LABELS[provider_type]

    # --- Resolve edge IDs (handle '__none__' sentinel) ---
    edge_db_id = payload.edge_db_id if payload.edge_db_id != "__none__" else None
    edge_cache_id = payload.edge_cache_id if payload.edge_cache_id != "__none__" else None
    edge_queue_id = payload.edge_queue_id if payload.edge_queue_id != "__none__" else None

    # Default DB if none specified
    if not edge_db_id and payload.edge_db_id != "__none__":
        default_db_query = db.query(EdgeDatabase).filter(EdgeDatabase.is_default == True)
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                default_db_query = default_db_query.filter(EdgeDatabase.project_id == project.id)
        default_db = default_db_query.first()
        if default_db:
            edge_db_id = str(default_db.id)

    # Deno engines: auto-provision Deno KV cache if no cache specified
    if provider_type == "deno" and not edge_cache_id and payload.edge_cache_id != "__none__":
        from ..models.models import EdgeCache
        # Check if a Deno KV cache already exists for this provider
        existing_kv_query = db.query(EdgeCache).filter(
            EdgeCache.provider == "deno_kv",
            EdgeCache.provider_account_id == payload.provider_id,
        )
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                existing_kv_query = existing_kv_query.filter(EdgeCache.project_id == project.id)
        existing_kv = existing_kv_query.first()
        if existing_kv:
            edge_cache_id = str(existing_kv.id)
        else:
            project_id_kv = None
            if ctx and ctx.tenant_id:
                project = get_project(db, ctx)
                if project:
                    project_id_kv = project.id
            kv_cache = EdgeCache(
                id=str(uuid.uuid4()),
                name=f"Deno KV ({payload.worker_name})",
                provider="deno_kv",
                cache_url="deno://kv",  # Placeholder — Deno KV is runtime-native
                cache_token=None,
                provider_account_id=payload.provider_id,
                is_default=False,
                is_system=True,  # System-managed, not user-deletable
                created_at=datetime.now(UTC).isoformat(),
                updated_at=datetime.now(UTC).isoformat(),
                project_id=project_id_kv,
            )
            db.add(kv_cache)
            db.commit()
            edge_cache_id = str(kv_cache.id)
            print(f"[Deno Deploy] Auto-provisioned Deno KV cache: {kv_cache.id}")

    # --- Construct engine URL (with optional per-provider hook) ---
    engine_url = _build_engine_url(provider_type, provider_ctx, payload.worker_name)
    pre_deploy = PRE_DEPLOY_HOOKS.get(provider_type)
    if pre_deploy:
        engine_url = await pre_deploy(provider_ctx, provider, payload.worker_name, db)

    # --- Engine config (provider-specific key name) ---
    config_key = PROVIDER_CONFIG_KEY.get(provider_type, "worker_name")
    # Inject system key for M2M auth
    from ..services.edge_client import inject_system_key
    engine_cfg = inject_system_key(json.dumps({config_key: payload.worker_name}))

    # --- Create or update engine record ---
    now = datetime.now(UTC).isoformat()
    existing = db.query(EdgeEngine).filter(EdgeEngine.url == engine_url).first()
    engine_id = None

    if existing:
        existing.is_active = True  # type: ignore[assignment]
        existing.edge_provider_id = payload.provider_id  # type: ignore[assignment]
        existing.adapter_type = payload.adapter_type  # type: ignore[assignment]
        existing.edge_db_id = edge_db_id  # type: ignore[assignment]
        existing.edge_cache_id = edge_cache_id  # type: ignore[assignment]
        existing.edge_queue_id = edge_queue_id  # type: ignore[assignment]
        existing.edge_auth_id = payload.edge_auth_id  # type: ignore[assignment]
        existing.engine_config = engine_cfg  # type: ignore[assignment]
        existing.updated_at = now  # type: ignore[assignment]
        if payload.compute_type == "community":
            existing.is_shared = True  # type: ignore[assignment]
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                existing.project_id = project.id  # type: ignore[assignment]
        engine_id = str(existing.id)
        db.commit()
        engine = existing
    else:
        project_id = None
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                project_id = project.id

        # Check edge_engines capacity quota limit (F1)
        if ctx and ctx.tenant_id and not ctx.is_master:
            from app.services.plan_limits import check_quota
            engine_count = db.query(EdgeEngine).filter(
                EdgeEngine.project_id == project_id
            ).count()
            check_quota(db, ctx, "edge_engines", engine_count)
            # Multi-project guards: shared engine only in default project; bound
            # db/cache/queue must be in the same project.
            from app.services.project_setup import (
                assert_community_engine_in_default_project, assert_engine_resources_same_project,
            )
            assert_community_engine_in_default_project(
                db, ctx.tenant_id, project_id, payload.compute_type == "community"
            )
            assert_engine_resources_same_project(
                db, project_id, edge_db_id, edge_cache_id, edge_queue_id
            )
        engine = EdgeEngine(
            id=str(uuid.uuid4()),
            name=payload.worker_name,
            edge_provider_id=payload.provider_id,
            adapter_type=payload.adapter_type,
            url=engine_url,
            edge_db_id=edge_db_id,
            edge_cache_id=edge_cache_id,
            edge_queue_id=edge_queue_id,
            edge_auth_id=payload.edge_auth_id,
            engine_config=engine_cfg,
            is_active=True,
            is_shared=payload.compute_type == "community",
            created_at=now,
            updated_at=now,
            project_id=project_id,
        )
        db.add(engine)
        db.commit()
        db.refresh(engine)
        engine_id = str(engine.id)

    # Sync bindings for datasources
    if payload.datasource_ids is not None:
        from app.models.edge import engine_datasources
        db.execute(engine_datasources.delete().where(engine_datasources.c.engine_id == engine.id))
        for ds_id in payload.datasource_ids:
            db.execute(engine_datasources.insert().values(engine_id=engine.id, datasource_id=ds_id))

    # Sync bindings for storages
    if payload.storage_ids is not None:
        from app.models.edge import engine_storages
        db.execute(engine_storages.delete().where(engine_storages.c.engine_id == engine.id))
        for st_id in payload.storage_ids:
            db.execute(engine_storages.insert().values(engine_id=engine.id, storage_id=st_id))

    db.commit()
    db.refresh(engine)

    # --- Deploy via shared engine_deploy.redeploy() ---
    try:
        result = await engine_deploy.redeploy(engine, db)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Deploy failed: {str(e)}")

    return {
        "success": True,
        "url": engine_url,
        "worker_name": payload.worker_name,
        "engine_id": engine_id,
        "provider": provider_type,
        "deploy_result": result,
    }
