"""
Edge Client — Centralized helper for FastAPI → Edge Engine HTTP calls.

Provides:
- `get_edge_headers(engine)` — auth headers for calling an edge engine
- `generate_system_key()` — create a new system key
- `inject_system_key(engine_config_json)` — inject a system key into engine_config JSON

Used by: engine_deploy, actions, pages/crud, edge_engines, engine_manifest,
engine_test, engine_reconfigure, engine_provisioner, cloudflare.
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


def resolve_engine_url(engine: object) -> str:
    """Get the actual HTTP-reachable URL for an engine.

    When a wildcard custom domain (e.g. *.frontbase.dev) is set,
    engine.url becomes unresolvable by DNS.  Fall back to the
    concrete original URL saved by domain_manager._save_custom_domain().

    Used by ALL backend→engine HTTP calls: publish, health check,
    unpublish, settings sync, workflow deploy, manifest sync, etc.
    """
    url = str(getattr(engine, 'url', '') or '')
    if not url:
        return ''
    # Normal URL — use as-is
    if '://*.' not in url:
        return url
    # Wildcard detected — read original_url from engine_config
    config_str = getattr(engine, 'engine_config', None)
    if config_str:
        try:
            cfg = json.loads(str(config_str))
            original = cfg.get('original_url')
            if original:
                return str(original)
        except (json.JSONDecodeError, TypeError):
            pass
    # Last resort: replace * with a concrete subdomain
    return url.replace('://*.', '://_edge.')
