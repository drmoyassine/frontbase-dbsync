"""
Deno Deploy — Deploy API (v2).

Uses the Deno Deploy v2 API to deploy functions.
Credentials: { "access_token": "ddo_..." (org token) }
The project_name (app slug) is stored separately in provider credentials.
"""

import json
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine
from ..services.secrets_builder import build_engine_secrets


DENO_DEPLOY_API = "https://api.deno.com/v2"


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}


async def deploy(engine: EdgeEngine, db: Session, script_content: str, adapter_type: str) -> None:
    """Deploy bundle to Deno Deploy."""
    from ..core.credential_resolver import get_provider_context_by_id

    ctx = get_provider_context_by_id(db, str(engine.edge_provider_id))
    access_token = ctx.get('access_token')
    org_slug = ctx.get('org_slug', '')  # Set by user during account connection

    # project_name (app slug) is stored in engine_config, not provider credentials
    engine_cfg = json.loads(str(engine.engine_config or '{}'))
    project_name = engine_cfg.get('project_name')

    if not access_token or not project_name:
        raise HTTPException(400, "Missing Deno Deploy credentials (access_token) or project_name in engine config")

    script_filename = "deno-deploy.js" if adapter_type == "full" else "deno-deploy-lite.js"

    # Build environment variables
    secrets = build_engine_secrets(
        db,
        edge_db_id=str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        edge_cache_id=str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        edge_queue_id=str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        engine_id=str(engine.id),
        deploy_provider='deno',
    )

    # Ensure app exists — create if not found. Returns the actual slug used.
    actual_slug = await ensure_app_exists(access_token, project_name)

    # If the slug changed (e.g. due to 409 conflict), persist the real slug
    if actual_slug != project_name:
        engine_cfg['project_name'] = actual_slug
        engine.engine_config = json.dumps(engine_cfg)  # type: ignore[assignment]
        db.commit()
        print(f"[Deno Deploy] Slug changed: {project_name} -> {actual_slug}")

    # Deploy function (v2 deploy endpoint does NOT persist env_vars)
    await deploy_function(access_token, actual_slug, script_content, script_filename, secrets)

    # Set env vars separately — the deploy endpoint ignores them,
    # so we must use the PATCH /apps/{slug} endpoint explicitly.
    if secrets:
        await set_env_vars(access_token, actual_slug, secrets)

    # Correct the engine URL using org_slug from provider credentials
    correct_url = get_project_url(actual_slug, org_slug or None)
    # If a custom domain is configured, preserve it — only update original_url for reference
    if engine_cfg.get("custom_domain"):
        if engine_cfg.get("original_url") != correct_url:
            engine_cfg["original_url"] = correct_url
            engine.engine_config = json.dumps(engine_cfg)  # type: ignore[assignment]
            db.commit()
            print(f"[Deno Deploy] custom_domain active, updated original_url: {correct_url}")
    elif str(engine.url) != correct_url:
        engine.url = correct_url  # type: ignore[assignment]
        db.commit()
        print(f"[Deno Deploy] URL corrected: {correct_url}")


# ── Platform-specific API calls ───────────────────────────────────────

async def deploy_function(
    access_token: str, project_name: str, script_content: str, filename: str,
    env_vars: dict | None = None,
) -> dict:
    """Deploy a function to Deno Deploy via the v2 API."""
    url = f"{DENO_DEPLOY_API}/apps/{project_name}/deploy"

    payload: dict = {
        "assets": {
            filename: {
                "kind": "file",
                "content": script_content,
                "encoding": "utf-8",
            }
        },
        "config": {
            "runtime": {
                "type": "dynamic",
                "entrypoint": filename,
            }
        },
    }

    # Include env vars in the deploy if provided
    if env_vars:
        payload["env_vars"] = [
            {"key": k, "value": v} for k, v in env_vars.items()
        ]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url, headers=_headers(access_token), json=payload, timeout=60.0,
        )
        if resp.status_code not in (200, 201, 202):
            raise HTTPException(400, f"Deno Deploy failed: {resp.text[:300]}")
        return resp.json()


async def set_env_vars(access_token: str, project_name: str, secrets: dict) -> None:
    """Set environment variables on a Deno Deploy app via v2 API."""
    url = f"{DENO_DEPLOY_API}/apps/{project_name}"

    payload = {
        "env_vars": [
            {"key": k, "value": v} for k, v in secrets.items()
        ]
    }

    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            url, headers=_headers(access_token), json=payload, timeout=15.0,
        )
        if resp.status_code not in (200, 204):
            print(f"[Deno Deploy] Warning: Failed to set env vars: {resp.status_code}")


async def delete_project(access_token: str, project_name: str) -> None:
    """Delete a Deno Deploy app."""
    url = f"{DENO_DEPLOY_API}/apps/{project_name}"
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=_headers(access_token), timeout=15.0)
    if resp.status_code not in (200, 204):
        raise HTTPException(400, f"Deno Deploy app delete failed: {resp.text[:300]}")


async def detect_org_subdomain(access_token: str, app_slug: str | None = None) -> str | None:
    """Detect the org subdomain for a Deno Deploy access token.
    
    Org tokens (ddo_...) create apps at {slug}.{org-slug}.deno.net.
    Personal tokens create apps at {slug}.deno.dev.
    
    Strategy: HEAD-probe a live app at {slug}.deno.dev — if the response
    URL (after redirects) is on .deno.net, extract the org slug.
    
    IMPORTANT: This must be called AFTER deploy, so the app is live.
    """
    # Check token prefix: ddo_ = org token, ddp_ = personal  
    if not access_token.startswith('ddo_'):
        return None  # Personal token, use .deno.dev
    
    # Determine which slug to probe
    test_slug = app_slug
    if not test_slug:
        # Fallback: list apps and pick the first one
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{DENO_DEPLOY_API}/apps",
                    headers=_headers(access_token),
                )
                if resp.status_code == 200:
                    apps = resp.json()
                    if isinstance(apps, list) and apps:
                        test_slug = apps[0].get('slug', '')
        except Exception:
            pass
    
    if not test_slug:
        print("[Deno Deploy] Warning: No app slug available for org detection")
        return None
    
    # HEAD-probe the app at .deno.dev — follow redirects
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=8.0) as client:
            probe = await client.head(f"https://{test_slug}.deno.dev/")
            final_url = str(probe.url)
            final_host = final_url.split('//')[1].split('/')[0] if final_url.startswith('http') else ''
            print(f"[Deno Deploy] Probe {test_slug}.deno.dev → final host: {final_host}")
            
            if '.deno.net' in final_host:
                # Extract org: {slug}.{org}.deno.net → org is parts[1]
                parts = final_host.split('.')
                if len(parts) >= 4:  # slug.org.deno.net
                    org = parts[1]
                    print(f"[Deno Deploy] Detected org subdomain: {org}")
                    return org
    except Exception as e:
        print(f"[Deno Deploy] Probe failed: {e}")
    
    print("[Deno Deploy] Warning: Could not detect org subdomain for org token")
    return None


def get_project_url(project_name: str, org_subdomain: str | None = None) -> str:
    """Build the public URL for a Deno Deploy app.
    
    Org accounts: https://{slug}.{org}.deno.net
    Personal accounts: https://{slug}.deno.dev
    """
    if org_subdomain:
        return f"https://{project_name}.{org_subdomain}.deno.net"
    return f"https://{project_name}.deno.dev"


async def ensure_app_exists(access_token: str, project_name: str) -> str:
    """Check if a Deno Deploy app exists; create it if not.
    
    Auto-provisioning: the user only provides a token, we handle app creation.
    Returns the actual app slug (may differ from project_name if a fallback was used).
    """
    async with httpx.AsyncClient() as client:
        # Check if app exists
        resp = await client.get(
            f"{DENO_DEPLOY_API}/apps/{project_name}",
            headers=_headers(access_token),
            timeout=10.0,
        )
        if resp.status_code == 200:
            return project_name  # App exists

        if resp.status_code in (404, 400):
            # App doesn't exist — create it (v2 API uses 'slug' field)
            create_resp = await client.post(
                f"{DENO_DEPLOY_API}/apps",
                headers=_headers(access_token),
                json={"slug": project_name},
                timeout=15.0,
            )
            if create_resp.status_code in (200, 201):
                # Return the slug from the response (API may sanitize it)
                created = create_resp.json()
                return str(created.get('slug', project_name))
            # If slug is taken, try with a random suffix
            if create_resp.status_code == 409:
                import uuid
                fallback_slug = f"{project_name}-{uuid.uuid4().hex[:6]}"
                retry = await client.post(
                    f"{DENO_DEPLOY_API}/apps",
                    headers=_headers(access_token),
                    json={"slug": fallback_slug},
                    timeout=15.0,
                )
                if retry.status_code in (200, 201):
                    created = retry.json()
                    return str(created.get('slug', fallback_slug))
            raise HTTPException(400, f"Failed to create Deno Deploy app '{project_name}': {create_resp.text[:300]}")

        raise HTTPException(400, f"Deno Deploy app check failed ({resp.status_code}): {resp.text[:300]}")
