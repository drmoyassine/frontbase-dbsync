"""
Netlify Edge Functions — Deploy API.

Uses the Netlify CLI to deploy edge functions (which compiles them into .eszip
Deno bundles) and the Netlify REST API for site/env management.
Credentials: { "api_token": "nfp_...", "site_id": "..." }
"""

import json
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine
from ..services.secrets_builder import build_engine_secrets


NETLIFY_API = "https://api.netlify.com/api/v1"


def _headers(api_token: str) -> dict:
    return {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}


async def deploy(engine: EdgeEngine, db: Session, script_content: str, adapter_type: str) -> None:
    """Deploy bundle to Netlify Edge Functions."""
    from ..core.credential_resolver import get_provider_context_by_id

    # Force fresh read in case pre-deploy hook updated metadata
    db.expire_all()

    ctx = get_provider_context_by_id(db, str(engine.edge_provider_id))
    api_token = ctx.get('api_token')

    if not api_token:
        raise HTTPException(400, "Missing Netlify api_token")

    # site_id is per-engine (stored in engine_config), not per-provider
    cfg = json.loads(str(engine.engine_config or '{}'))
    site_id = cfg.get('site_id')

    # Verify site still exists (may have been deleted remotely)
    if site_id:
        async with httpx.AsyncClient(timeout=10.0) as client:
            check_resp = await client.get(
                f"{NETLIFY_API}/sites/{site_id}",
                headers=_headers(api_token),
            )
            if check_resp.status_code == 404:
                print(f"[Netlify] Stale site_id {site_id} — site was deleted remotely")
                site_id = None  # Force re-creation below

    # Auto-create site if not set or was stale
    if not site_id:
        site_name = cfg.get('site_name', cfg.get('worker_name', 'frontbase-edge'))
        # Try to find an existing site by name first (handles pre-migration engines)
        async with httpx.AsyncClient(timeout=10.0) as client:
            lookup_resp = await client.get(
                f"{NETLIFY_API}/sites",
                headers=_headers(api_token),
                params={"name": site_name, "per_page": 5},
            )
            if lookup_resp.status_code == 200:
                for s in lookup_resp.json():
                    if s.get("name") == site_name:
                        site_id = s.get("id", "")
                        print(f"[Netlify] Found existing site by name: {site_name} → {site_id}")
                        break
        if not site_id:
            print(f"[Netlify] Creating new site: {site_name}")
            site_id = await create_site(api_token, site_name)
        print(f"[Netlify] Created site_id: {site_id}")
        # Save site_id back to engine_config (per-engine, not per-provider)
        cfg['site_id'] = site_id
        engine.engine_config = json.dumps(cfg)  # type: ignore[assignment]
        # Update engine URL to match the actual site
        async with httpx.AsyncClient(timeout=10.0) as client:
            site_resp = await client.get(
                f"{NETLIFY_API}/sites/{site_id}",
                headers=_headers(api_token),
            )
            if site_resp.status_code == 200:
                subdomain = site_resp.json().get('subdomain', '')
                if subdomain:
                    engine.url = f"https://{subdomain}.netlify.app"  # type: ignore[assignment]
                    print(f"[Netlify] Updated engine URL: {engine.url}")
        db.commit()

    script_filename = "netlify-edge.js" if adapter_type == "full" else "netlify-edge-lite.js"

    # Deploy via file digest
    await deploy_edge_function(api_token, site_id, script_content, script_filename)

    # Push environment variables
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        engine_id=str(engine.id),
        deploy_provider='netlify',
    )
    if secrets:
        await set_env_vars(api_token, site_id, secrets)


# ── Platform-specific API calls ───────────────────────────────────────

async def deploy_edge_function(
    api_token: str, site_id: str, script_content: str, filename: str
) -> dict:
    """Deploy an edge function to Netlify using the CLI.

    Netlify Edge Functions require the CLI's build step to compile them into
    .eszip (Deno bundle) format. The raw file-digest API cannot deploy edge
    functions — they are treated as static files and never executed.

    This function:
    1. Creates a temp project dir with netlify/edge-functions/{name}.js
    2. Writes a netlify.toml with [[edge_functions]] routing
    3. Runs ``npx netlify-cli deploy --prod --json``
    4. Returns the parsed deploy response
    """
    import asyncio
    import shutil
    import subprocess
    import tempfile
    import os

    func_name = filename.replace('.js', '').replace('.ts', '')

    # Use mkdtemp instead of TemporaryDirectory — the CLI subprocess leaves
    # file handles open on Windows, causing TemporaryDirectory.__exit__ to
    # crash with PermissionError from shutil.rmtree.
    tmpdir = tempfile.mkdtemp(prefix="frontbase-netlify-")
    try:
        # Create project structure
        ef_dir = os.path.join(tmpdir, "netlify", "edge-functions")
        os.makedirs(ef_dir, exist_ok=True)

        # Create .netlify/state.json to link the site (CLI requires this)
        netlify_dir = os.path.join(tmpdir, ".netlify")
        os.makedirs(netlify_dir, exist_ok=True)
        with open(os.path.join(netlify_dir, "state.json"), "w", encoding="utf-8") as f:
            json.dump({"siteId": site_id}, f)

        # Write edge function source
        with open(os.path.join(ef_dir, f"{func_name}.js"), "w", encoding="utf-8") as f:
            f.write(script_content)

        # Write minimal index.html (static fallback)
        with open(os.path.join(tmpdir, "index.html"), "w", encoding="utf-8") as f:
            f.write("<!-- Frontbase Edge Engine -->")

        # Write netlify.toml with edge function routing
        toml_content = (
            '[build]\n'
            '  publish = "."\n\n'
            '[[edge_functions]]\n'
            f'  function = "{func_name}"\n'
            '  path = "/*"\n'
        )
        with open(os.path.join(tmpdir, "netlify.toml"), "w", encoding="utf-8") as f:
            f.write(toml_content)

        # Run CLI deploy via subprocess.run in a thread pool.
        # asyncio.create_subprocess_shell raises NotImplementedError on Windows
        # when uvicorn uses SelectorEventLoop (which doesn't support subprocesses).
        # Auth token passed via env var (not CLI flag) to avoid exposure in process list.
        cmd = "npx -y netlify-cli deploy --prod --json"
        cli_env = {**os.environ, "NETLIFY_AUTH_TOKEN": api_token}

        def _run_cli() -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                cmd,
                cwd=tmpdir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=180,
                shell=True,
                env=cli_env,
            )

        result = await asyncio.to_thread(_run_cli)

        if result.returncode != 0:
            err_msg = (result.stderr or result.stdout or "Unknown error")[:500]
            raise HTTPException(400, f"Netlify CLI deploy failed (exit {result.returncode}): {err_msg}")

        # Parse JSON output
        try:
            deploy_data = json.loads(result.stdout)
        except (json.JSONDecodeError, ValueError) as e:
            raise HTTPException(500, f"Netlify CLI returned non-JSON output: {e}")

        return deploy_data
    finally:
        # Best-effort cleanup — ignore Windows file-lock errors
        shutil.rmtree(tmpdir, ignore_errors=True)


async def set_env_vars(api_token: str, site_id: str, secrets: dict) -> None:
    """Set environment variables on a Netlify site."""
    url = f"{NETLIFY_API}/accounts/me/env"
    params = {"site_id": site_id}

    async with httpx.AsyncClient() as client:
        for name, value in secrets.items():
            if value is not None:
                resp = await client.post(
                    url, headers=_headers(api_token), params=params,
                    json=[{"key": name, "values": [{"value": value, "context": "all"}]}],
                    timeout=10.0,
                )
                if resp.status_code not in (200, 201):
                    print(f"[Netlify] Warning: Failed to set env var {name}: {resp.status_code}")


async def delete_site(api_token: str, site_id: str) -> None:
    """Delete a Netlify site."""
    url = f"{NETLIFY_API}/sites/{site_id}"
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=_headers(api_token), timeout=15.0)
    if resp.status_code not in (200, 204):
        raise HTTPException(400, f"Netlify site delete failed: {resp.text[:300]}")


def get_site_url(site_data: dict) -> str:
    """Extract the site URL from Netlify site data."""
    return f"https://{site_data.get('subdomain', '')}.netlify.app"


async def create_site(api_token: str, site_name: str) -> str:
    """Create a new Netlify site and return its site_id.
    
    Used for auto-provisioning when no site_id is provided at connect time.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{NETLIFY_API}/sites",
            headers=_headers(api_token),
            json={"name": site_name},
            timeout=15.0,
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(400, f"Failed to create Netlify site: {resp.text[:300]}")
        data = resp.json()
        site_id = data.get("id") or data.get("site_id")
        if not site_id:
            raise HTTPException(500, "Netlify site created but no site_id returned")
        return site_id
