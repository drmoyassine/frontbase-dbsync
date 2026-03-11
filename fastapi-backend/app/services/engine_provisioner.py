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
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

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


# Registry: provider_type → async pre-deploy hook
# Extend this dict when adding new providers that need pre-deploy setup.
PRE_DEPLOY_HOOKS: dict = {
    "cloudflare": _cf_pre_deploy,
}


# =============================================================================
# Provision + Deploy
# =============================================================================

async def provision_and_deploy(payload: GenericDeployRequest, db: Session) -> dict:
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

    ctx = get_provider_context_by_id(db, payload.provider_id)
    label = PROVIDER_LABELS[provider_type]

    # --- Resolve edge IDs (handle '__none__' sentinel) ---
    edge_db_id = payload.edge_db_id if payload.edge_db_id != "__none__" else None
    edge_cache_id = payload.edge_cache_id if payload.edge_cache_id != "__none__" else None
    edge_queue_id = payload.edge_queue_id if payload.edge_queue_id != "__none__" else None

    # Default DB if none specified
    if not edge_db_id and payload.edge_db_id != "__none__":
        default_db = db.query(EdgeDatabase).filter(EdgeDatabase.is_default == True).first()  # noqa: E712
        if default_db:
            edge_db_id = str(default_db.id)

    # --- Construct engine URL (with optional per-provider hook) ---
    engine_url = _build_engine_url(provider_type, ctx, payload.worker_name)
    pre_deploy = PRE_DEPLOY_HOOKS.get(provider_type)
    if pre_deploy:
        engine_url = await pre_deploy(ctx, provider, payload.worker_name, db)

    # --- Engine config (provider-specific key name) ---
    config_key = PROVIDER_CONFIG_KEY.get(provider_type, "worker_name")
    engine_cfg = json.dumps({config_key: payload.worker_name})

    # --- Create or update engine record ---
    now = datetime.utcnow().isoformat()
    existing = db.query(EdgeEngine).filter(EdgeEngine.url == engine_url).first()
    engine_id = None

    if existing:
        existing.is_active = True  # type: ignore[assignment]
        existing.edge_provider_id = payload.provider_id  # type: ignore[assignment]
        existing.adapter_type = payload.adapter_type  # type: ignore[assignment]
        existing.edge_db_id = edge_db_id  # type: ignore[assignment]
        existing.edge_cache_id = edge_cache_id  # type: ignore[assignment]
        existing.edge_queue_id = edge_queue_id  # type: ignore[assignment]
        existing.engine_config = engine_cfg  # type: ignore[assignment]
        existing.updated_at = now  # type: ignore[assignment]
        engine_id = str(existing.id)
        db.commit()
        engine = existing
    else:
        engine = EdgeEngine(
            id=str(uuid.uuid4()),
            name=f"{label}: {payload.worker_name}",
            edge_provider_id=payload.provider_id,
            adapter_type=payload.adapter_type,
            url=engine_url,
            edge_db_id=edge_db_id,
            edge_cache_id=edge_cache_id,
            edge_queue_id=edge_queue_id,
            engine_config=engine_cfg,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(engine)
        db.commit()
        db.refresh(engine)
        engine_id = str(engine.id)

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
