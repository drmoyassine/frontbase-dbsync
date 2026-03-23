"""
Engine Serializer — Converts EdgeEngine ORM objects to API response dicts.

Extracted from edge_engines router to keep the router thin.
Handles:
- engine_config JSON parsing
- Drift/staleness detection (bundle_checksum vs current hash)
- GPU model serialization
- Related name resolution (DB, cache, queue, provider)
"""

import json
from ..models.models import EdgeEngine
from ..services.bundle import get_source_hash


# =============================================================================
# Public API
# =============================================================================

def serialize_engine(engine: EdgeEngine, current_hashes: dict | None = None) -> dict:
    """Serialize an EdgeEngine ORM object, parsing engine_config JSON.

    current_hashes: optional {"lite": "abc...", "full": "def..."} to compute is_outdated.
    """
    config = None
    if engine.engine_config is not None:
        try:
            config = json.loads(str(engine.engine_config))
        except (json.JSONDecodeError, TypeError):
            config = None

    edge_db_name = None
    if engine.edge_database:
        edge_db_name = str(engine.edge_database.name)

    edge_cache_name = None
    if engine.edge_cache:
        edge_cache_name = str(engine.edge_cache.name)

    edge_queue_name = None
    if engine.edge_queue:
        edge_queue_name = str(engine.edge_queue.name)

    provider_name = None
    if engine.edge_provider:
        provider_name = str(engine.edge_provider.provider)

    # Drift detection fields
    bundle_checksum_val = str(engine.bundle_checksum) if engine.bundle_checksum is not None else None
    config_checksum_val = str(engine.config_checksum) if engine.config_checksum is not None else None
    last_deployed_at_val = str(engine.last_deployed_at) if engine.last_deployed_at is not None else None
    last_synced_at_val = str(engine.last_synced_at) if engine.last_synced_at is not None else None

    # Compute sync_status
    sync_status = "unknown"
    if bundle_checksum_val and last_deployed_at_val:
        sync_status = "synced"  # Assume synced until proven otherwise

    # Compute is_outdated by comparing deployed hash against current dist hash
    # Forked engines are NOT outdated — they have custom code
    is_outdated = False
    is_engine_forked = bool(engine.is_forked) if hasattr(engine, 'is_forked') else False
    if current_hashes and not is_engine_forked:
        adapter = str(engine.adapter_type) if engine.adapter_type is not None else "automations"
        is_full = adapter == "full"
        current_hash = current_hashes.get("full" if is_full else "lite")

        if not bundle_checksum_val:
            if engine.edge_provider_id is not None and not getattr(engine, 'is_system', False):
                is_outdated = True
                sync_status = "stale"
        elif current_hash and current_hash != bundle_checksum_val:
            is_outdated = True
            sync_status = "stale"

    # GPU models — multiple models per engine supported
    gpu_models_data = [
        {
            "id": str(m.id),
            "name": str(m.name),
            "slug": str(m.slug),
            "model_id": str(m.model_id),
            "model_type": str(m.model_type),
            "endpoint_url": str(m.endpoint_url) if m.endpoint_url else None,
        }
        for m in (engine.gpu_models or [])
    ]

    return {
        "id": str(engine.id),
        "name": str(engine.name),
        "edge_provider_id": str(engine.edge_provider_id) if engine.edge_provider_id is not None else None,
        "provider": provider_name,
        "adapter_type": str(engine.adapter_type),
        "url": str(engine.url),
        "edge_db_id": str(engine.edge_db_id) if engine.edge_db_id is not None else None,
        "edge_db_name": edge_db_name,
        "edge_cache_id": str(engine.edge_cache_id) if engine.edge_cache_id is not None else None,
        "edge_cache_name": edge_cache_name,
        "edge_queue_id": str(engine.edge_queue_id) if engine.edge_queue_id is not None else None,
        "edge_queue_name": edge_queue_name,
        "engine_config": config,
        "gpu_models": gpu_models_data,
        "is_active": bool(engine.is_active),
        "is_system": bool(engine.is_system),
        "is_imported": bool(engine.is_imported) if hasattr(engine, 'is_imported') else False,
        "bundle_checksum": bundle_checksum_val,
        "config_checksum": config_checksum_val,
        "last_deployed_at": last_deployed_at_val,
        "last_synced_at": last_synced_at_val,
        "sync_status": sync_status,
        "is_outdated": is_outdated,
        "is_forked": is_engine_forked,
        "modified_core_files": json.loads(str(engine.modified_core_files)) if getattr(engine, 'modified_core_files', None) else [],
        "created_at": str(engine.created_at),
        "updated_at": str(engine.updated_at),
    }


def get_current_hashes() -> dict:
    """Get current source hashes for drift detection."""
    source_hash = get_source_hash()
    return {"lite": source_hash, "full": source_hash}
