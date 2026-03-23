"""
Engine Manifest Sync — Fetch and apply /api/manifest from running engines.

Extracted from routers/edge_engines.py for SRP compliance.
"""

from datetime import datetime
import uuid
import httpx

from sqlalchemy.orm import Session
from ..models.models import EdgeEngine, EdgeGPUModel


async def sync_engine_manifest(engine: EdgeEngine, db: Session) -> dict:
    """Fetch /api/manifest from a running engine and sync GPU models + metadata.

    Called:
    - After importing a worker (auto-populate GPU model badges)
    - After deploy/redeploy (update manifest-derived metadata)
    - Manually via the UI (re-sync)

    Silent on failure — engine might not be a Frontbase engine.
    """
    engine_url = str(engine.url or "").rstrip("/")
    if not engine_url:
        return {"synced": False, "reason": "No engine URL configured"}

    # Fetch manifest from the running engine
    try:
        from ..services.edge_client import get_edge_headers
        auth_headers = get_edge_headers(engine)
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{engine_url}/api/manifest", headers=auth_headers)
            if resp.status_code != 200:
                return {"synced": False, "reason": f"Manifest returned {resp.status_code}"}
            manifest = resp.json()
    except Exception as e:
        return {"synced": False, "reason": f"Could not reach engine: {str(e)}"}

    engine_id = str(engine.id)
    now = datetime.utcnow().isoformat()
    synced_models: list[str] = []

    # Note: adapter_type is NOT synced from manifest — the DB value
    # (set at provision/deploy time) is the source of truth.
    # The manifest's getAdapterType() only recognizes 'cloudflare-lite'
    # and defaults everything else to 'full', which would incorrectly
    # overwrite lite engines on Vercel/Netlify/Deno.
    if manifest.get("deployed_at"):
        engine.last_deployed_at = manifest["deployed_at"]  # type: ignore[assignment]
    if manifest.get("bundle_checksum"):
        engine.content_hash = manifest["bundle_checksum"]  # type: ignore[assignment]

    # --- Sync GPU models ---
    for m in manifest.get("gpu_models", []):
        slug = m.get("slug")
        model_id = m.get("model_id")
        if not slug or not model_id:
            continue

        # Check if this GPU model already exists on this engine
        existing = db.query(EdgeGPUModel).filter(
            EdgeGPUModel.edge_engine_id == engine_id,
            EdgeGPUModel.model_id == model_id,
        ).first()

        if existing:
            existing.slug = slug  # type: ignore[assignment]
            existing.model_type = m.get("model_type", existing.model_type)  # type: ignore[assignment]
            existing.provider = m.get("provider", existing.provider)  # type: ignore[assignment]
            existing.updated_at = now  # type: ignore[assignment]
            synced_models.append(slug)
        else:
            gpu_model = EdgeGPUModel(
                id=str(uuid.uuid4()),
                name=slug,
                slug=slug,
                model_type=m.get("model_type", "Text Generation"),
                provider=m.get("provider", "workers_ai"),
                model_id=model_id,
                endpoint_url=f"{engine_url}/v1/chat/completions",
                edge_engine_id=engine_id,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            db.add(gpu_model)
            synced_models.append(slug)

    db.commit()

    return {
        "synced": True,
        "adapter_type": manifest.get("adapter_type"),
        "capabilities": manifest.get("capabilities", []),
        "gpu_models_synced": synced_models,
        "bindings": manifest.get("bindings", {}),
    }
