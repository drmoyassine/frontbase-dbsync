"""
Edge Client — Centralized helper for FastAPI → Edge Engine HTTP calls.

Provides:
- `get_edge_headers(engine)` — auth headers for calling an edge engine
- `generate_system_key()` — create a new system key
- `inject_system_key(engine_config_json)` — inject a system key into engine_config JSON

Used by: engine_deploy, actions, pages/crud, edge_engines, engine_manifest,
engine_test, engine_reconfigure, upstash_deploy_api, engine_provisioner, cloudflare.
"""

import json
import secrets as secrets_mod
from ..core.security import decrypt_field, encrypt_field


def generate_system_key() -> str:
    """Generate a new system key for an edge engine."""
    return f"fb_sys_{secrets_mod.token_hex(32)}"


def inject_system_key(engine_config_json: str | None) -> str:
    """Inject an encrypted system key into engine_config JSON string.
    
    If the config already has a system_key, it is preserved.
    Returns the updated JSON string.
    """
    try:
        cfg = json.loads(engine_config_json or '{}')
    except (json.JSONDecodeError, TypeError):
        cfg = {}
    
    if 'system_key' not in cfg:
        raw_key = generate_system_key()
        encrypted = encrypt_field(raw_key)
        if encrypted:
            cfg['system_key'] = encrypted
    
    return json.dumps(cfg)


def get_edge_headers(engine: object) -> dict[str, str]:
    """Build auth headers for calling an edge engine.
    
    Reads the encrypted system key from engine_config JSON,
    decrypts it, and returns {'x-system-key': raw_key}.
    Returns empty dict if no system key is configured (dev mode).
    """
    headers: dict[str, str] = {}
    config_str = getattr(engine, 'engine_config', None)
    if not config_str:
        return headers
    try:
        cfg = json.loads(str(config_str))
        encrypted_key = cfg.get('system_key')
        if encrypted_key:
            raw_key = decrypt_field(encrypted_key)
            if raw_key:
                headers['x-system-key'] = raw_key
    except (json.JSONDecodeError, TypeError):
        pass
    return headers
