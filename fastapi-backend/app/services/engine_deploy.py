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
from ..services.bundle import build_worker, get_source_hash, capture_source_snapshot
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
    
    Routes to provider-specific strategy based on engine's provider.
    """
    engine_url = str(engine.url).rstrip('/')
    adapter_type = str(engine.adapter_type) if engine.adapter_type is not None else "automations"
    provider = _resolve_provider(engine, db)

    try:
        # 1. Build latest bundle (provider-specific tsup config)
        script_content, bundle_hash = build_worker(adapter_type, provider=provider)
        source_hash = get_source_hash() or bundle_hash

        # 2. Route to provider-specific deployer
        if provider == 'cloudflare':
            await _deploy_cloudflare(engine, db, script_content, adapter_type)
        elif provider in PROVIDER_DEPLOYERS:
            await PROVIDER_DEPLOYERS[provider](engine, db, script_content, adapter_type)
        else:
            await _deploy_docker(engine_url, script_content, source_hash)

        # Update local record
        deployed_at = datetime.utcnow().isoformat() + "Z"
        engine.bundle_checksum = source_hash  # type: ignore[assignment]
        engine.last_deployed_at = deployed_at  # type: ignore[assignment]
        engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]

        # Capture source snapshot (readable TS files, not compiled JS)
        snapshot = capture_source_snapshot(provider=provider, adapter_type=adapter_type)
        if snapshot:
            engine.source_snapshot = json.dumps(snapshot)  # type: ignore[assignment]

        db.commit()
        db.refresh(engine)

        # Flush cache
        cache_flushed = await _flush_cache(engine_url)

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
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == engine.edge_provider_id
    ).first()

    creds = json.loads(str(provider.provider_credentials or '{}'))  # type: ignore[union-attr]
    api_token = creds.get('api_token')
    account_id = creds.get('account_id')
    cfg = json.loads(str(engine.engine_config or '{}'))
    worker_name = cfg.get('worker_name')

    if not api_token or not account_id or not worker_name:
        raise HTTPException(400, "Missing Cloudflare credentials or worker_name in engine config")

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

    # Build and push secrets
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        engine_id=str(engine.id),
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


async def _flush_cache(engine_url: str) -> bool:
    """Flush the edge cache on a target engine."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{engine_url}/api/cache/flush", timeout=10.0)
            return resp.status_code in (200, 204)
    except Exception:
        return False
