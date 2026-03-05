"""
Engine Test & Remote Delete Helpers.

Connection testing, Cloudflare credential extraction, and remote delete operations.
Extracted from routers/edge_engines.py for single-concern compliance.
"""

import json
import time

import httpx
from fastapi import HTTPException

from ..models.models import EdgeEngine
from ..schemas.edge_engines import TestConnectionResult
from ..services import cloudflare_api


async def test_connection(url: str, provider: str) -> TestConnectionResult:
    """Test connectivity to an edge engine by hitting its /api/health endpoint."""
    health_url = f"{url.rstrip('/')}/api/health"

    try:
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(health_url)
        latency_ms = round((time.monotonic() - start) * 1000, 1)

        if response.is_success:
            return TestConnectionResult(
                success=True,
                message=f"{provider.title()} engine is reachable",
                latency_ms=latency_ms,
            )
        else:
            return TestConnectionResult(
                success=False,
                message=f"Engine returned HTTP {response.status_code}",
                latency_ms=latency_ms,
            )
    except httpx.ConnectError:
        return TestConnectionResult(
            success=False,
            message="Connection refused — is the engine running?",
        )
    except httpx.TimeoutException:
        return TestConnectionResult(
            success=False,
            message="Connection timed out after 5s",
        )
    except Exception as e:
        return TestConnectionResult(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


def extract_cf_creds(engine: EdgeEngine) -> dict:
    """Extract Cloudflare credentials and worker name from an EdgeEngine (DB-only, no I/O)."""
    if not engine.edge_provider or not engine.edge_provider.provider_credentials:
        raise HTTPException(400, "No Cloudflare API token stored on the associated provider account")

    credentials = json.loads(str(engine.edge_provider.provider_credentials))
    api_token = credentials.get("api_token")
    account_id = credentials.get("account_id")

    if not api_token or not account_id:
        raise HTTPException(400, "Invalid Cloudflare provider credentials missing api_token or account_id")

    # Extract worker name from engine_config or URL
    worker_name = str(engine.name)  # Fallback
    if engine.engine_config:
        conf = json.loads(str(engine.engine_config))
        worker_name = conf.get("worker_name", worker_name)

    target_url = str(engine.url or "")
    if target_url and "workers.dev" in target_url:
        from urllib.parse import urlparse
        parsed = urlparse(target_url)
        parts = (parsed.hostname or "").split(".")
        if len(parts) >= 3:
            worker_name = parts[0]

    return {
        "api_token": api_token,
        "account_id": account_id,
        "worker_name": worker_name,
    }


async def delete_cloudflare_worker(engine: EdgeEngine) -> None:
    """Delete a Cloudflare Worker — convenience wrapper."""
    creds = extract_cf_creds(engine)
    await delete_cloudflare_worker_from_creds(creds)


async def delete_cloudflare_worker_from_creds(creds: dict) -> None:
    """Delete a Cloudflare Worker using pre-extracted credentials (pure HTTP, no DB)."""
    await cloudflare_api.delete_worker(
        creds["api_token"],
        creds["account_id"],
        creds["worker_name"],
    )
