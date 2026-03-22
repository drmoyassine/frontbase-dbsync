"""
Domain Manager — Multi-provider custom domain management.

Registry-dispatched service for listing, adding, deleting, and verifying
custom domains across all edge providers.

Mirrors the provider_discovery.py and engine_lister.py patterns:
  - Unified public API: list_domains(), add_domain(), delete_domain(), verify_domain()
  - Per-provider implementations: _cf_*, _vercel_*, _netlify_*, _deno_*
  - Registry dict maps provider_type → implementation functions

Provider API Reference:
  - Cloudflare: PUT /zones/{zone_id}/workers/domains (Workers Custom Domains)
  - Vercel:     POST /v10/projects/{id}/domains
  - Netlify:    POST /api/v1/sites/{site_id}/ssl + domain aliases
  - Deno:       Dashboard-managed domains with health-check verification
  - Supabase:   Not supported for Edge Functions
"""

import json
from dataclasses import dataclass, asdict
from typing import Any, Optional

from sqlalchemy.orm import Session

import httpx

from ..models.models import EdgeEngine


# =============================================================================
# Domain Data Model
# =============================================================================

@dataclass
class DomainInfo:
    """Unified domain record returned by all providers."""
    id: str                       # Provider-specific domain ID
    domain: str                   # e.g. "app.example.com"
    status: str                   # "active", "pending", "error"
    ssl_status: str = ""          # "active", "pending", "none"
    verification_type: str = ""   # "cname", "txt", "http"
    verification_value: str = ""  # DNS record value needed
    dns_target: str = ""          # What to point CNAME/A to
    dns_records: list | None = None  # Provider-specific DNS records [{type, name, content}]
    provider: str = ""            # "cloudflare", "vercel", etc.
    created_at: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DomainResult:
    """Result wrapper for domain operations."""
    success: bool
    domains: list[dict] | None = None   # For list operations
    domain: dict | None = None          # For single-domain operations
    detail: str = ""                    # Error/info message

    def to_dict(self) -> dict:
        return asdict(self)


# =============================================================================
# Public API (dispatchers)
# =============================================================================

async def list_domains(engine: EdgeEngine, creds: dict, provider_type: str, db: Optional[Session] = None) -> DomainResult:
    """List custom domains for an engine."""
    handler = _LIST_HANDLERS.get(provider_type)
    if not handler:
        return DomainResult(success=False, detail=f"Domain management not supported for {provider_type}")
    return await handler(engine, creds, db=db)


async def add_domain(engine: EdgeEngine, creds: dict, provider_type: str, domain: str, db: Optional[Session] = None) -> DomainResult:
    """Add a custom domain to an engine."""
    handler = _ADD_HANDLERS.get(provider_type)
    if not handler:
        return DomainResult(success=False, detail=f"Domain management not supported for {provider_type}")
    return await handler(engine, creds, domain, db=db)


async def delete_domain(engine: EdgeEngine, creds: dict, provider_type: str, domain_id: str, db: Optional[Session] = None) -> DomainResult:
    """Remove a custom domain from an engine."""
    handler = _DELETE_HANDLERS.get(provider_type)
    if not handler:
        return DomainResult(success=False, detail=f"Domain management not supported for {provider_type}")
    return await handler(engine, creds, domain_id, db=db)


async def verify_domain(engine: EdgeEngine, creds: dict, provider_type: str, domain_id: str, db: Optional[Session] = None) -> DomainResult:
    """Trigger verification (or health check) for a custom domain."""
    handler = _VERIFY_HANDLERS.get(provider_type)
    if not handler:
        return DomainResult(success=False, detail=f"Domain verification not supported for {provider_type}")
    return await handler(engine, creds, domain_id, db=db)


# =============================================================================
# Helpers
# =============================================================================

def _get_engine_name(engine: EdgeEngine) -> str:
    """Extract the worker/project name from engine_config JSON."""
    try:
        cfg = json.loads(str(engine.engine_config)) if engine.engine_config else {}
    except (json.JSONDecodeError, TypeError):
        cfg = {}
    # Try all known config keys
    return (cfg.get("worker_name") or cfg.get("project_name") or
            cfg.get("function_name") or cfg.get("site_name") or
            cfg.get("resource_name") or "")


def _save_custom_domain(engine: EdgeEngine, domain: str, db: Optional[Session]) -> None:
    """Persist custom_domain to engine_config and update engine.url.
    
    Saves the original URL for restoration on delete.
    """
    engine_cfg = json.loads(str(engine.engine_config or '{}'))
    engine_cfg["custom_domain"] = domain
    if "original_url" not in engine_cfg and engine.url:
        engine_cfg["original_url"] = str(engine.url)
    engine.engine_config = json.dumps(engine_cfg)  # type: ignore[assignment]
    engine.url = f"https://{domain}"  # type: ignore[assignment]
    if db:
        db.commit()
        print(f"[Domains] Custom domain saved: {domain} for engine {engine.name}")


def _remove_custom_domain(engine: EdgeEngine, db: Optional[Session]) -> None:
    """Remove custom_domain from engine_config and restore original URL."""
    engine_cfg = json.loads(str(engine.engine_config or '{}'))
    if "custom_domain" not in engine_cfg:
        return
    original_url = engine_cfg.pop("original_url", None)
    del engine_cfg["custom_domain"]
    engine.engine_config = json.dumps(engine_cfg)  # type: ignore[assignment]
    if original_url:
        engine.url = original_url  # type: ignore[assignment]
    if db:
        db.commit()
        print(f"[Domains] Custom domain removed for engine {engine.name}")


# =============================================================================
# Cloudflare — Workers Custom Domains
# =============================================================================

CF_API = "https://api.cloudflare.com/client/v4"


async def _cf_list(engine: EdgeEngine, creds: dict, **kwargs: Any) -> DomainResult:
    """List Cloudflare Workers custom domains."""
    token = creds.get("api_token", "")
    account_id = creds.get("account_id", "")
    worker_name = _get_engine_name(engine)
    if not all([token, account_id, worker_name]):
        return DomainResult(success=False, detail="Missing CF credentials or worker name")

    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{CF_API}/accounts/{account_id}/workers/domains",
            headers=headers,
            params={"service": worker_name, "environment": "production"},
        )
    if resp.status_code != 200:
        return DomainResult(success=False, detail=f"CF API error: {resp.status_code}")

    data = resp.json().get("result", [])
    domains = [DomainInfo(
        id=d.get("id", ""),
        domain=d.get("hostname", ""),
        status="active" if d.get("hostname") else "pending",
        ssl_status="active",  # CF auto-manages SSL
        provider="cloudflare",
    ).to_dict() for d in data]

    return DomainResult(success=True, domains=domains)


async def _cf_add(engine: EdgeEngine, creds: dict, domain: str, **kwargs: Any) -> DomainResult:
    """Add a custom domain to a Cloudflare Worker."""
    token = creds.get("api_token", "")
    account_id = creds.get("account_id", "")
    worker_name = _get_engine_name(engine)
    if not all([token, account_id, worker_name]):
        return DomainResult(success=False, detail="Missing CF credentials or worker name")

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        # CF Workers Custom Domains use PUT
        resp = await client.put(
            f"{CF_API}/accounts/{account_id}/workers/domains",
            headers=headers,
            json={
                "hostname": domain,
                "service": worker_name,
                "environment": "production",
            },
        )
    if resp.status_code not in (200, 201):
        err = resp.json().get("errors", [{}])
        msg = err[0].get("message", resp.text[:200]) if err else resp.text[:200]
        return DomainResult(success=False, detail=f"CF API error: {msg}")

    d = resp.json().get("result", {})
    domain_name = d.get("hostname", domain)
    # CF domains are active immediately — save as custom domain
    db: Optional[Session] = kwargs.get("db")
    _save_custom_domain(engine, domain_name, db)
    return DomainResult(success=True, domain=DomainInfo(
        id=d.get("id", ""),
        domain=domain_name,
        status="active",
        ssl_status="active",
        dns_target=f"{worker_name}.workers.dev",
        provider="cloudflare",
    ).to_dict())


async def _cf_delete(engine: EdgeEngine, creds: dict, domain_id: str, **kwargs: Any) -> DomainResult:
    """Remove a custom domain from a Cloudflare Worker."""
    token = creds.get("api_token", "")
    account_id = creds.get("account_id", "")
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.delete(
            f"{CF_API}/accounts/{account_id}/workers/domains/{domain_id}",
            headers=headers,
        )
    if resp.status_code not in (200, 204):
        return DomainResult(success=False, detail=f"CF API error: {resp.status_code}")
    db: Optional[Session] = kwargs.get("db")
    _remove_custom_domain(engine, db)
    return DomainResult(success=True, detail="Domain removed")


async def _cf_verify(engine: EdgeEngine, creds: dict, domain_id: str, **kwargs: Any) -> DomainResult:
    """CF domains are auto-verified via DNS."""
    return DomainResult(success=True, detail="Cloudflare auto-verifies domains via DNS. No manual verification needed.")


# =============================================================================
# Vercel — Project Domains
# =============================================================================

VERCEL_API = "https://api.vercel.com"


async def _vercel_list(engine: EdgeEngine, creds: dict, **kwargs: Any) -> DomainResult:
    """List Vercel project domains."""
    token = creds.get("api_token", "")
    team_id = creds.get("team_id")
    project_name = _get_engine_name(engine)
    if not all([token, project_name]):
        return DomainResult(success=False, detail="Missing Vercel credentials or project name")

    headers = {"Authorization": f"Bearer {token}"}
    params: dict[str, Any] = {}
    if team_id:
        params["teamId"] = team_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{VERCEL_API}/v9/projects/{project_name}/domains",
            headers=headers, params=params,
        )
    if resp.status_code != 200:
        return DomainResult(success=False, detail=f"Vercel API error: {resp.status_code}")

    data = resp.json().get("domains", [])
    domains = [DomainInfo(
        id=d.get("name", ""),  # Vercel uses domain name as ID
        domain=d.get("name", ""),
        status="active" if d.get("verified") else "pending",
        ssl_status="active" if d.get("verified") else "pending",
        verification_type=d.get("verification", [{}])[0].get("type", "") if d.get("verification") else "",
        verification_value=d.get("verification", [{}])[0].get("value", "") if d.get("verification") else "",
        dns_target="cname.vercel-dns.com",
        provider="vercel",
    ).to_dict() for d in data]

    return DomainResult(success=True, domains=domains)


async def _vercel_add(engine: EdgeEngine, creds: dict, domain: str, **kwargs: Any) -> DomainResult:
    """Add a custom domain to a Vercel project."""
    token = creds.get("api_token", "")
    team_id = creds.get("team_id")
    project_name = _get_engine_name(engine)
    if not all([token, project_name]):
        return DomainResult(success=False, detail="Missing Vercel credentials or project name")

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    params: dict[str, Any] = {}
    if team_id:
        params["teamId"] = team_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{VERCEL_API}/v10/projects/{project_name}/domains",
            headers=headers, params=params,
            json={"name": domain},
        )
    if resp.status_code not in (200, 201):
        err = resp.json().get("error", {}).get("message", resp.text[:200])
        return DomainResult(success=False, detail=f"Vercel API error: {err}")

    d = resp.json()
    return DomainResult(success=True, domain=DomainInfo(
        id=d.get("name", domain),
        domain=d.get("name", domain),
        status="pending",
        dns_target="cname.vercel-dns.com",
        provider="vercel",
    ).to_dict())


async def _vercel_delete(engine: EdgeEngine, creds: dict, domain_id: str, **kwargs: Any) -> DomainResult:
    """Remove a custom domain from a Vercel project."""
    token = creds.get("api_token", "")
    team_id = creds.get("team_id")
    project_name = _get_engine_name(engine)
    headers = {"Authorization": f"Bearer {token}"}
    params: dict[str, Any] = {}
    if team_id:
        params["teamId"] = team_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.delete(
            f"{VERCEL_API}/v9/projects/{project_name}/domains/{domain_id}",
            headers=headers, params=params,
        )
    if resp.status_code not in (200, 204):
        return DomainResult(success=False, detail=f"Vercel API error: {resp.status_code}")
    db: Optional[Session] = kwargs.get("db")
    _remove_custom_domain(engine, db)
    return DomainResult(success=True, detail="Domain removed")


async def _vercel_verify(engine: EdgeEngine, creds: dict, domain_id: str, **kwargs: Any) -> DomainResult:
    """Trigger domain verification for a Vercel project."""
    token = creds.get("api_token", "")
    team_id = creds.get("team_id")
    project_name = _get_engine_name(engine)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    params: dict[str, Any] = {}
    if team_id:
        params["teamId"] = team_id

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{VERCEL_API}/v9/projects/{project_name}/domains/{domain_id}/verify",
            headers=headers, params=params,
        )
    if resp.status_code != 200:
        return DomainResult(success=False, detail=f"Vercel API error: {resp.status_code}")
    d = resp.json()
    domain_name = d.get("name", domain_id)
    is_active = d.get("verified", False)
    if is_active:
        # Domain verified — save as custom domain
        db: Optional[Session] = kwargs.get("db")
        _save_custom_domain(engine, domain_name, db)
    return DomainResult(success=True, domain=DomainInfo(
        id=domain_name,
        domain=domain_name,
        status="active" if is_active else "pending",
        provider="vercel",
    ).to_dict())


# =============================================================================
# Netlify — Site Domain Aliases
# =============================================================================

NETLIFY_API = "https://api.netlify.com/api/v1"


async def _netlify_list(engine: EdgeEngine, creds: dict, **kwargs: Any) -> DomainResult:
    """List Netlify site domain aliases."""
    token = creds.get("api_token", "")
    site_name = _get_engine_name(engine)
    if not all([token, site_name]):
        return DomainResult(success=False, detail="Missing Netlify credentials or site name")

    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{NETLIFY_API}/sites/{site_name}.netlify.app",
            headers=headers,
        )
    if resp.status_code != 200:
        return DomainResult(success=False, detail=f"Netlify API error: {resp.status_code}")

    site = resp.json()
    custom_domain = site.get("custom_domain", "")
    aliases = site.get("domain_aliases", []) or []
    all_domains = ([custom_domain] if custom_domain else []) + aliases

    domains = [DomainInfo(
        id=d,  # Netlify uses domain name as ID
        domain=d,
        status="active" if site.get("ssl") else "pending",
        ssl_status="active" if site.get("ssl", {}).get("state") == "provisioned" else "pending",
        dns_target=f"{site_name}.netlify.app",
        provider="netlify",
    ).to_dict() for d in all_domains if d]

    return DomainResult(success=True, domains=domains)


async def _netlify_add(engine: EdgeEngine, creds: dict, domain: str, **kwargs: Any) -> DomainResult:
    """Add a custom domain to a Netlify site."""
    token = creds.get("api_token", "")
    site_name = _get_engine_name(engine)
    if not all([token, site_name]):
        return DomainResult(success=False, detail="Missing Netlify credentials or site name")

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Set as custom_domain via PATCH
        resp = await client.patch(
            f"{NETLIFY_API}/sites/{site_name}.netlify.app",
            headers=headers,
            json={"custom_domain": domain},
        )
    if resp.status_code != 200:
        return DomainResult(success=False, detail=f"Netlify API error: {resp.status_code}")

    return DomainResult(success=True, domain=DomainInfo(
        id=domain,
        domain=domain,
        status="pending",
        dns_target=f"{site_name}.netlify.app",
        provider="netlify",
    ).to_dict())


async def _netlify_delete(engine: EdgeEngine, creds: dict, domain_id: str, **kwargs: Any) -> DomainResult:
    """Remove a custom domain from a Netlify site."""
    token = creds.get("api_token", "")
    site_name = _get_engine_name(engine)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Clear custom_domain by setting to null
        resp = await client.patch(
            f"{NETLIFY_API}/sites/{site_name}.netlify.app",
            headers=headers,
            json={"custom_domain": None},
        )
    if resp.status_code != 200:
        return DomainResult(success=False, detail=f"Netlify API error: {resp.status_code}")
    db: Optional[Session] = kwargs.get("db")
    _remove_custom_domain(engine, db)
    return DomainResult(success=True, detail="Domain removed")


async def _netlify_verify(engine: EdgeEngine, creds: dict, domain_id: str, **kwargs: Any) -> DomainResult:
    """Netlify auto-verifies domains."""
    return DomainResult(success=True, detail="Netlify auto-verifies domains after DNS propagation.")


# =============================================================================
# Deno Deploy — Dashboard-managed domains with health-check verification
#
# Flow:
#   1. User enters domain in Frontbase (ephemeral — no API call)
#   2. Banner shows instructions to configure on console.deno.com
#   3. User does everything on Deno console (add domain, DNS, verify, TLS)
#   4. User clicks "Test" in Frontbase → health check on custom domain
#   5. Health check passes → domain saved to engine_config.custom_domain
#   6. custom_domain replaces the engine Endpoint URL
# =============================================================================


async def _deno_list(engine: EdgeEngine, creds: dict, **kwargs: Any) -> DomainResult:
    """Return the saved custom domain from engine_config, if any."""
    engine_cfg = json.loads(str(engine.engine_config or '{}'))
    custom = engine_cfg.get("custom_domain")
    if not custom:
        return DomainResult(success=True, domains=[])

    return DomainResult(success=True, domains=[DomainInfo(
        id="custom",
        domain=custom,
        status="active",
        ssl_status="active",
        provider="deno",
    ).to_dict()])


async def _deno_add(engine: EdgeEngine, creds: dict, domain: str, **kwargs: Any) -> DomainResult:
    """Ephemeral add — just return the domain with 'pending' status + instructions.
    
    No API call. The domain is NOT persisted yet — the user must configure
    it on the Deno console and then click 'Test' to health-check and save.
    """
    return DomainResult(
        success=True,
        domain=DomainInfo(
            id=domain,  # Use domain name as ephemeral ID
            domain=domain,
            status="pending",
            provider="deno",
        ).to_dict(),
        detail="Configure this domain on the Deno console, then click Test to verify.",
    )


async def _deno_delete(engine: EdgeEngine, creds: dict, domain_id: str, **kwargs: Any) -> DomainResult:
    """Remove the saved custom domain from engine_config and restore original URL."""
    db: Optional[Session] = kwargs.get("db")
    _remove_custom_domain(engine, db)
    return DomainResult(success=True, detail="Custom domain removed")


async def _deno_verify(engine: EdgeEngine, creds: dict, domain_id: str, **kwargs: Any) -> DomainResult:
    """Health-check the custom domain, save to engine_config on success.
    
    Hits GET https://{domain}/api/health to confirm the domain
    is properly configured and routing to the Deno app.
    On success, saves to engine_config.custom_domain.
    """
    db: Optional[Session] = kwargs.get("db")
    domain = domain_id  # For Deno, the "id" IS the domain name

    # Health check
    health_url = f"https://{domain}/api/health"
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(health_url)
    except httpx.ConnectError:
        return DomainResult(
            success=False,
            detail=f"Cannot connect to {domain} — DNS may not be configured yet.",
        )
    except httpx.TimeoutException:
        return DomainResult(
            success=False,
            detail=f"Connection to {domain} timed out — domain may not be ready.",
        )
    except Exception as e:
        return DomainResult(
            success=False,
            detail=f"Health check failed: {str(e)[:120]}",
        )

    if resp.status_code != 200:
        return DomainResult(
            success=False,
            detail=f"Health check returned {resp.status_code} — domain is reachable but the edge engine is not responding correctly.",
        )

    # Health check passed — save custom domain + update engine URL
    _save_custom_domain(engine, domain, db)

    return DomainResult(
        success=True,
        domain=DomainInfo(
            id="custom",
            domain=domain,
            status="active",
            ssl_status="active",
            provider="deno",
        ).to_dict(),
        detail=f"Health check passed! {domain} is now your custom domain.",
    )


# =============================================================================
# Registry
# =============================================================================

_LIST_HANDLERS: dict = {
    "cloudflare": _cf_list,
    "vercel":     _vercel_list,
    "netlify":    _netlify_list,
    "deno":       _deno_list,
}

_ADD_HANDLERS: dict = {
    "cloudflare": _cf_add,
    "vercel":     _vercel_add,
    "netlify":    _netlify_add,
    "deno":       _deno_add,
}

_DELETE_HANDLERS: dict = {
    "cloudflare": _cf_delete,
    "vercel":     _vercel_delete,
    "netlify":    _netlify_delete,
    "deno":       _deno_delete,
}

_VERIFY_HANDLERS: dict = {
    "cloudflare": _cf_verify,
    "vercel":     _vercel_verify,
    "netlify":    _netlify_verify,
    "deno":       _deno_verify,
}
