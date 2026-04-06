"""
Engine Reconfigure Service — Live binding updates without full redeployment.

Extracted from edge_engines.py router for single-responsibility compliance.
Uses provider-specific env var APIs, only triggering full redeploy for
providers that require it (Vercel, Netlify).

DRY: reuses set_env_vars / set_project_secrets from each provider's deploy API.
"""

import json
import httpx

from sqlalchemy.orm import Session
from ..models.models import EdgeEngine, EdgeProviderAccount
from ..services.secrets_builder import build_engine_secrets, FRONTBASE_BINDING_NAMES
from ..services import engine_deploy
from ..schemas.edge_engines import ReconfigureRequest
from datetime import datetime


# Providers that require a full redeploy after env var updates
# (their Edge Functions read env vars at build time, not runtime)
NEEDS_REDEPLOY_FOR_ENV = frozenset({'vercel', 'netlify'})


def _resolve_provider_type(engine: EdgeEngine, db: Session) -> str | None:
    """Get the provider type string for an engine (e.g., 'cloudflare', 'supabase')."""
    if engine.edge_provider_id is None:
        return None
    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == engine.edge_provider_id
    ).first()
    return str(provider.provider) if provider else None


def _resolve_cf_credentials(engine: EdgeEngine, db: Session) -> dict | None:
    """Extract CF API credentials from engine's provider account.
    
    Returns dict with api_token, account_id, worker_name or None if not CF.
    """
    provider_id = engine.edge_provider_id
    if provider_id is None:
        return None

    provider = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == provider_id
    ).first()
    if not provider or str(provider.provider) != 'cloudflare':
        return None

    from ..core.credential_resolver import get_provider_context_by_id
    ctx = get_provider_context_by_id(db, str(provider_id))
    cfg = json.loads(str(engine.engine_config or '{}'))

    api_token = ctx.get('api_token')
    account_id = ctx.get('account_id')
    worker_name = cfg.get('worker_name')

    if not all([api_token, account_id, worker_name]):
        return None

    return {
        'api_token': api_token,
        'account_id': account_id,
        'worker_name': worker_name,
    }


async def _push_env_vars(
    provider_type: str,
    engine: EdgeEngine,
    db: Session,
    new_bindings: dict[str, str],
) -> bool:
    """Push env vars via provider-specific API (DRY adapter).
    
    Reuses existing set_env_vars / set_project_secrets from each deploy API.
    Returns True if successful.
    """
    from ..core.credential_resolver import get_provider_context_by_id

    ctx = get_provider_context_by_id(db, str(engine.edge_provider_id))
    cfg = json.loads(str(engine.engine_config or '{}'))

    try:
        if provider_type == 'supabase':
            from ..services import supabase_deploy_api
            await supabase_deploy_api.set_project_secrets(
                str(ctx.get('access_token', '')),
                str(ctx.get('project_ref', '')),
                new_bindings,
            )
        elif provider_type == 'deno':
            from ..services import deno_deploy_api
            await deno_deploy_api.set_env_vars(
                str(ctx.get('access_token', '')),
                str(cfg.get('project_name', '')),
                new_bindings,
            )
        elif provider_type == 'vercel':
            from ..services import vercel_deploy_api
            await vercel_deploy_api.set_env_vars(
                str(ctx.get('api_token', '')),
                str(cfg.get('vercel_project_name', '')),
                new_bindings,
                ctx.get('team_id'),
            )
        elif provider_type == 'netlify':
            from ..services import netlify_deploy_api
            await netlify_deploy_api.set_env_vars(
                str(ctx.get('api_token', '')),
                str(cfg.get('site_id', '')),
                new_bindings,
            )
        else:
            print(f"[Reconfigure] No env var setter for provider '{provider_type}'")
            return False

        print(f"[Reconfigure] Pushed {len(new_bindings)} env vars via {provider_type}")
        return True

    except Exception as e:
        print(f"[Reconfigure] Failed to push env vars via {provider_type}: {e}")
        return False


async def _patch_cf_settings(
    cf_creds: dict,
    new_bindings: dict[str, str],
    partial: bool = False,
) -> tuple[bool, list[str], list[str]]:
    """PATCH CF Worker settings with new Frontbase bindings.
    
    When partial=False (default, used by full reconfigure):
        Strips ALL Frontbase-managed bindings and replaces with new_bindings.
        Bindings in FRONTBASE_BINDING_NAMES that are NOT in new_bindings are removed.
    
    When partial=True (used by targeted updates like API key sync):
        Only upserts the specified bindings. All other existing bindings are preserved.
    
    Preserves all non-Frontbase bindings in both modes.
    Returns (patched, bindings_set, bindings_removed).
    """
    from ..services.cloudflare_api import CF_API, headers as cf_headers

    api_token = cf_creds['api_token']
    account_id = cf_creds['account_id']
    worker_name = cf_creds['worker_name']

    settings_url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/settings"
    secrets_url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/secrets"
    bindings_set = list(new_bindings.keys())
    bindings_removed: list[str] = []

    try:
        async with httpx.AsyncClient() as client:
            # GET current settings to preserve non-Frontbase bindings
            get_resp = await client.get(
                settings_url,
                headers={**cf_headers(api_token), "Content-Type": "application/json"},
                timeout=15.0,
            )

            existing_bindings: list[dict] = []
            if get_resp.status_code == 200:
                data = get_resp.json()
                existing_bindings = data.get("result", {}).get("bindings", [])

            if partial:
                # Partial mode: only remove bindings we're explicitly replacing
                preserved_bindings = [
                    b for b in existing_bindings
                    if b.get("name") not in new_bindings
                ]
                bindings_removed = []
            else:
                # Full mode: strip ALL Frontbase-managed bindings (reconfigure replaces them all)
                preserved_bindings = [
                    b for b in existing_bindings
                    if b.get("name") not in FRONTBASE_BINDING_NAMES
                ]
                existing_fb_names = {
                    b.get("name") for b in existing_bindings
                    if b.get("name") in FRONTBASE_BINDING_NAMES
                }
                bindings_removed = [str(n) for n in existing_fb_names - set(new_bindings.keys())]

            # Add our new bindings as secret_text
            for name, value in new_bindings.items():
                preserved_bindings.append({
                    "type": "secret_text",
                    "name": name,
                    "text": value,
                })

            # PATCH settings — CF API requires multipart/form-data
            settings_payload = json.dumps({"bindings": preserved_bindings})
            patch_resp = await client.patch(
                settings_url,
                headers=cf_headers(api_token),
                files={"settings": (None, settings_payload, "application/json")},
                timeout=15.0,
            )

            patched = patch_resp.status_code in (200, 201)
            if patched:
                print(f"[Reconfigure] Settings PATCH OK for '{worker_name}': "
                      f"set={bindings_set}, removed={bindings_removed}")
            else:
                print(f"[Reconfigure] Settings PATCH failed: "
                      f"{patch_resp.status_code} {patch_resp.text[:300]}")

            # DELETE removed secrets (legacy per-script secrets persist independently)
            for secret_name in bindings_removed:
                try:
                    del_resp = await client.delete(
                        f"{secrets_url}/{secret_name}",
                        headers=cf_headers(api_token),
                        timeout=15.0,
                    )
                    if del_resp.status_code in (200, 204):
                        print(f"[Reconfigure] Deleted legacy secret '{secret_name}'")
                    else:
                        print(f"[Reconfigure] Could not delete secret '{secret_name}': {del_resp.status_code}")
                except Exception as del_err:
                    print(f"[Reconfigure] Error deleting secret '{secret_name}': {del_err}")

            return patched, bindings_set, bindings_removed

    except Exception as e:
        print(f"[Reconfigure] Settings PATCH error: {e}")
        return False, bindings_set, bindings_removed


async def reconfigure(
    engine: EdgeEngine,
    payload: ReconfigureRequest,
    db: Session,
) -> dict:
    """Live-reconfigure an engine's DB/cache/queue bindings.
    
    Provider routing:
      - CF:               PATCH Settings API (instant, preserves non-FB bindings)
      - Supabase/Deno:    Push env vars via API (instant, no redeploy)
      - Vercel/Netlify:   Push env vars via API + trigger full redeploy
      - Docker:           POST to engine /api/update
    """
    # 1. Resolve provider type
    provider_type = _resolve_provider_type(engine, db)

    # 2. Build new bindings
    new_bindings = build_engine_secrets(
        db,
        edge_db_id=payload.edge_db_id,
        edge_cache_id=payload.edge_cache_id,
        edge_queue_id=payload.edge_queue_id,
        engine_id=str(engine.id),
        deploy_provider=provider_type,
    )

    # 3. Update local DB record (must happen BEFORE redeploy for non-CF engines)
    engine.edge_db_id = payload.edge_db_id  # type: ignore[assignment]
    engine.edge_cache_id = payload.edge_cache_id  # type: ignore[assignment]
    engine.edge_queue_id = payload.edge_queue_id  # type: ignore[assignment]
    engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()
    db.refresh(engine)

    # 4. Push env vars via provider-specific path
    settings_patched = False
    bindings_set = list(new_bindings.keys())
    bindings_removed: list[str] = []

    if provider_type == 'cloudflare':
        cf_creds = _resolve_cf_credentials(engine, db)
        if cf_creds:
            settings_patched, bindings_set, bindings_removed = await _patch_cf_settings(
                cf_creds, new_bindings, partial=True
            )
    elif provider_type in ('supabase', 'deno', 'vercel', 'netlify'):
        settings_patched = await _push_env_vars(provider_type, engine, db, new_bindings)

        # 5. Only redeploy if provider requires it
        if provider_type in NEEDS_REDEPLOY_FOR_ENV:
            try:
                await engine_deploy.redeploy(engine, db)
                print(f"[Reconfigure] Redeployed {provider_type} engine '{engine.name}' to activate new env vars")
            except Exception as e:
                print(f"[Reconfigure] Redeploy failed for {provider_type} engine '{engine.name}': {e}")
                settings_patched = False
    elif engine.edge_provider_id is not None:
        # Unknown provider: fallback to full redeploy
        try:
            await engine_deploy.redeploy(engine, db)
            settings_patched = True
            print(f"[Reconfigure] Redeployed engine '{engine.name}' (unknown provider)")
        except Exception as e:
            print(f"[Reconfigure] Redeploy failed for engine '{engine.name}': {e}")

    # 6. Flush edge cache on target
    cache_flushed = await engine_deploy._flush_cache(engine, str(engine.url).rstrip('/'))

    return {
        "success": True,
        "settings_patched": settings_patched,
        "cache_flushed": cache_flushed,
        "bindings_set": bindings_set,
        "bindings_removed": bindings_removed,
    }


async def toggle_engine(
    engine: EdgeEngine,
    is_active: bool,
    db: Session,
) -> bool:
    """True enable/disable for an engine.
    
    1. Updates the DB flag (is_active) so publishes stop/resume.
    2. Pushes FRONTBASE_DISABLED env var to the engine so it returns 503 HTTP responses.
    3. Redeploys if necessary (Vercel/Netlify).
    """
    # 1. Update DB
    engine.is_active = is_active # type: ignore[assignment]
    engine.updated_at = datetime.utcnow().isoformat() # type: ignore[assignment]
    db.commit()
    db.refresh(engine)

    # 2. Push FRONTBASE_DISABLED env var
    provider_type = _resolve_provider_type(engine, db)
    if not provider_type:
        return True # Probably local docker, DB toggle is enough

    disabled_val = "false" if is_active else "true"
    new_bindings = {"FRONTBASE_DISABLED": disabled_val}
    settings_patched = False

    if provider_type == 'cloudflare':
        cf_creds = _resolve_cf_credentials(engine, db)
        if cf_creds:
            settings_patched, _, _ = await _patch_cf_settings(cf_creds, new_bindings, partial=True)
    elif provider_type in ('supabase', 'deno', 'vercel', 'netlify'):
        settings_patched = await _push_env_vars(provider_type, engine, db, new_bindings)

        # 3. Redeploy if provider requires it
        if provider_type in NEEDS_REDEPLOY_FOR_ENV:
            try:
                await engine_deploy.redeploy(engine, db)
                print(f"[Toggle] Redeployed {provider_type} engine '{engine.name}' for FRONTBASE_DISABLED={disabled_val}")
            except Exception as e:
                print(f"[Toggle] Redeploy failed for {provider_type} engine '{engine.name}': {e}")
                settings_patched = False

    if not is_active:
        # Best effort flush to clear out any cached pages that might still serve
        await engine_deploy._flush_cache(engine, str(engine.url).rstrip('/'))

    return settings_patched
