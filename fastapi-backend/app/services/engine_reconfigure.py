"""
Engine Reconfigure Service — Live binding updates without full redeployment.

Extracted from edge_engines.py router for single-responsibility compliance.
Uses the CF Settings API PATCH to update bindings, preserving non-Frontbase bindings.

Follows the same pattern as engine_deploy.py and engine_test.py.
"""

import json
import httpx

from sqlalchemy.orm import Session
from ..models.models import EdgeEngine, EdgeProviderAccount
from ..services.secrets_builder import build_engine_secrets, FRONTBASE_BINDING_NAMES
from ..services import engine_deploy
from ..schemas.edge_engines import ReconfigureRequest
from datetime import datetime


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


async def _patch_cf_settings(
    cf_creds: dict,
    new_bindings: dict[str, str],
) -> tuple[bool, list[str], list[str]]:
    """PATCH CF Worker settings with new Frontbase bindings.
    
    Preserves all non-Frontbase bindings. Returns (patched, bindings_set, bindings_removed).
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

            # Filter out Frontbase-managed bindings (we'll replace them)
            preserved_bindings = [
                b for b in existing_bindings
                if b.get("name") not in FRONTBASE_BINDING_NAMES
            ]

            # Track what we're removing
            existing_fb_names = {
                b.get("name") for b in existing_bindings
                if b.get("name") in FRONTBASE_BINDING_NAMES
            }
            bindings_removed: list[str] = [str(n) for n in existing_fb_names - set(new_bindings.keys())]

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
    
    1. Resolve CF credentials
    2. Build new bindings from DB/cache/queue selections
    3. PATCH CF Worker settings (preserving non-Frontbase bindings)
    4. Update local DB record
    5. Flush edge cache on target
    """
    # 1. Resolve CF credentials
    cf_creds = _resolve_cf_credentials(engine, db)

    # Resolve deploy provider for dual-path secrets
    deploy_provider: str | None = None
    if engine.edge_provider_id is not None:
        prov = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == engine.edge_provider_id
        ).first()
        if prov:
            deploy_provider = str(prov.provider)

    # 2. Build new bindings
    new_bindings = build_engine_secrets(
        db,
        edge_db_id=payload.edge_db_id,
        edge_cache_id=payload.edge_cache_id,
        edge_queue_id=payload.edge_queue_id,
        deploy_provider=deploy_provider,
    )

    # 3. For non-CF providers, update DB FIRST then redeploy
    # (redeploy reads edge_cache_id / edge_queue_id from the engine record)
    settings_patched = False
    bindings_set = list(new_bindings.keys())
    bindings_removed: list[str] = []

    # 4. Update local DB record (must happen BEFORE redeploy for non-CF engines)
    engine.edge_db_id = payload.edge_db_id  # type: ignore[assignment]
    engine.edge_cache_id = payload.edge_cache_id  # type: ignore[assignment]
    engine.edge_queue_id = payload.edge_queue_id  # type: ignore[assignment]
    engine.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()
    db.refresh(engine)

    if cf_creds:
        settings_patched, bindings_set, bindings_removed = await _patch_cf_settings(
            cf_creds, new_bindings
        )
    elif engine.edge_provider_id is not None:
        # Non-CF providers: trigger redeploy to push new secrets
        # (Supabase, Vercel, Netlify, Deno, Upstash all set secrets during deploy)
        prov = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == engine.edge_provider_id
        ).first()
        provider_label = str(prov.provider).capitalize() if prov else "Unknown"
        try:
            await engine_deploy.redeploy(engine, db)
            settings_patched = True
            print(f"[Reconfigure] Redeployed {provider_label} engine '{engine.name}' to push new bindings")
        except Exception as e:
            print(f"[Reconfigure] Redeploy failed for {provider_label} engine '{engine.name}': {e}")

    # 5. Flush edge cache on target
    cache_flushed = await engine_deploy._flush_cache(str(engine.url).rstrip('/'))

    return {
        "success": True,
        "settings_patched": settings_patched,
        "cache_flushed": cache_flushed,
        "bindings_set": bindings_set,
        "bindings_removed": bindings_removed,
    }
