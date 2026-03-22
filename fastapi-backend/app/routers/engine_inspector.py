"""
Engine Inspector Router — Multi-provider inspect endpoints.

Provider-agnostic endpoints on /api/edge-engines/{engine_id}/inspect/*
that dispatch to the correct management API:

  GET /inspect/source   — CF /content/v2, Supabase /functions/{slug}/body
  GET /inspect/secrets  — CF bindings (secret_text), Supabase /projects/{ref}/secrets
  GET /inspect/settings — CF settings, Supabase function config (verify_jwt, entrypoint)

Deno Deploy has no management API for reading source/secrets/settings —
returns {"supported": false} for all panels.
"""

import asyncio
import json

import httpx
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from ..database.config import get_db
from ..models.models import EdgeEngine
from ..core.credential_resolver import get_provider_context_by_id

router = APIRouter(prefix="/api/edge-engines", tags=["Engine Inspector"])

SUPABASE_API = "https://api.supabase.com/v1"


# =============================================================================
# Helpers — resolve engine → provider context
# =============================================================================

def _resolve_engine(engine_id: str, db: Session) -> tuple:
    """Look up engine, parse config, resolve credentials.

    Returns (engine, provider, ctx, engine_config).
    """
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(404, "Edge engine not found")

    # Resolve provider credentials
    if engine.edge_provider_id is None:
        raise HTTPException(400, "Engine has no connected provider account")

    ctx = get_provider_context_by_id(db, str(engine.edge_provider_id))

    # Provider type comes from the connected account, not the engine itself
    provider = ctx.get("provider_type", "cloudflare")

    # Parse engine_config
    cfg = {}
    if engine.engine_config is not None:
        try:
            cfg = json.loads(str(engine.engine_config))
        except (json.JSONDecodeError, TypeError):
            pass

    return engine, provider, ctx, cfg


# =============================================================================
# Supabase helpers
# =============================================================================

async def _sb_function_source(access_token: str, project_ref: str, slug: str) -> dict:
    """Fetch Supabase Edge Function body.

    Note: Supabase returns a compiled ESZIP bundle (binary), not readable TS source.
    We detect this and return a descriptive placeholder instead.
    """
    url = f"{SUPABASE_API}/projects/{project_ref}/functions/{slug}/body"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {access_token}"})

    if resp.status_code == 404:
        return {"error": f"Function '{slug}' not found", "status": 404}
    if resp.status_code != 200:
        return {"error": f"Supabase API error ({resp.status_code}): {resp.text[:300]}", "status": resp.status_code}

    content_type = resp.headers.get("content-type", "")
    raw_bytes = len(resp.content)

    # Supabase returns compiled ESZIP bundles (application/octet-stream or similar)
    # These are not human-readable — show informational summary instead
    is_binary = "octet-stream" in content_type or not content_type.startswith("text")
    if is_binary or raw_bytes > 100_000:
        summary = (
            f"// Supabase Edge Function: {slug}\n"
            f"// Compiled ESZIP bundle ({raw_bytes:,} bytes)\n"
            f"//\n"
            f"// Supabase does not expose the original TypeScript source via API.\n"
            f"// The deployed bundle is a compiled artifact that includes all\n"
            f"// dependencies bundled together.\n"
            f"//\n"
            f"// To view the original source code, check your local project\n"
            f"// in: supabase/functions/{slug}/index.ts\n"
        )
        return {
            "success": True,
            "files": {f"{slug}.ts": summary},
            "file_count": 1,
            "total_size": raw_bytes,
        }

    # If somehow we get readable text, return it
    content = resp.text
    return {
        "success": True,
        "files": {f"{slug}.ts": content},
        "file_count": 1,
        "total_size": raw_bytes,
    }


async def _sb_function_config(access_token: str, project_ref: str, slug: str) -> dict:
    """Fetch Supabase Edge Function config (verify_jwt, entrypoint, status)."""
    url = f"{SUPABASE_API}/projects/{project_ref}/functions/{slug}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {access_token}"})

    if resp.status_code != 200:
        return {"error": f"Supabase API error ({resp.status_code}): {resp.text[:300]}"}

    data = resp.json()
    return {
        "success": True,
        "settings": {
            "verify_jwt": data.get("verify_jwt", True),
            "entrypoint_path": data.get("entrypoint_path", ""),
            "status": data.get("status", ""),
            "version": data.get("version", 0),
            "import_map": bool(data.get("import_map")),
            "import_map_path": data.get("import_map_path", ""),
        },
    }


async def _sb_project_secrets(access_token: str, project_ref: str) -> dict:
    """Fetch Supabase project-level secrets (shared across all functions)."""
    url = f"{SUPABASE_API}/projects/{project_ref}/secrets"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {access_token}"})

    if resp.status_code != 200:
        return {"error": f"Supabase API error ({resp.status_code}): {resp.text[:300]}"}

    secrets = resp.json()
    # Supabase returns [{name, value}] — mask values for security
    if isinstance(secrets, list):
        names = [s.get("name", "") for s in secrets]
        return {"success": True, "secrets": names}
    return {"success": True, "secrets": []}


# =============================================================================
# Cloudflare helpers (re-use sync pattern from cloudflare_inspector.py)
# =============================================================================

def _cf_inspect_content(api_token: str, account_id: str, worker_name: str) -> dict:
    """Fetch CF Worker source. Sync — run in executor."""
    import requests as req
    from ..services.cloudflare_api import CF_API, headers as cf_headers

    hdrs = cf_headers(api_token)
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/content/v2"
    resp = req.get(url, headers=hdrs, timeout=30.0)

    if resp.status_code == 404:
        return {"error": f"Worker '{worker_name}' not found", "status": 404}
    if resp.status_code != 200:
        url2 = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}"
        resp = req.get(url2, headers=hdrs, timeout=30.0)
        if resp.status_code != 200:
            return {"error": f"CF API error ({resp.status_code}): {resp.text[:300]}"}

    cd = resp.headers.get("content-disposition", "")
    filename = "worker.js"
    if "filename=" in cd:
        filename = cd.split("filename=")[-1].strip('"').strip("'")

    content = resp.text
    size_bytes = len(content.encode("utf-8"))

    # Return in SourceSnapshotResponse-compatible shape (files map)
    return {"success": True, "files": {filename: content}, "file_count": 1, "total_size": size_bytes}


def _cf_inspect_settings(api_token: str, account_id: str, worker_name: str) -> dict:
    """Fetch CF Worker settings + secrets. Sync — run in executor."""
    import requests as req
    from ..services.cloudflare_api import CF_API, headers as cf_headers

    hdrs = cf_headers(api_token)
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/settings"
    resp = req.get(url, headers=hdrs, timeout=15.0)

    if resp.status_code == 404:
        return {"error": f"Worker '{worker_name}' not found", "status": 404}
    if resp.status_code != 200:
        return {"error": f"CF API error ({resp.status_code}): {resp.text[:300]}"}

    result = resp.json().get("result", {})
    bindings = result.get("bindings", [])
    non_secret = [b for b in bindings if b.get("type") != "secret_text"]
    secret_names = [b["name"] for b in bindings if b.get("type") == "secret_text"]

    # Crons
    crons = []
    try:
        cr = req.get(f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/schedules", headers=hdrs, timeout=10.0)
        if cr.status_code == 200:
            crons = cr.json().get("result", {}).get("schedules", [])
    except Exception:
        pass

    # Routes
    routes = []
    try:
        sr = req.get(f"{CF_API}/accounts/{account_id}/workers/subdomain", headers=hdrs, timeout=10.0)
        if sr.status_code == 200:
            sub = sr.json().get("result", {}).get("subdomain", "")
            if sub:
                routes.append({"type": "workers.dev", "pattern": f"{worker_name}.{sub}.workers.dev"})
    except Exception:
        pass

    return {
        "success": True,
        "settings": {
            "compatibility_date": result.get("compatibility_date", "unknown"),
            "compatibility_flags": result.get("compatibility_flags", []),
            "usage_model": result.get("usage_model", "standard"),
            "bindings": non_secret,
            "routes": routes,
            "cron_triggers": crons,
            "placement": result.get("placement", {}),
            "tail_consumers": result.get("tail_consumers", []),
        },
        "secrets": secret_names,
    }


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/{engine_id}/inspect/source")
async def inspect_engine_source(engine_id: str, db: Session = Depends(get_db)):
    """Fetch deployed source code from provider API."""
    engine, provider, ctx, cfg = _resolve_engine(engine_id, db)

    if provider == "cloudflare":
        from ..services.cloudflare_api import detect_account_id
        api_token = ctx.get("api_token", "") or ctx.get("access_token", "")
        account_id = ctx.get("account_id", "")
        if not account_id:
            account_id = await detect_account_id(api_token)
        worker_name = cfg.get("worker_name", engine.name)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _cf_inspect_content, api_token, account_id, worker_name)

    elif provider == "supabase":
        access_token = ctx.get("access_token", "")
        project_ref = ctx.get("project_ref", "")
        slug = cfg.get("function_name", "")
        if not access_token or not project_ref or not slug:
            raise HTTPException(400, "Missing Supabase credentials or function_name in engine config")
        result = await _sb_function_source(access_token, project_ref, slug)

    elif provider == "vercel":
        result = await _vercel_inspect_source(ctx, cfg)

    else:
        return {"supported": False, "provider": provider, "detail": f"{provider} does not support source inspection"}

    if "error" in result:
        raise HTTPException(result.get("status", 500), result["error"])
    return result


@router.get("/{engine_id}/inspect/settings")
async def inspect_engine_settings(engine_id: str, db: Session = Depends(get_db)):
    """Fetch deployed engine settings/config from provider API."""
    engine, provider, ctx, cfg = _resolve_engine(engine_id, db)

    if provider == "cloudflare":
        from ..services.cloudflare_api import detect_account_id
        api_token = ctx.get("api_token", "") or ctx.get("access_token", "")
        account_id = ctx.get("account_id", "")
        if not account_id:
            account_id = await detect_account_id(api_token)
        worker_name = cfg.get("worker_name", engine.name)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _cf_inspect_settings, api_token, account_id, worker_name)
        # Return settings only (secrets are served by /inspect/secrets)
        return {"success": True, "settings": result.get("settings", {})}

    elif provider == "supabase":
        access_token = ctx.get("access_token", "")
        project_ref = ctx.get("project_ref", "")
        slug = cfg.get("function_name", "")
        if not access_token or not project_ref or not slug:
            raise HTTPException(400, "Missing Supabase credentials or function_name in engine config")
        result = await _sb_function_config(access_token, project_ref, slug)

    elif provider == "vercel":
        result = await _vercel_inspect_settings(ctx, cfg)

    else:
        return {"supported": False, "provider": provider, "detail": f"{provider} does not support settings inspection"}

    if "error" in result:
        raise HTTPException(result.get("status", 500), result["error"])
    return result


@router.get("/{engine_id}/inspect/secrets")
async def inspect_engine_secrets(engine_id: str, db: Session = Depends(get_db)):
    """Fetch deployed secrets/env vars from provider API."""
    engine, provider, ctx, cfg = _resolve_engine(engine_id, db)

    if provider == "cloudflare":
        from ..services.cloudflare_api import detect_account_id
        api_token = ctx.get("api_token", "") or ctx.get("access_token", "")
        account_id = ctx.get("account_id", "")
        if not account_id:
            account_id = await detect_account_id(api_token)
        worker_name = cfg.get("worker_name", engine.name)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _cf_inspect_settings, api_token, account_id, worker_name)
        return {"success": True, "secrets": result.get("secrets", [])}

    elif provider == "supabase":
        # For Frontbase-deployed engines: show Frontbase-injected secrets (names only)
        # For imported engines: show a banner directing to Supabase dashboard
        if bool(engine.is_imported) if hasattr(engine, 'is_imported') else False:
            return {
                "success": True,
                "secrets": [],
                "imported_notice": "This function was imported from Supabase. Project-level secrets are managed via the Supabase project dashboard.",
            }
        else:
            from ..services.secrets_builder import build_engine_secrets
            secrets = build_engine_secrets(
                db,
                edge_db_id=str(engine.edge_db_id) if engine.edge_db_id else None,
                edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id else None,
                edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id else None,
                engine_id=str(engine.id),
                deploy_provider=provider,
            )
            result = {
                "success": True,
                "secrets": sorted(secrets.keys()),
            }

    elif provider == "vercel":
        result = await _vercel_inspect_secrets(ctx, cfg)

    else:
        return {"supported": False, "provider": provider, "detail": f"{provider} does not support secrets inspection"}

    if "error" in result:
        raise HTTPException(result.get("status", 500), result["error"])
    return result


# =============================================================================
# Vercel helpers
# =============================================================================

async def _vercel_inspect_source(ctx: dict, cfg: dict) -> dict:
    """Fetch deployed source from Vercel deployment files."""
    from ..services import vercel_deploy_api

    api_token = ctx.get("api_token", "")
    team_id = ctx.get("team_id")
    project_name = cfg.get("project_name", "")
    if not api_token or not project_name:
        return {"error": "Missing Vercel credentials or project_name"}

    # Get latest deployment
    projects = await vercel_deploy_api.list_projects(api_token, team_id)
    project_id = None
    for p in projects:
        if p.get("name") == project_name:
            project_id = p.get("id")
            break
    if not project_id:
        return {"error": f"Project '{project_name}' not found"}

    deps = await vercel_deploy_api.list_deployments(api_token, project_id, team_id, limit=1)
    if not deps:
        return {"error": "No deployments found for this project"}

    dep_id = deps[0].get("uid", "")

    # List files (tree structure) and flatten to get file UIDs
    file_tree = await vercel_deploy_api.list_deployment_files(api_token, dep_id, team_id)

    files: dict[str, str] = {}
    total_size = 0

    def collect_files(nodes: list, prefix: str = "") -> list[tuple[str, str]]:
        """Flatten file tree into [(path, uid), ...]."""
        result = []
        for node in nodes:
            name = node.get("name", "")
            path = f"{prefix}/{name}" if prefix else name
            if node.get("type") == "file" and node.get("uid"):
                result.append((path, node["uid"]))
            children = node.get("children", [])
            if children:
                result.extend(collect_files(children, path))
        return result

    file_entries = collect_files(file_tree)

    # Fetch content for each file (limit to 20 files to avoid timeouts)
    for path, uid in file_entries[:20]:
        content = await vercel_deploy_api.get_deployment_file(api_token, dep_id, uid, team_id)
        files[path] = content
        total_size += len(content)

    return {
        "success": True,
        "files": files,
        "file_count": len(files),
        "total_size": total_size,
    }


async def _vercel_inspect_settings(ctx: dict, cfg: dict) -> dict:
    """Fetch Vercel project config."""
    from ..services import vercel_deploy_api

    api_token = ctx.get("api_token", "")
    team_id = ctx.get("team_id")
    project_name = cfg.get("project_name", "")
    if not api_token or not project_name:
        return {"error": "Missing Vercel credentials or project_name"}

    project = await vercel_deploy_api.get_project(api_token, project_name, team_id)
    if "error" in project:
        return project

    return {
        "success": True,
        "settings": {
            "framework": project.get("framework"),
            "node_version": project.get("nodeVersion"),
            "build_command": project.get("buildCommand"),
            "install_command": project.get("installCommand"),
            "output_directory": project.get("outputDirectory"),
            "root_directory": project.get("rootDirectory"),
            "region": project.get("serverlessFunctionRegion"),
            "public_source": project.get("publicSource"),
            "auto_expose_system_envs": project.get("autoExposeSystemEnvs"),
        },
    }


async def _vercel_inspect_secrets(ctx: dict, cfg: dict) -> dict:
    """Fetch Vercel env var names (values hidden for encrypted type)."""
    from ..services import vercel_deploy_api

    api_token = ctx.get("api_token", "")
    team_id = ctx.get("team_id")
    project_name = cfg.get("project_name", "")
    if not api_token or not project_name:
        return {"error": "Missing Vercel credentials or project_name"}

    envs = await vercel_deploy_api.list_env_vars(api_token, project_name, team_id)

    return {
        "success": True,
        "secrets": [e.get("key", "") for e in envs],
        "env_details": [
            {
                "key": e.get("key"),
                "type": e.get("type"),
                "target": e.get("target"),
            }
            for e in envs
        ],
    }


# =============================================================================
# Domain Management — multi-provider, dispatched via domain_manager.py
# =============================================================================

def _get_creds(engine_id: str, db: Session) -> tuple:
    """Resolve engine + merged credentials (ctx + raw creds for provider-specific keys).
    
    Returns (engine, provider_type, merged_creds).
    """
    from ..core.security import decrypt_credentials

    engine, provider, ctx, cfg = _resolve_engine(engine_id, db)
    
    # Raw creds include provider-specific keys like personal_token, user_id
    from ..models.models import EdgeProviderAccount
    provider_acct = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == str(engine.edge_provider_id)
    ).first()
    raw_creds = {}
    if provider_acct and provider_acct.provider_credentials:
        raw_creds = decrypt_credentials(str(provider_acct.provider_credentials))
    
    # Merge: raw creds take precedence (they have all fields), ctx adds flattened extras
    merged = {**ctx, **raw_creds}
    return engine, provider, merged


from pydantic import BaseModel as _BaseModel  # noqa: E402


class _AddDomainBody(_BaseModel):
    domain: str


@router.get("/{engine_id}/inspect/domains")
async def inspect_engine_domains(engine_id: str, db: Session = Depends(get_db)):
    """List custom domains for this engine."""
    from ..services import domain_manager as dm

    engine, provider, creds = _get_creds(engine_id, db)
    result = await dm.list_domains(engine, creds, provider, db=db)
    return result.to_dict()


@router.post("/{engine_id}/inspect/domains")
async def add_engine_domain(engine_id: str, body: _AddDomainBody, db: Session = Depends(get_db)):
    """Add a custom domain to this engine."""
    from ..services import domain_manager as dm

    engine, provider, creds = _get_creds(engine_id, db)
    result = await dm.add_domain(engine, creds, provider, body.domain, db=db)
    return result.to_dict()


@router.delete("/{engine_id}/inspect/domains/{domain_id}")
async def delete_engine_domain(engine_id: str, domain_id: str, db: Session = Depends(get_db)):
    """Remove a custom domain from this engine."""
    from ..services import domain_manager as dm

    engine, provider, creds = _get_creds(engine_id, db)
    result = await dm.delete_domain(engine, creds, provider, domain_id, db=db)
    return result.to_dict()


@router.post("/{engine_id}/inspect/domains/{domain_id}/verify")
async def verify_engine_domain(engine_id: str, domain_id: str, db: Session = Depends(get_db)):
    """Trigger DNS verification for a custom domain."""
    from ..services import domain_manager as dm

    engine, provider, creds = _get_creds(engine_id, db)
    result = await dm.verify_domain(engine, creds, provider, domain_id, db=db)
    return result.to_dict()

