"""
Engine Deploy Service — Provider-Agnostic Deploy via Factory Pattern.

Routes deploy/redeploy operations to the correct provider strategy:
- Cloudflare: upload bundle → set secrets via CF API
- Docker/Node: POST bundle to engine /api/update → wait for restart

Uses secrets_builder.build_engine_secrets() — no duplication.
"""

import json
import asyncio
from datetime import datetime

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine, EdgeProviderAccount
from ..services.bundle import build_worker, get_source_hash
from ..services.secrets_builder import build_engine_secrets
from ..services import cloudflare_api


def _resolve_provider(engine: EdgeEngine, db: Session) -> str:
    """Determine the deployment provider for an engine.
    
    Returns 'cloudflare' or 'docker'.
    """
    if engine.edge_provider_id:
        provider = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == engine.edge_provider_id
        ).first()
        if provider and str(provider.provider) == 'cloudflare':
            return 'cloudflare'
    return 'docker'


async def redeploy(engine: EdgeEngine, db: Session) -> dict:
    """Redeploy an engine with the latest bundle code + current secrets.
    
    Routes to provider-specific strategy based on engine's provider.
    """
    engine_url = str(engine.url).rstrip('/')
    adapter_type = str(engine.adapter_type) if engine.adapter_type else "automations"
    provider = _resolve_provider(engine, db)

    try:
        # 1. Build latest bundle
        script_content, bundle_hash = build_worker(adapter_type)
        source_hash = get_source_hash() or bundle_hash

        if provider == 'cloudflare':
            await _deploy_cloudflare(engine, db, script_content, adapter_type)
        else:
            await _deploy_docker(engine_url, script_content, source_hash)

        # Update local record
        deployed_at = datetime.utcnow().isoformat() + "Z"
        engine.bundle_checksum = source_hash  # type: ignore[assignment]
        engine.last_deployed_at = deployed_at  # type: ignore[assignment]
        engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
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
    await cloudflare_api.upload_worker(api_token, account_id, worker_name, script_content, script_filename)

    # Build and push secrets
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id else None,
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
