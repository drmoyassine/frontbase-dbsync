"""
Upstash Workflows — Deploy API.

Treats Upstash as a Docker-like deploy target (POST bundle to /api/update).
Durability is handled by existing QStash queue integration (engine/qstash.ts).

Credentials: { "api_token": "...", "email": "..." }
"""

import json
import asyncio
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine, EdgeProviderAccount
from ..services.secrets_builder import build_engine_secrets


async def deploy(engine: EdgeEngine, db: Session, script_content: str, adapter_type: str) -> None:
    """Deploy bundle to Upstash (Docker-like: POST to /api/update)."""
    engine_url = str(engine.url).rstrip('/')

    creds_provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == engine.edge_provider_id
    ).first()
    from ..core.security import decrypt_credentials
    creds = decrypt_credentials(str(creds_provider.provider_credentials or '{}'))  # type: ignore[union-attr]

    if not engine_url:
        raise HTTPException(400, "Missing engine URL for Upstash deploy")

    source_hash = "upstash-deploy"

    async with httpx.AsyncClient() as client:
        # Health check
        try:
            health = await client.get(f"{engine_url}/api/health", timeout=5.0)
            if health.status_code != 200:
                raise HTTPException(503, f"Upstash engine unreachable: {health.status_code}")
        except httpx.ConnectError:
            raise HTTPException(503, f"Upstash engine unreachable at {engine_url}")

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
            raise HTTPException(update_resp.status_code, f"Upstash update failed: {update_resp.text}")

    # Wait for restart
    engine_healthy = False
    for attempt in range(6):
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
        print(f"[Upstash] Warning: Engine {engine_url} did not come back healthy after update")


async def register_qstash_endpoint(api_token: str, endpoint_url: str) -> dict | None:
    """Register the engine endpoint with QStash for scheduled triggers."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://qstash.upstash.io/v2/publish",
            headers={"Authorization": f"Bearer {api_token}"},
            json={"url": endpoint_url},
            timeout=10.0,
        )
        if resp.status_code in (200, 201):
            return resp.json()
    return None
