"""
Engine Deploy Service — Provider-Agnostic Router.

Routes deploy/redeploy operations to the correct provider strategy:
- Cloudflare: upload bundle → set secrets via CF API
- Supabase/Upstash/Vercel/Netlify/Deno: delegated to *_deploy_api.deploy()
- Docker/Node: POST bundle to engine /api/update → wait for restart

Uses secrets_builder.build_engine_secrets() — no duplication.

To add a new provider:
  1. Create <provider>_deploy_api.py with a deploy() function
  2. Add to PROVIDER_DEPLOYERS below
  3. Add adapters + tsup configs in services/edge/
"""

import json
import asyncio
from datetime import datetime

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine, EdgeProviderAccount
from ..services.bundle import build_worker, build_worker_from_snapshot, get_source_hash, capture_source_snapshot, CORE_PREFIX
from ..services.secrets_builder import build_engine_secrets
from ..services import cloudflare_api
from ..services import supabase_deploy_api
from ..services import upstash_deploy_api
from ..services import vercel_deploy_api
from ..services import netlify_deploy_api
from ..services import deno_deploy_api


# ── Provider Registry ─────────────────────────────────────────────────
# Each entry maps a provider name → async deploy(engine, db, script_content, adapter_type)
PROVIDER_DEPLOYERS = {
    'supabase': supabase_deploy_api.deploy,
    'upstash':  upstash_deploy_api.deploy,
    'vercel':   vercel_deploy_api.deploy,
    'netlify':  netlify_deploy_api.deploy,
    'deno':     deno_deploy_api.deploy,
}

KNOWN_PROVIDERS = frozenset({'cloudflare', *PROVIDER_DEPLOYERS.keys()})


def _resolve_provider(engine: EdgeEngine, db: Session) -> str:
    """Determine the deployment provider for an engine.
    
    Returns a known provider name or 'docker' as fallback.
    """
    if engine.edge_provider_id is not None:
        provider = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == engine.edge_provider_id
        ).first()
        if provider:
            name = str(provider.provider)
            if name in KNOWN_PROVIDERS:
                return name
    return 'docker'


async def redeploy(engine: EdgeEngine, db: Session) -> dict:
    """Redeploy an engine with the latest bundle code + current secrets.
    
    Core Zone Convention:
    - If engine has a customized snapshot (is_forked), build from snapshot in temp dir
    - Otherwise, build from the shared source tree
    """
    engine_url = str(engine.url).rstrip('/')
    adapter_type = str(engine.adapter_type) if engine.adapter_type is not None else "automations"
    provider = _resolve_provider(engine, db)

    try:
        # Check if engine has a customized snapshot (forked)
        existing_snapshot = json.loads(str(engine.source_snapshot or '{}')) if str(engine.source_snapshot or '') else {}
        is_forked = bool(engine.is_forked) or any(
            not k.startswith(f"{CORE_PREFIX}/") for k in existing_snapshot if not k.endswith("README.md")
        )

        if is_forked and existing_snapshot:
            # Build from engine's isolated snapshot (temp dir)
            print(f"[Redeploy] Engine '{engine.name}' is forked — building from snapshot")
            script_content, bundle_hash = build_worker_from_snapshot(
                existing_snapshot, adapter_type, provider=provider
            )
            source_hash = bundle_hash
        else:
            # Standard build from shared source tree
            script_content, bundle_hash = build_worker(adapter_type, provider=provider)
            source_hash = get_source_hash() or bundle_hash

        # 2. Route to provider-specific deployer
        if provider == 'cloudflare':
            await _deploy_cloudflare(engine, db, script_content, adapter_type)
        elif provider in PROVIDER_DEPLOYERS:
            await PROVIDER_DEPLOYERS[provider](engine, db, script_content, adapter_type)
        else:
            await _deploy_docker(engine_url, script_content, source_hash)

        # 3. Initialize Supabase state DB at deploy time (provider-agnostic).
        #    If the engine's state DB is on Supabase, create schema + tables
        #    via Management API since the pooler URL has [YOUR-PASSWORD] placeholder.
        await _init_supabase_state_db_if_needed(engine, db)

        # Update local record
        deployed_at = datetime.utcnow().isoformat() + "Z"
        engine.bundle_checksum = source_hash  # type: ignore[assignment]
        engine.last_deployed_at = deployed_at  # type: ignore[assignment]
        engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]

        # Capture source snapshot for non-forked engines (forked engines keep their snapshot)
        if not is_forked:
            snapshot = capture_source_snapshot(provider=provider, adapter_type=adapter_type)
            if snapshot:
                engine.source_snapshot = json.dumps(snapshot)  # type: ignore[assignment]

        db.commit()
        db.refresh(engine)

        # Flush cache only when a cache resource is actually connected
        if engine.edge_cache_id is not None:
            cache_flushed = await _flush_cache(engine_url)
        else:
            cache_flushed = False

        return {
            "success": True,
            "mode": provider,
            "source_hash": source_hash,
            "deployed_at": deployed_at,
            "cache_flushed": cache_flushed,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Redeploy failed: {str(e)}")


async def _deploy_cloudflare(
    engine: EdgeEngine, db: Session,
    script_content: str, adapter_type: str
) -> None:
    """Cloudflare-specific deploy: upload bundle + set secrets."""
    from ..core.credential_resolver import get_provider_context_by_id

    ctx = get_provider_context_by_id(db, str(engine.edge_provider_id))
    api_token = ctx.get('api_token')
    account_id = ctx.get('account_id')
    cfg = json.loads(str(engine.engine_config or '{}'))
    worker_name = cfg.get('worker_name')

    if not api_token or not account_id or not worker_name:
        raise HTTPException(400, "Missing Cloudflare credentials or worker_name in engine config")

    # Narrow types for pyright after guard
    api_token = str(api_token)
    account_id = str(account_id)
    worker_name = str(worker_name)

    script_filename = "cloudflare.js" if adapter_type == "full" else "cloudflare-lite.js"

    # Check if engine has GPU models — inject AI binding if so
    from ..models.models import EdgeGPUModel
    gpu_models = db.query(EdgeGPUModel).filter(
        EdgeGPUModel.edge_engine_id == str(engine.id)
    ).all()
    bindings = [{"type": "ai", "name": "AI"}] if gpu_models else None

    await cloudflare_api.upload_worker(
        api_token, account_id, worker_name, script_content,
        script_filename, bindings=bindings,
    )

    # Enable workers.dev subdomain AFTER upload (worker must exist first)
    await cloudflare_api.enable_workers_dev(str(api_token), str(account_id), str(worker_name))

    # Build and push secrets
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        engine_id=str(engine.id),
        deploy_provider='cloudflare',
    )
    if secrets:
        await cloudflare_api.set_secrets(api_token, account_id, worker_name, secrets)


async def _deploy_docker(engine_url: str, script_content: str, source_hash: str) -> None:
    """Docker/Node.js deploy: POST bundle to engine /api/update → wait for restart."""
    async with httpx.AsyncClient() as client:
        # Health check first
        try:
            health = await client.get(f"{engine_url}/api/health", timeout=5.0)
            if health.status_code != 200:
                raise HTTPException(503, f"Engine unreachable: health check returned {health.status_code}")
        except httpx.ConnectError:
            raise HTTPException(503, f"Engine unreachable at {engine_url}")

        # Send update
        update_resp = await client.post(
            f"{engine_url}/api/update",
            json={
                "script_content": script_content,
                "source_hash": source_hash,
                "version": "latest",
            },
            timeout=30.0,
        )

        if update_resp.status_code != 200:
            detail = update_resp.text
            raise HTTPException(update_resp.status_code, f"Engine update failed: {detail}")

    # Wait for engine to restart and come back healthy
    engine_healthy = False
    for attempt in range(6):  # 6 attempts × 3s = 18s max wait
        await asyncio.sleep(3)
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{engine_url}/api/health", timeout=5.0)
                if resp.status_code == 200:
                    engine_healthy = True
                    break
        except Exception:
            continue

    if not engine_healthy:
        print(f"[Redeploy] Warning: Engine {engine_url} did not come back healthy after update")


async def _init_supabase_state_db_if_needed(engine: EdgeEngine, db: Session) -> None:
    """If the engine's state DB is Supabase, ensure schema + tables + RLS are initialized.

    Runs at deploy time for ALL engine providers. The Supabase state provider
    now uses PostgREST (HTTP), so this just ensures the schema/tables/grants exist.
    """
    import re
    from ..models.models import EdgeDatabase
    from ..core.security import get_provider_creds

    if engine.edge_db_id is None:
        return

    edge_db = db.query(EdgeDatabase).filter(EdgeDatabase.id == engine.edge_db_id).first()
    if not edge_db or str(edge_db.provider) != 'supabase':
        return
    if not str(edge_db.provider_account_id or ''):
        return

    # Get project_ref from provider_config (set during provisioning)
    config = json.loads(str(edge_db.provider_config or '{}')) if str(edge_db.provider_config or '') else {}
    project_ref = ''

    # Try provider_config first (PostgREST stores supabase_url)
    supabase_url = config.get('supabase_url', '')
    ref_match = re.search(r'([a-z0-9]+)\.supabase\.co', supabase_url) if supabase_url else None
    if ref_match:
        project_ref = ref_match.group(1)

    if not project_ref:
        # Try creds metadata (has project_ref from account connection)
        creds = get_provider_creds(str(edge_db.provider_account_id), db)
        project_ref = (creds or {}).get('project_ref', '')

    if not project_ref:
        # Fallback: parse from db_url
        raw_url = str(edge_db.db_url or '')
        # Match <ref>.supabase.co or db.<ref>.supabase.com (exclude 'pooler')
        ref_match = re.search(r'([a-z0-9]{10,})\.supabase\.co', raw_url)
        if not ref_match:
            ref_match = re.search(r'db\.([a-z0-9]+)\.supabase', raw_url)
        if ref_match:
            project_ref = ref_match.group(1)

    if not project_ref:
        print(f"[StateDB Init] Cannot extract project ref")
        return

    # Get access token
    creds = get_provider_creds(str(edge_db.provider_account_id), db)
    if not creds:
        print(f"[StateDB Init] No creds for account {edge_db.provider_account_id}")
        return
    token = creds.get("access_token", "")
    if not token:
        print(f"[StateDB Init] No access_token for account {edge_db.provider_account_id}")
        return

    schema_name = config.get('schema_name', 'frontbase_edge')

    from ..services.supabase_state_db import init_supabase_state_db
    result = await init_supabase_state_db(token, project_ref, schema_name)
    if result.get('success'):
        print(f"[StateDB Init] ✅ Schema '{schema_name}' + tables + RLS ready for {project_ref}")
    else:
        print(f"[StateDB Init] ⚠️ Init warning: {result.get('detail', 'unknown')}")



async def _flush_cache(engine_url: str) -> bool:
    """Flush the edge cache on a target engine."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{engine_url}/api/cache/flush", timeout=10.0)
            return resp.status_code in (200, 204)
    except Exception:
        return False
