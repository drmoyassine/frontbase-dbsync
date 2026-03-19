"""
Cache Tester — Connectivity test helpers for edge cache providers.

Extracted from edge_caches.py for single-responsibility compliance.
Supports: Upstash (REST), Redis, Dragonfly, Cloudflare KV.
"""

import time
from typing import Optional

import httpx
from pydantic import BaseModel


class TestCacheResult(BaseModel):
    success: bool
    message: str
    latency_ms: Optional[float] = None


async def test_cache(provider: str, cache_url: str, cache_token: Optional[str], provider_account_id: Optional[str] = None) -> TestCacheResult:
    """Test connectivity to an edge-compatible cache."""
    if provider == "upstash":
        return await _test_upstash(cache_url, cache_token)
    elif provider == "cloudflare":
        return await _test_cf_kv(cache_url, provider_account_id)
    elif provider in ("redis", "dragonfly"):
        from ..services.sync.redis_client import test_redis_connection
        start = time.time()
        success, message = await test_redis_connection(
            redis_url=cache_url,
            redis_token=cache_token,
            redis_type=provider,
        )
        latency = round((time.time() - start) * 1000, 1)
        return TestCacheResult(
            success=success,
            message=f"{message} ({latency}ms)" if success else message,
            latency_ms=latency if success else None,
        )
    else:
        return TestCacheResult(
            success=False,
            message=f"Unknown cache provider: {provider}",
        )


async def _test_upstash(cache_url: str, cache_token: Optional[str]) -> TestCacheResult:
    """Test Upstash Redis connectivity via REST API."""
    if not cache_token:
        return TestCacheResult(
            success=False,
            message="Upstash requires an auth token",
        )
    
    start = time.time()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                cache_url,
                headers={
                    "Authorization": f"Bearer {cache_token}",
                    "Content-Type": "application/json",
                },
                json=["PING"],
                timeout=10.0,
            )
        
        latency = round((time.time() - start) * 1000, 1)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("result") == "PONG":
                return TestCacheResult(
                    success=True,
                    message=f"Connected to Upstash in {latency}ms",
                    latency_ms=latency,
                )
            else:
                return TestCacheResult(
                    success=True,
                    message=f"Connected ({data}) in {latency}ms",
                    latency_ms=latency,
                )
        else:
            return TestCacheResult(
                success=False,
                message=f"Upstash returned HTTP {resp.status_code}: {resp.text[:200]}",
            )
    except Exception as e:
        return TestCacheResult(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


async def _test_cf_kv(cache_url: str, provider_account_id: Optional[str]) -> TestCacheResult:
    """Test CF KV connectivity by listing keys in the namespace."""
    if not provider_account_id:
        return TestCacheResult(success=False, message="No connected account — cannot test KV")

    # cache_url stores the namespace ID for CF KV (may have kv:// prefix from discovery)
    namespace_id = cache_url.replace("kv://", "").strip()
    if not namespace_id:
        return TestCacheResult(success=False, message="No KV namespace ID")

    from ..database.config import SessionLocal
    from ..core.security import get_provider_creds
    db = SessionLocal()
    try:
        creds = get_provider_creds(provider_account_id, db)
    finally:
        db.close()

    if not creds:
        return TestCacheResult(success=False, message="Could not resolve account credentials")

    token = creds.get("api_token", "")
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            accts_resp = await client.get(
                "https://api.cloudflare.com/client/v4/accounts",
                headers={"Authorization": f"Bearer {token}"},
            )
            if accts_resp.status_code != 200:
                return TestCacheResult(success=False, message=f"CF API error: {accts_resp.status_code}")
            accounts = accts_resp.json().get("result", [])
            if not accounts:
                return TestCacheResult(success=False, message="No Cloudflare accounts found")
            acct_id = accounts[0].get("id", "")

            resp = await client.get(
                f"https://api.cloudflare.com/client/v4/accounts/{acct_id}/storage/kv/namespaces/{namespace_id}/keys",
                headers={"Authorization": f"Bearer {token}"},
                params={"limit": 1},
            )

        latency = round((time.time() - start) * 1000, 1)
        data = resp.json()
        if data.get("success"):
            return TestCacheResult(
                success=True,
                message=f"KV namespace accessible in {latency}ms",
                latency_ms=latency,
            )
        errors = data.get("errors", [{}])
        return TestCacheResult(
            success=False,
            message=f"KV error: {errors[0].get('message', 'Unknown')}",
        )
    except Exception as e:
        return TestCacheResult(success=False, message=f"Connection failed: {str(e)}")
