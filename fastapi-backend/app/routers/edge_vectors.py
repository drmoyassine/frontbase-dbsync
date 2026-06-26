"""
Edge Vectors router.

CRUD for managing named edge vector connections (pgvector, cloudflare_vectorize, turso_vector, embedded_lancedb).
Mirrors the EdgeDatabase/EdgeCache pattern.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, UTC
import uuid
import ipaddress
import urllib.parse
import json
import logging
import httpx

from ..database.config import SessionLocal
from ..models.models import EdgeVector, EdgeEngine, EdgeProviderAccount
from ..middleware.tenant_context import TenantContext, get_tenant_context
from ..database.utils import get_project
from ..schemas.edge_vectors import EdgeVectorCreate, EdgeVectorUpdate, EdgeVectorResponse
from ..core.security import encrypt_field, decrypt_field, get_provider_creds
from ..config.edge_security import (
    DEFAULT_BLOCKED_IP_RANGES,
    ALLOWED_URL_SCHEMES,
    ALLOWED_DOMAINS,
    SSRF_LOG_ENABLED,
    SSRF_LOG_ATTEMPTS,
)
from ..services.security_logger import (
    log_security_event,
    SSRF_ATTEMPT_BLOCKED,
    VECTOR_CONNECTION_FAILED,
    VECTOR_AUTH_FAILED,
    CREDENTIAL_RESOLUTION_FAILED,
)
from ..services.dns_cache import resolve_all

router = APIRouter(prefix="/api/edge-vectors", tags=["edge-vectors"])

logger = logging.getLogger(__name__)


# =============================================================================
# SSRF guard
# =============================================================================

def _ip_is_unsafe(ip: ipaddress._BaseAddress) -> bool:
    """True if a resolved address must never be dialed from a connection tester.

    Rejects IPv4-mapped IPv6 (``::ffff:x.x.x.x`` — can slip past ``is_global``
    while routing to private IPv4), anything in the configured blocklist (cloud
    metadata + RFC1918 + loopback), and any non-globally-routable address.
    """
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        return True
    if any(ip in network for network in DEFAULT_BLOCKED_IP_RANGES):
        return True
    return not ip.is_global


def _is_safe_url(url: str, ctx: Optional[object] = None, source_ip: Optional[str] = None) -> bool:
    """Check if URL points only to safe global IPs, preventing SSRF to local/metadata IPs.

    Resolves the hostname to **every** A/AAAA record (via the TTL-stabilized
    ``dns_cache.resolve_all``) and rejects the URL if **any** resolved address
    is private, link-local, cloud-metadata, or IPv4-mapped. Checking all records
    (rather than the single address ``gethostbyname`` happens to return) closes
    the mixed-A-record DNS-rebinding variant: a hostname that advertises both a
    public and a private address is treated as unsafe. Allowlisted domains
    bypass the check entirely; unresolvable hosts are unsafe and logged.

    Note: the synthetic ``https://{host}/`` form is also used by the pgvector
    DSN path (see ``_extract_pgdsn_host``) so the check can run without leaking
    embedded DSN credentials into the security-event log.
    """
    try:
        hostname = urllib.parse.urlparse(url).hostname
        if not hostname:
            return False

        # Allowlisted internal domains bypass the IP gate.
        if hostname in ALLOWED_DOMAINS:
            return True

        resolved = resolve_all(hostname)
        if not resolved:
            if SSRF_LOG_ENABLED and SSRF_LOG_ATTEMPTS:
                log_security_event(
                    SSRF_ATTEMPT_BLOCKED,
                    severity="medium",
                    details={
                        "url": url,
                        "hostname": hostname,
                        "reason": "DNS resolution returned no addresses",
                    },
                    ctx=ctx,
                    source_ip=source_ip,
                )
            return False

        for ip_str in resolved:
            ip = ipaddress.ip_address(ip_str)
            if _ip_is_unsafe(ip):
                if SSRF_LOG_ENABLED and SSRF_LOG_ATTEMPTS:
                    log_security_event(
                        SSRF_ATTEMPT_BLOCKED,
                        severity="high",
                        details={
                            "url": url,
                            "hostname": hostname,
                            "resolved_ips": resolved,
                            "blocked_ip": ip_str,
                            "ipv4_mapped": (
                                str(ip.ipv4_mapped)
                                if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped
                                else None
                            ),
                        },
                        ctx=ctx,
                        source_ip=source_ip,
                    )
                return False

        return True
    except Exception as e:
        if SSRF_LOG_ENABLED and SSRF_LOG_ATTEMPTS:
            log_security_event(
                SSRF_ATTEMPT_BLOCKED,
                severity="medium",
                details={"url": url, "error": str(e)},
                ctx=ctx,
                source_ip=source_ip,
            )
        return False


def _extract_pgdsn_host(url: str) -> Optional[str]:
    """Extract the hostname from a Postgres DSN/URL for SSRF validation.

    Handles the two DSN shapes asyncpg accepts:
      - URL-style:   ``postgresql://user:pass@host:5432/db``
      - key=value:   ``host=db.example.com port=5432 user=admin``

    Returns the bare hostname (no credentials/port) so it can be SSRF-checked
    via the synthetic ``https://{host}/`` form without leaking the password
    that would be embedded in a URL-style DSN. Returns ``None`` when no host
    can be parsed.
    """
    if not url:
        return None
    try:
        lowered = url.lower()
        # URL-style DSN — urlparse strips userinfo (password) from .hostname.
        if "://" in url and ("postgres://" in lowered or "postgresql://" in lowered):
            host = urllib.parse.urlparse(url).hostname
            return host or None

        # libpq key=value DSN — pick the first host= token.
        if "host=" in lowered:
            for part in url.split():
                if part.lower().startswith("host="):
                    host = part.split("=", 1)[1].strip().strip("'\"")
                    return host or None
    except Exception:
        return None
    return None


# =============================================================================
# Helpers: provider_config redaction + Cloudflare credential resolution
# =============================================================================

# Substrings that mark a provider_config key as secret — never echoed to clients.
_SENSITIVE_CONFIG_HINTS = ("token", "secret", "password", "credential", "key", "value")


def _redact_provider_config(raw: Any) -> Optional[Dict[str, Any]]:
    """Parse + redact a provider_config blob for safe return to the client.

    Drops any key whose name hints at a secret (token/secret/password/...).
    Returns None when there is nothing to surface.
    """
    if not raw:
        return None
    try:
        cfg = json.loads(str(raw)) if isinstance(raw, str) else dict(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(cfg, dict) or not cfg:
        return None
    redacted = {
        k: v for k, v in cfg.items()
        if not any(h in str(k).lower() for h in _SENSITIVE_CONFIG_HINTS)
    }
    return redacted or None


def _resolve_cf_vectorize_creds(
    db: object | None,
    token: Optional[str],
    provider_account_id: Optional[str],
    provider_config: Optional[Dict[str, Any]],
) -> tuple[Optional[str], Optional[str]]:
    """Resolve (api_token, account_id) for a Cloudflare Vectorize connection.

    Precedence: explicit vector_token → provider_config.cf_account_id, then fall
    back to the linked Connected Account for whatever is still missing.
    """
    api_token = token or None
    account_id = None
    if provider_config:
        account_id = provider_config.get("cf_account_id") or None

    if (not api_token or not account_id) and provider_account_id and db:
        try:
            creds = get_provider_creds(str(provider_account_id), db)  # type: ignore[arg-type]
            if not api_token:
                api_token = creds.get("api_token") or creds.get("access_token")
            if not account_id:
                account_id = creds.get("account_id") or creds.get("cf_account_id")
        except Exception as e:
            log_security_event(
                CREDENTIAL_RESOLUTION_FAILED,
                severity="medium",
                details={"provider": "cloudflare_vectorize", "error": str(e)},
            )
    return api_token, account_id


# =============================================================================
# Provider connection testers
# =============================================================================

async def _test_cloudflare_vectorize(
    index_name: str,
    api_token: Optional[str],
    account_id: Optional[str],
    ctx: Optional[object] = None,
) -> dict:
    """Verify a Cloudflare Vectorize index exists and the token can read it."""
    index_name = (index_name or "").strip()
    if not index_name:
        return {"success": False, "message": "Missing Vectorize index name.", "error_code": "INVALID_CONFIG"}
    if not api_token:
        log_security_event(
            VECTOR_AUTH_FAILED, severity="high",
            details={"provider": "cloudflare_vectorize", "reason": "no_api_token"}, ctx=ctx,
        )
        return {
            "success": False,
            "message": "No Cloudflare API token. Link a Cloudflare Connected Account or enter credentials.",
            "error_code": "AUTH_FAILED",
        }

    headers = {"Authorization": f"Bearer {api_token}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Resolve account ID by listing accounts when not supplied.
            accounts: List[Dict[str, Any]] = []
            if account_id:
                accounts = [{"id": str(account_id)}]
            else:
                acct_resp = await client.get(
                    "https://api.cloudflare.com/client/v4/accounts", headers=headers
                )
                if acct_resp.status_code in (401, 403):
                    log_security_event(
                        VECTOR_AUTH_FAILED, severity="high",
                        details={"provider": "cloudflare_vectorize", "reason": "bad_token"}, ctx=ctx,
                    )
                    return {"success": False, "message": "Cloudflare authentication failed: invalid API token.", "error_code": "AUTH_FAILED"}
                if not acct_resp.is_success:
                    return {"success": False, "message": f"Cloudflare API error (HTTP {acct_resp.status_code}).", "error_code": "PROVIDER_ERROR"}
                accounts = acct_resp.json().get("result", []) or []
                if not accounts:
                    return {"success": False, "message": "No Cloudflare accounts accessible with this token.", "error_code": "NO_ACCOUNT"}

            last_status: Optional[int] = None
            for acct in accounts:
                acct_id = acct.get("id")
                resp = await client.get(
                    f"https://api.cloudflare.com/client/v4/accounts/{acct_id}/vectorize/v2/indexes/{index_name}",
                    headers=headers,
                )
                if resp.status_code == 200:
                    result = (resp.json().get("result") or {})
                    cfg = result.get("config") or {}
                    dims = cfg.get("dimensions", "unknown")
                    metric = cfg.get("metric", "unknown")
                    return {
                        "success": True,
                        "message": f"Connected to Vectorize index '{index_name}' (dimensions: {dims}, metric: {metric}).",
                    }
                if resp.status_code in (401, 403):
                    return {"success": False, "message": "Cloudflare token lacks Vectorize read access.", "error_code": "AUTH_FAILED"}
                last_status = resp.status_code

            if last_status == 404:
                return {"success": False, "message": f"Vectorize index '{index_name}' not found.", "error_code": "NOT_FOUND"}
            return {"success": False, "message": f"Cloudflare API error (HTTP {last_status}).", "error_code": "PROVIDER_ERROR"}
    except httpx.TimeoutException:
        return {"success": False, "message": "Connection timeout: Cloudflare API did not respond.", "error_code": "TIMEOUT"}
    except Exception as e:
        log_security_event(
            VECTOR_CONNECTION_FAILED, severity="medium",
            details={"provider": "cloudflare_vectorize", "error": str(e)}, ctx=ctx,
        )
        return {"success": False, "message": f"Connection failed: {e}", "error_code": "CONNECTION_ERROR"}


async def _test_turso_vector(
    url: str,
    token: Optional[str],
    provider_account_id: Optional[str],
    db: object | None = None,
    ctx: Optional[object] = None,
) -> dict:
    """Verify a Turso (libsql) database is reachable and the token is valid."""
    raw_url = (url or "").strip()
    if not raw_url:
        return {"success": False, "message": "Missing Turso database URL.", "error_code": "INVALID_CONFIG"}

    # Resolve token from the linked Connected Account when not supplied inline.
    if not token and provider_account_id and db:
        try:
            creds = get_provider_creds(str(provider_account_id), db)  # type: ignore[arg-type]
            token = creds.get("db_token") or creds.get("api_token") or token
        except Exception as e:
            log_security_event(
                CREDENTIAL_RESOLUTION_FAILED, severity="medium",
                details={"provider": "turso_vector", "error": str(e)}, ctx=ctx,
            )
    if not token:
        log_security_event(
            VECTOR_AUTH_FAILED, severity="high",
            details={"provider": "turso_vector", "reason": "no_token"}, ctx=ctx,
        )
        return {
            "success": False,
            "message": "No Turso credentials. Link a Turso Connected Account to authorize access.",
            "error_code": "AUTH_FAILED",
        }

    api_url = raw_url.replace("libsql://", "https://")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # libsql-server (Turso) HTTP API: array of SQL strings over the root endpoint.
            resp = await client.post(api_url, json={"statements": ["SELECT 1"]}, headers=headers)
            if resp.status_code in (401, 403):
                return {"success": False, "message": "Turso authentication failed: invalid token.", "error_code": "AUTH_FAILED"}
            if resp.status_code == 404:
                return {"success": False, "message": "Turso database not found: check the database URL.", "error_code": "NOT_FOUND"}
            if not resp.is_success:
                return {"success": False, "message": f"Turso API error (HTTP {resp.status_code}).", "error_code": "PROVIDER_ERROR"}
            return {"success": True, "message": "Connected to Turso database. Vector tables are created on first use."}
    except httpx.TimeoutException:
        return {"success": False, "message": "Connection timeout: Turso did not respond.", "error_code": "TIMEOUT"}
    except Exception as e:
        log_security_event(
            VECTOR_CONNECTION_FAILED, severity="medium",
            details={"provider": "turso_vector", "error": str(e)}, ctx=ctx,
        )
        return {"success": False, "message": f"Connection failed: {e}", "error_code": "CONNECTION_ERROR"}


async def test_vector_connection_raw(
    provider: str,
    url: str,
    token: Optional[str] = None,
    provider_account_id: Optional[str] = None,
    provider_config: Optional[Dict[str, Any]] = None,
    db: object | None = None,
    ctx: Optional[object] = None,
) -> dict:
    """Test connection to a vector database with SSRF validation.

    Dispatches to a provider-specific tester and returns a dict with
    ``success``, ``message`` and (on failure) ``error_code``.
    """
    provider_lower = (provider or "").lower()
    url_lower = (url or "").lower()

    # Self-hosted embedded LanceDB — local path only, never dialed out.
    if provider_lower == "embedded_lancedb":
        if not url_lower.startswith("/app/data/") and not url_lower.startswith("./data/"):
            return {
                "success": False,
                "message": "Embedded LanceDB path must be under /app/data/ or ./data/ (self-hosted only)",
                "error_code": "INVALID_CONFIG",
            }
        return {"success": True, "message": "Local LanceDB path validated."}

    # SSRF protection: restrict URL schemes to a known-safe allowlist.
    if not url_lower.startswith(ALLOWED_URL_SCHEMES):
        return {
            "success": False,
            "message": f"Invalid URL format: must start with one of {', '.join(ALLOWED_URL_SCHEMES)}",
            "error_code": "INVALID_URL",
        }

    # For dial-out schemes, resolve the host and reject private/metadata IPs.
    if url_lower.startswith(("http://", "https://", "libsql://")):
        if not _is_safe_url(url, ctx=ctx):
            return {
                "success": False,
                "message": "Invalid URL: resolved IP is private or reserved (SSRF protection)",
                "error_code": "SSRF_BLOCKED",
            }

    # ── pgvector / Postgres ──────────────────────────────────────────────
    if provider_lower in ("pgvector", "postgres", "postgres_vector", "supabase", "neon"):
        # SSRF: the DSN host is not covered by the dial-out check above (which
        # only covers http(s)/libsql). Resolve it and reject private/metadata
        # IPs before handing the DSN to asyncpg. The synthetic https://{host}/
        # form keeps any embedded password out of the security-event log.
        pg_host = _extract_pgdsn_host(url)
        if pg_host and not _is_safe_url(f"https://{pg_host}/", ctx=ctx):
            return {
                "success": False,
                "message": "Invalid DSN: resolved IP is private or reserved (SSRF protection)",
                "error_code": "SSRF_BLOCKED",
            }
        if not pg_host:
            return {
                "success": False,
                "message": "Invalid DSN: could not parse a hostname from the connection string.",
                "error_code": "INVALID_CONFIG",
            }
        try:
            import asyncpg
            conn = await asyncpg.connect(url, timeout=5)
            try:
                await conn.execute("SELECT 1")
                has_vector = await conn.fetchval(
                    "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
                )
                if not has_vector:
                    return {
                        "success": False,
                        "message": "Reached the database, but the pgvector extension is not installed. "
                                   "Run 'CREATE EXTENSION vector;' on your database.",
                        "error_code": "EXTENSION_MISSING",
                    }
                return {"success": True, "message": "Connected to pgvector database; extension is available."}
            finally:
                await conn.close()
        except Exception:
            # Generic message to avoid leaking topology / credentials.
            return {"success": False, "message": "Connection failed: unable to reach or authenticate with the database.", "error_code": "CONNECTION_ERROR"}

    # ── Cloudflare Vectorize ─────────────────────────────────────────────
    if provider_lower == "cloudflare_vectorize":
        api_token, account_id = _resolve_cf_vectorize_creds(db, token, provider_account_id, provider_config)
        return await _test_cloudflare_vectorize(url, api_token, account_id, ctx)

    # ── Turso Vector ─────────────────────────────────────────────────────
    if provider_lower == "turso_vector":
        return await _test_turso_vector(url, token, provider_account_id, db, ctx)

    # ── Edge Proxy Backends (libsql_vector, embedded_lancedb, etc.) ──────
    if provider_lower in ("libsql_vector", "embedded_lancedb", "embedded_sql_vector", "lancedb"):
        if not db:
            return {"success": False, "message": "Database session required to validate edge proxy backends.", "error_code": "INTERNAL_ERROR"}
        try:
            from app.services.vector import get_vector_backend
            from app.services.vector.edge_proxy_backend import EdgeVectorProxyBackend
            backend = get_vector_backend(provider_lower, db=db)
            if not isinstance(backend, EdgeVectorProxyBackend):
                return {"success": False, "message": "Failed to resolve Edge vector proxy backend.", "error_code": "INTERNAL_ERROR"}
            
            api_url = f"{backend.edge_url}/api/vector/test"
            headers = {"x-system-key": backend.system_key}
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(api_url, headers=headers)
                if resp.status_code in (401, 403):
                    return {"success": False, "message": "Edge engine authentication failed: invalid system key.", "error_code": "AUTH_FAILED"}
                if not resp.is_success:
                    return {"success": False, "message": f"Edge engine returned HTTP {resp.status_code}.", "error_code": "PROVIDER_ERROR"}
                
                return {"success": True, "message": f"Connected to local edge vector store ({provider})."}
        except ValueError as e:
            return {"success": False, "message": f"Edge engine resolution failed: {e}", "error_code": "INVALID_CONFIG"}
        except httpx.TimeoutException:
            return {"success": False, "message": "Connection timeout: Edge engine did not respond.", "error_code": "TIMEOUT"}
        except Exception as e:
            return {"success": False, "message": f"Connection failed: {e}", "error_code": "CONNECTION_ERROR"}

    # Unknown / future providers — accept but flag that validation is a no-op.
    return {
        "success": True,
        "message": f"Provider '{provider}' accepted; connection validation is not yet implemented for this provider.",
        "error_code": "VALIDATION_SKIPPED",
    }


# =============================================================================
# Inline schemas for batch operations / tests
# =============================================================================

class BatchDeleteVectorRequest(BaseModel):
    ids: List[str]
    delete_remote: bool = False

class BatchResult(BaseModel):
    success: List[str] = []
    failed: List[dict] = []
    total: int = 0

class TestConnectionRequest(BaseModel):
    provider: str
    vector_url: str
    vector_token: Optional[str] = None
    provider_account_id: Optional[str] = None
    provider_config: Optional[Dict[str, Any]] = None


# =============================================================================
# Helpers
# =============================================================================

def _query_linked_engines(db, fk_column, resource_id, project_id: Optional[str] = None) -> tuple[int, list[dict]]:
    query = db.query(EdgeEngine).filter(fk_column == resource_id)
    if project_id:
        query = query.filter(EdgeEngine.project_id == project_id)
    engines = query.all()
    linked = [
        {
            "id": str(e.id),
            "name": str(e.name),
            "provider": str(e.edge_provider.provider) if e.edge_provider else "unknown",
        }
        for e in engines
    ]
    return len(linked), linked


def _validate_provider_account_ownership(db, ctx: TenantContext | None, provider_account_id: str | None) -> None:
    if ctx and ctx.tenant_id and provider_account_id:
        project = get_project(db, ctx)
        if not project:
            raise HTTPException(403, "Access denied: tenant project not found")
        acct = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == provider_account_id,
            EdgeProviderAccount.project_id == project.id
        ).first()
        if not acct:
            raise HTTPException(403, "Access denied: provider account not found or does not belong to this tenant")


def _serialize_vector(vector, db, engine_count: int = 0, linked_engines: Optional[list] = None) -> EdgeVectorResponse:
    account_name = None
    if vector.provider_account_id:
        acct = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == vector.provider_account_id
        ).first()
        if acct:
            account_name = str(acct.name)
    from ..services.provider_resource_deleter import supports_remote_delete_for_model
    can_remote_delete = bool(vector.provider_account_id) and supports_remote_delete_for_model(
        "vector", str(vector.provider)
    )
    return EdgeVectorResponse(
        id=str(vector.id),
        name=str(vector.name),
        provider=str(vector.provider),
        vector_url=str(vector.vector_url),
        has_token=bool(vector.vector_token) or bool(vector.provider_account_id),
        is_default=bool(vector.is_default),
        is_system=bool(getattr(vector, 'is_system', False)),
        provider_account_id=str(vector.provider_account_id) if vector.provider_account_id is not None else None,
        account_name=account_name,
        provider_config=_redact_provider_config(getattr(vector, 'provider_config', None)),
        created_at=str(vector.created_at),
        updated_at=str(vector.updated_at),
        engine_count=engine_count,
        linked_engines=linked_engines or [],
        supports_remote_delete=can_remote_delete,
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/", response_model=List[EdgeVectorResponse])
async def list_edge_vectors(ctx: TenantContext | None = Depends(get_tenant_context)):
    """List all configured edge vector stores."""
    db = SessionLocal()
    try:
        query = db.query(EdgeVector)
        project = None
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                query = query.filter(EdgeVector.project_id == project.id)
            else:
                return []

        vectors = query.order_by(EdgeVector.created_at.desc()).all()

        # Pre-fetch engine counts + linked engines to avoid N+1 query
        # We query all engines linked to ANY of these vector stores for this tenant
        vector_ids = [v.id for v in vectors]
        engine_query = db.query(EdgeEngine).filter(EdgeEngine.edge_vector_id.in_(vector_ids))
        if ctx and ctx.tenant_id and project:
            engine_query = engine_query.filter(EdgeEngine.project_id == project.id)

        linked_engines_map = {vid: [] for vid in vector_ids}
        for e in engine_query.all():
            linked_engines_map[e.edge_vector_id].append({
                "id": str(e.id),
                "name": str(e.name),
                "provider": str(e.edge_provider.provider) if getattr(e, 'edge_provider', None) else "unknown",
            })

        result = []
        for vec in vectors:
            linked = linked_engines_map.get(vec.id, [])
            result.append(_serialize_vector(vec, db, len(linked), linked))
        return result
    finally:
        db.close()


@router.post("/", response_model=EdgeVectorResponse, status_code=201)
async def create_edge_vector(payload: EdgeVectorCreate, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Create a new edge vector store connection."""
    db = SessionLocal()
    try:
        _validate_provider_account_ownership(db, ctx, payload.provider_account_id)

        # Prevent duplicate vector URLs
        existing = db.query(EdgeVector).filter(
            EdgeVector.vector_url == payload.vector_url
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail="A vector store with this URL/DSN already exists"
            )

        now = datetime.now(UTC).isoformat() + "Z"

        # If this is the first one, make it default
        count = db.query(EdgeVector).count()
        is_default = payload.is_default or count == 0

        project_id = None
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                project_id = project.id

        # Store only truthy, user-supplied config values. Server-side keys
        # (cf_account_id, scoped tokens, …) are added later by lifecycle hooks.
        cleaned_config = {
            k: v for k, v in (payload.provider_config or {}).items() if v
        } if payload.provider_config else None
        provider_config_json = json.dumps(cleaned_config) if cleaned_config else None

        vector = EdgeVector(
            id=str(uuid.uuid4()),
            name=payload.name,
            provider=payload.provider,
            vector_url=payload.vector_url,
            vector_token=encrypt_field(payload.vector_token),
            provider_account_id=payload.provider_account_id,
            provider_config=provider_config_json,  # type: ignore[assignment]
            is_default=False,  # Start as non-default to avoid race
            created_at=now,
            updated_at=now,
            project_id=project_id,
        )

        db.add(vector)
        db.flush()  # Get the ID without committing

        # If set as default, clear others atomically within transaction
        if is_default:
            clear_query = db.query(EdgeVector).filter(EdgeVector.id != vector.id)
            if project_id is not None:
                clear_query = clear_query.filter(EdgeVector.project_id == project_id)
            clear_query.update({"is_default": False}, synchronize_session=False)
            vector.is_default = True  # type: ignore[assignment]

        db.commit()
        db.refresh(vector)

        return _serialize_vector(vector, db, 0)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.put("/{vector_id}", response_model=EdgeVectorResponse)
async def update_edge_vector(vector_id: str, payload: EdgeVectorUpdate, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Update an existing edge vector store connection."""
    db = SessionLocal()
    try:
        query = db.query(EdgeVector).filter(EdgeVector.id == vector_id)
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                query = query.filter(EdgeVector.project_id == project.id)
            else:
                raise HTTPException(404, "Vector store not found")

        vector = query.first()
        if not vector:
            raise HTTPException(404, "Vector store not found")

        if payload.provider_account_id is not None:
            _validate_provider_account_ownership(db, ctx, payload.provider_account_id)

        if payload.name is not None:
            vector.name = payload.name  # type: ignore[assignment]
        if payload.provider is not None:
            vector.provider = payload.provider  # type: ignore[assignment]
        if payload.vector_url is not None:
            vector.vector_url = payload.vector_url  # type: ignore[assignment]
        if payload.vector_token is not None:
            vector.vector_token = encrypt_field(payload.vector_token)  # type: ignore[assignment]
        if payload.provider_account_id is not None:
            vector.provider_account_id = payload.provider_account_id  # type: ignore[assignment]
        if payload.provider_config is not None:
            # Merge user-supplied config over existing, preserving server-managed
            # keys (cf_account_id, scoped tokens, …) the redacted client can't see.
            # Truthy values set/update a key; empty values clear it.
            # An empty dict {} explicitly clears all user-visible config keys.
            existing_cfg: Dict[str, Any] = {}
            if vector.provider_config:
                try:
                    existing_cfg = json.loads(str(vector.provider_config)) or {}
                except (json.JSONDecodeError, TypeError):
                    existing_cfg = {}

            # Empty dict {} means clear all user-visible config
            if len(payload.provider_config) == 0:
                # Keep only server-managed keys (those with sensitive-sounding names)
                # that the client can't see in the redacted response
                server_managed = {
                    k: v for k, v in existing_cfg.items()
                    if any(h in str(k).lower() for h in _SENSITIVE_CONFIG_HINTS)
                }
                vector.provider_config = json.dumps(server_managed) if server_managed else None  # type: ignore[assignment]
            else:
                # Merge: apply user updates, preserving server-managed keys
                for k, v in payload.provider_config.items():
                    if v:
                        existing_cfg[k] = v
                    else:
                        existing_cfg.pop(k, None)
                vector.provider_config = json.dumps(existing_cfg) if existing_cfg else None  # type: ignore[assignment]
        if payload.is_default is not None:
            if payload.is_default:
                # Clear other defaults atomically within transaction
                clear_query = db.query(EdgeVector).filter(EdgeVector.id != vector_id)
                if vector.project_id is not None:
                    clear_query = clear_query.filter(EdgeVector.project_id == vector.project_id)
                clear_query.update({"is_default": False}, synchronize_session=False)
            vector.is_default = payload.is_default  # type: ignore[assignment]

        vector.updated_at = datetime.now(UTC).isoformat() + "Z"  # type: ignore[assignment]
        db.commit()
        db.refresh(vector)

        engine_count, linked = _query_linked_engines(db, EdgeEngine.edge_vector_id, vector_id)

        return _serialize_vector(vector, db, engine_count, linked)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.delete("/{vector_id}")
async def delete_edge_vector(vector_id: str, delete_remote: bool = False, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Delete an edge vector store connection.

    If delete_remote=True and the store was created from a Connected Account,
    also delete the resource at the provider (e.g. CF Vectorize index).
    """
    db = SessionLocal()
    try:
        query = db.query(EdgeVector).filter(EdgeVector.id == vector_id)
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                query = query.filter(EdgeVector.project_id == project.id)
            else:
                raise HTTPException(404, "Vector store not found")

        vector = query.first()
        if not vector:
            raise HTTPException(404, "Vector store not found")

        if getattr(vector, 'is_system', False):
            raise HTTPException(403, "System vector stores cannot be deleted")

        # Check for referencing engines (scoped to tenant's project for isolation)
        engine_query = db.query(EdgeEngine).filter(EdgeEngine.edge_vector_id == vector_id)
        if project:
            engine_query = engine_query.filter(EdgeEngine.project_id == project.id)
        engines = engine_query.all()
        if engines:
            names = ", ".join([f"'{e.name}'" for e in engines])
            raise HTTPException(
                status_code=409,
                detail=f"Cannot delete vector store: still in use by edge engines {names}. "
                       f"Reconfigure or detach them first."
            )

        remote_deleted = False
        vector_provider = str(vector.provider)

        # Remote resource delete via unified service
        if delete_remote and getattr(vector, 'provider_account_id', None):
            from ..services.provider_resource_deleter import delete_resource_for_edge_model
            remote_deleted = await delete_resource_for_edge_model(
                model_kind="vector",
                provider=vector_provider,
                resource_url=str(vector.vector_url),
                provider_config_json=str(vector.provider_config) if vector.provider_config is not None else None,
                provider_account_id=str(vector.provider_account_id),
                db_session=db,
            )

        vector_name = str(vector.name)
        db.delete(vector)
        db.commit()

        msg = f"Vector store '{vector_name}' deleted"
        if remote_deleted:
            msg += f" (also removed from {vector_provider})"
        return {"success": True, "id": vector_id, "message": msg, "remote_deleted": remote_deleted}
    finally:
        db.close()


@router.post("/{vector_id}/test")
async def test_edge_vector_connection(vector_id: str, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Test connection to an existing edge vector store."""
    db = SessionLocal()
    try:
        query = db.query(EdgeVector).filter(EdgeVector.id == vector_id)
        if ctx and ctx.tenant_id:
            project = get_project(db, ctx)
            if project:
                query = query.filter(EdgeVector.project_id == project.id)
            else:
                raise HTTPException(404, "Vector store not found")

        vector = query.first()
        if not vector:
            raise HTTPException(404, "Vector store not found")

        decrypted_token = decrypt_field(str(vector.vector_token)) if vector.vector_token is not None else None
        provider_config = None
        if vector.provider_config is not None:
            try:
                provider_config = json.loads(str(vector.provider_config))
            except (json.JSONDecodeError, TypeError):
                provider_config = None

        return await test_vector_connection_raw(
            provider=str(vector.provider),
            url=str(vector.vector_url),
            token=decrypted_token,
            provider_account_id=str(vector.provider_account_id) if vector.provider_account_id is not None else None,
            provider_config=provider_config,
            db=db,
            ctx=ctx,
        )
    finally:
        db.close()


@router.post("/test-connection")
async def test_connection_inline(payload: TestConnectionRequest, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Test connection using raw fields (pre-save)."""
    db = SessionLocal()
    try:
        _validate_provider_account_ownership(db, ctx, payload.provider_account_id)
        return await test_vector_connection_raw(
            provider=payload.provider,
            url=payload.vector_url,
            token=payload.vector_token,
            provider_account_id=payload.provider_account_id,
            provider_config=payload.provider_config,
            db=db,
            ctx=ctx,
        )
    finally:
        db.close()


@router.post("/batch/delete", response_model=BatchResult)
async def batch_delete_vectors(payload: BatchDeleteVectorRequest, ctx: TenantContext | None = Depends(get_tenant_context)):
    """Batch delete multiple edge vector stores."""
    import asyncio
    db = SessionLocal()
    success = []
    failed = []
    project = None
    try:
        records_to_delete: list[EdgeVector] = []
        for vid in payload.ids:
            query = db.query(EdgeVector).filter(EdgeVector.id == vid)
            if ctx and ctx.tenant_id:
                project = get_project(db, ctx) or project
                if project:
                    query = query.filter(EdgeVector.project_id == project.id)
                else:
                    query = query.filter(EdgeVector.id == "not-found")
            vector = query.first()
            if not vector:
                failed.append({"id": vid, "error": "Not found"})
                continue

            if getattr(vector, 'is_system', False):
                failed.append({"id": vid, "error": "Cannot delete system vector store"})
                continue

            engine_query = db.query(EdgeEngine).filter(EdgeEngine.edge_vector_id == vid)
            if ctx and ctx.tenant_id and project:
                engine_query = engine_query.filter(EdgeEngine.project_id == project.id)
            if engine_query.count() > 0:
                failed.append({"id": vid, "error": "In use by edge engine(s)"})
                continue

            records_to_delete.append(vector)

        if payload.delete_remote:
            async def _safe_delete(rec: EdgeVector) -> None:
                try:
                    if getattr(rec, 'provider_account_id', None):
                        from ..services.provider_resource_deleter import delete_resource_for_edge_model
                        await delete_resource_for_edge_model(
                            model_kind="vector",
                            provider=str(rec.provider),
                            resource_url=str(rec.vector_url),
                            provider_config_json=str(rec.provider_config) if rec.provider_config is not None else None,
                            provider_account_id=str(rec.provider_account_id),
                            db_session=db,
                        )
                except Exception as e:
                    failed.append({"id": str(rec.id), "error": f"Remote delete failed: {e}"})
            await asyncio.gather(*[_safe_delete(rec) for rec in records_to_delete])

        for rec in records_to_delete:
            rid = str(rec.id)
            if any(f.get("id") == rid for f in failed):
                continue
            try:
                db.delete(rec)
                success.append(rid)
            except Exception as e:
                failed.append({"id": rid, "error": str(e)})

        db.commit()
        return BatchResult(success=success, failed=failed, total=len(payload.ids))
    finally:
        db.close()
