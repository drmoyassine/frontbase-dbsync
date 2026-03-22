"""
DB Connection Tester — Provider-specific database connectivity tests.

Extracted from edge_databases.py router for SRP compliance.
Tests actual database connections (url+token) as opposed to provider_tester.py
which validates provider account credentials (API tokens).
"""

import time
import re
import logging
from typing import Optional

import httpx

from ..schemas.edge_engines import TestConnectionResult

logger = logging.getLogger(__name__)


# =============================================================================
# Public Entry Point
# =============================================================================

async def test_db_connection(
    provider: str,
    db_url: str,
    db_token: Optional[str],
    provider_account_id: Optional[str] = None,
) -> TestConnectionResult:
    """Test connectivity to an edge-compatible database."""
    if provider == "turso":
        return await _test_turso(db_url, db_token)
    elif provider == "sqlite":
        return TestConnectionResult(
            success=True,
            message="Local SQLite is always available",
            latency_ms=0,
        )
    elif provider == "neon":
        return await _test_neon(db_url, db_token)
    elif provider == "cloudflare":
        return await _test_cloudflare_d1(db_url, provider_account_id)
    elif provider == "supabase":
        return await _test_supabase_db(db_url, provider_account_id)
    else:
        return TestConnectionResult(
            success=False,
            message=f"Unknown provider: {provider}",
        )


# =============================================================================
# URL Resolution Helpers
# =============================================================================

async def resolve_pg_url(
    db_url: str,
    provider: str | None,
    provider_account_id: str | None,
) -> str:
    """Resolve the actual connectable PG URL, handling Supabase credential resolution."""
    if provider == 'supabase' and provider_account_id:
        resolved = await resolve_supabase_pooler(db_url, provider_account_id)
        if resolved:
            return resolved
    return db_url


async def get_supabase_api_context(
    db_url: str,
    provider_account_id: str,
) -> tuple[Optional[str], Optional[str]]:
    """Get (access_token, project_ref) for Supabase Management API calls.

    Extracts the project ref from the pooler URL (postgres.<ref>@...) and
    retrieves the access_token from the connected account.
    Returns (None, None) if either cannot be resolved.
    """
    from ..core.security import get_provider_creds
    from ..database.config import SessionLocal

    # Extract project ref from pooler URL: postgres.<ref>@... or postgres.<ref>:...
    project_ref: Optional[str] = None
    match = re.search(r'postgres\.([a-z0-9]+)[@:]', db_url)
    if not match:
        # Try direct DB URL format: db.<ref>.supabase.co
        match = re.search(r'db\.([a-z0-9]+)\.supabase', db_url)
    if match:
        project_ref = match.group(1)
    else:
        logger.warning("[Supabase API] Cannot extract project ref from URL: %s", db_url[:80])
        return None, None

    # Get access token from connected account
    db = SessionLocal()
    try:
        creds = get_provider_creds(provider_account_id, db)
    finally:
        db.close()

    if not creds:
        logger.warning("[Supabase API] No creds for account %s", provider_account_id)
        return None, None

    token = creds.get("access_token", "")
    if not token:
        logger.warning("[Supabase API] No access_token for account %s", provider_account_id)
        return None, None

    return token, project_ref


# =============================================================================
# Per-Provider Testers
# =============================================================================

async def _test_turso(db_url: str, db_token: Optional[str]) -> TestConnectionResult:
    """Test Turso connectivity via HTTP API."""
    # Convert libsql:// to https:// for HTTP API
    http_url = db_url
    if http_url.startswith("libsql://"):
        http_url = http_url.replace("libsql://", "https://")

    if not http_url.startswith("https://"):
        http_url = f"https://{http_url}"

    pipeline_url = f"{http_url}/v2/pipeline"

    start = time.time()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                pipeline_url,
                json={"requests": [
                    {"type": "execute", "stmt": {"sql": "SELECT 1 AS ping"}},
                    {"type": "close"},
                ]},
                headers={
                    "Authorization": f"Bearer {db_token}",
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )

        latency = round((time.time() - start) * 1000, 1)

        if resp.status_code == 200:
            return TestConnectionResult(
                success=True,
                message=f"Connected to Turso in {latency}ms",
                latency_ms=latency,
            )
        else:
            return TestConnectionResult(
                success=False,
                message=f"Turso returned HTTP {resp.status_code}: {resp.text[:200]}",
            )
    except Exception as e:
        return TestConnectionResult(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


async def _test_neon(db_url: str, db_token: Optional[str]) -> TestConnectionResult:
    """Test Neon connectivity via asyncpg (standard PostgreSQL connection)."""
    import asyncpg

    if not db_url:
        return TestConnectionResult(success=False, message="No connection URI provided")

    start = time.time()
    try:
        conn = await asyncpg.connect(db_url, timeout=10)
        try:
            await conn.fetchval("SELECT 1")
        finally:
            await conn.close()

        latency = round((time.time() - start) * 1000, 1)
        return TestConnectionResult(
            success=True,
            message=f"Connected to Neon in {latency}ms",
            latency_ms=latency,
        )
    except Exception as e:
        err = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
        return TestConnectionResult(
            success=False,
            message=f"Connection failed: {err}",
        )


async def _test_cloudflare_d1(
    db_url: str, provider_account_id: Optional[str]
) -> TestConnectionResult:
    """Test CF D1 connectivity by querying database info via the CF API."""
    if not provider_account_id:
        return TestConnectionResult(success=False, message="No connected account — cannot test D1")

    # Extract UUID from d1:// URL
    db_uuid = db_url.replace("d1://", "").strip()
    if not db_uuid:
        return TestConnectionResult(success=False, message="Invalid D1 URL")

    # Resolve credentials from connected account
    from ..core.security import get_provider_creds
    from ..database.config import SessionLocal

    db = SessionLocal()
    try:
        creds = get_provider_creds(provider_account_id, db)
    finally:
        db.close()

    if not creds:
        return TestConnectionResult(success=False, message="Could not resolve account credentials")

    token = creds.get("api_token", "")
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Get CF account ID
            accts_resp = await client.get(
                "https://api.cloudflare.com/client/v4/accounts",
                headers={"Authorization": f"Bearer {token}"},
            )
            if accts_resp.status_code != 200:
                return TestConnectionResult(success=False, message=f"CF API error: {accts_resp.status_code}")
            accounts = accts_resp.json().get("result", [])
            if not accounts:
                return TestConnectionResult(success=False, message="No Cloudflare accounts found")
            acct_id = accounts[0].get("id", "")

            # Query the D1 database info
            resp = await client.get(
                f"https://api.cloudflare.com/client/v4/accounts/{acct_id}/d1/database/{db_uuid}",
                headers={"Authorization": f"Bearer {token}"},
            )

        latency = round((time.time() - start) * 1000, 1)
        data = resp.json()
        if data.get("success"):
            db_name = data.get("result", {}).get("name", db_uuid)
            return TestConnectionResult(
                success=True,
                message=f"Connected to D1 '{db_name}' in {latency}ms",
                latency_ms=latency,
            )
        errors = data.get("errors", [{}])
        return TestConnectionResult(
            success=False,
            message=f"D1 error: {errors[0].get('message', 'Unknown')}",
        )
    except Exception as e:
        return TestConnectionResult(success=False, message=f"Connection failed: {str(e)}")


async def _test_supabase_db(
    db_url: str, provider_account_id: Optional[str] = None
) -> TestConnectionResult:
    """Test Supabase DB connectivity.

    Strategy:
      1. If db_url is a valid postgresql:// URI → asyncpg direct connection
      2. Otherwise, resolve credentials from connected account → REST API ping
    """
    # Strategy 1: direct PG connection if we have a valid URI
    if db_url and db_url.startswith(('postgresql://', 'postgres://')) and '[YOUR-PASSWORD]' not in db_url:
        start = time.time()
        try:
            import asyncpg
            conn = await asyncpg.connect(db_url, timeout=10)
            try:
                await conn.fetchval("SELECT 1")
            finally:
                await conn.close()
            latency = round((time.time() - start) * 1000, 1)
            return TestConnectionResult(
                success=True,
                message=f"Connected to Supabase DB in {latency}ms (direct PG)",
                latency_ms=latency,
            )
        except Exception as e:
            err = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
            return TestConnectionResult(success=False, message=f"Connection failed: {err}")

    # Strategy 2: REST API ping via connected account credentials
    if not provider_account_id:
        return TestConnectionResult(
            success=False,
            message="No valid PostgreSQL URI and no connected account. "
                    "Please connect a Supabase account first.",
        )

    from ..core.security import get_provider_creds
    from ..database.config import SessionLocal

    db = SessionLocal()
    try:
        creds = get_provider_creds(provider_account_id, db)
    finally:
        db.close()

    if not creds:
        return TestConnectionResult(success=False, message="Could not resolve account credentials")

    api_url = creds.get("api_url", "")
    service_key = creds.get("service_role_key", "")
    anon_key = creds.get("anon_key", "")
    key_to_use = service_key or anon_key

    if not api_url or not key_to_use:
        logger.warning("[Supabase test] Missing api_url=%s or keys for acct=%s. Keys: %s",
                     bool(api_url), provider_account_id, list(creds.keys()))
        return TestConnectionResult(
            success=False,
            message=f"Connected account is missing api_url or service_role_key. "
                    f"Available credential keys: {', '.join(creds.keys())}",
        )

    # Ping the Supabase REST API
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{api_url}/rest/v1/",
                headers={
                    "apikey": key_to_use,
                    "Authorization": f"Bearer {key_to_use}",
                },
            )
        latency = round((time.time() - start) * 1000, 1)
        if resp.status_code in (200, 204):
            return TestConnectionResult(
                success=True,
                message=f"Connected to Supabase in {latency}ms (REST API)",
                latency_ms=latency,
            )
        else:
            return TestConnectionResult(
                success=False,
                message=f"Supabase REST API returned HTTP {resp.status_code}: {resp.text[:200]}",
            )
    except Exception as e:
        err = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
        return TestConnectionResult(success=False, message=f"Connection failed: {err}")


# =============================================================================
# Supabase Pooler URI Resolution
# =============================================================================

async def resolve_supabase_pooler(
    db_url_or_ref: str, provider_account_id: str
) -> Optional[str]:
    """Resolve the Supabase pooler URI from the connected account credentials."""
    from ..core.security import get_provider_creds
    from ..services.provider_discovery import _fetch_supabase_pooler_uri
    from ..database.config import SessionLocal

    db = SessionLocal()
    try:
        creds = get_provider_creds(provider_account_id, db)
    finally:
        db.close()

    if not creds:
        logger.warning("[Supabase test] No creds found for account %s", provider_account_id)
        return None

    token = creds.get("access_token", "")
    if not token:
        logger.warning("[Supabase test] No access_token in creds for account %s", provider_account_id)
        return None

    # Extract project ref: either a plain ref or from the db_url
    project_ref = db_url_or_ref
    if '.' in project_ref or '/' in project_ref:
        # Try pooler URL format: postgres.<ref>@...pooler.supabase.com
        match = re.search(r'postgres\.([a-z0-9]+)[@:]', project_ref)
        if not match:
            # Try direct DB URL format: db.<ref>.supabase.co
            match = re.search(r'db\.([a-z0-9]+)\.supabase', project_ref)
        if match:
            project_ref = match.group(1)

    try:
        uri = await _fetch_supabase_pooler_uri(token, project_ref)
        if uri:
            return uri
        logger.warning("[Supabase test] Pooler API returned no URI for ref=%s", project_ref)
    except Exception as e:
        logger.warning("[Supabase test] Pooler API failed for ref=%s: %s", project_ref, e)

    # Fallback: try the database settings endpoint
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.supabase.com/v1/projects/{project_ref}/config/database",
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                host = data.get("host", "")
                if host:
                    # Build a standard pooler URI
                    port = data.get("port", 5432)
                    db_name = data.get("db_name", "postgres")
                    return f"postgresql://postgres.{project_ref}:{token}@{host}:{port}/{db_name}"
            else:
                logger.warning("[Supabase test] Settings API returned %d for ref=%s", resp.status_code, project_ref)
    except Exception as e:
        logger.warning("[Supabase test] Settings API failed for ref=%s: %s", project_ref, e)

    return None
