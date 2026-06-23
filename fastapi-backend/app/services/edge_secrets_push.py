"""
Edge Secrets Push Service — Encrypt and push per-tenant secrets to a shared
worker's state-DB.

On community/shared workers, per-tenant secret blobs (datasources, and later
auth / agent_profiles / security / storage) are stored as AES-256-GCM
ciphertext rows in the worker's own state-DB (`tenant_secrets`) instead of
being baked into the worker's env vars. This keeps worker env size O(1) as
tenant count grows.

This module is the control-plane half: it
  - derives the per-worker encryption key (FRONTBASE_SECRETS_KEY),
  - AES-256-GCM-encrypts each tenant blob (WebCrypto-compatible),
  - pushes the ciphertext to the authenticated edge endpoint
    POST /api/import/secrets[/batch] (system-key auth, same guard as /api/import),
    and removes it on offboard via DELETE /api/import/secrets.

Cipher format (must match services/edge/src/config/tenantSecrets.ts):
  base64( nonce(12B) || ciphertext || GCM-tag(16B) )
  Key: standard base64 of 32 raw bytes.
"""

import base64
import json
import os
from typing import Any, Literal

import httpx
import sqlalchemy as sa
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine
from ..core.security import decrypt_field, encrypt_field
from .edge_client import get_edge_headers, resolve_engine_url


Kind = Literal['datasources', 'auth', 'agent_profiles', 'security', 'storage']


# =============================================================================
# Per-worker encryption key
# =============================================================================

def _generate_secrets_key() -> str:
    """Generate a new 256-bit key as standard base64 (32 raw bytes)."""
    return base64.b64encode(os.urandom(32)).decode('ascii')


def get_or_create_secrets_key(engine: EdgeEngine, db: Session) -> str:
    """Return the raw (standard base64) per-worker secrets key.

    Stored Fernet-encrypted in engine_config['secrets_key'] (same convention as
    system_key). Generates + persists on first access.
    """
    try:
        cfg = json.loads(str(engine.engine_config or '{}'))
    except (json.JSONDecodeError, TypeError):
        cfg = {}

    encrypted = cfg.get('secrets_key')
    raw_key = decrypt_field(encrypted) if encrypted else None

    if not raw_key:
        raw_key = _generate_secrets_key()
        encrypted_new = encrypt_field(raw_key)
        if encrypted_new:
            cfg['secrets_key'] = encrypted_new
            engine.engine_config = json.dumps(cfg)  # type: ignore[assignment]
            db.commit()

    return str(raw_key)


# =============================================================================
# AES-256-GCM encryption (WebCrypto-compatible)
# =============================================================================

def encrypt_tenant_secret(plaintext_json: Any, secrets_key: str) -> str:
    """Encrypt a tenant secret blob with AES-256-GCM.

    Args:
        plaintext_json: the secret data (JSON-serialized if a dict/str)
        secrets_key: standard base64 of the 32-byte key

    Returns:
        standard base64 of (nonce || ciphertext || GCM tag)
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = base64.b64decode(secrets_key)  # 32 raw bytes
    if len(key) != 32:
        raise ValueError(f"FRONTBASE_SECRETS_KEY must decode to 32 bytes, got {len(key)}")

    aead = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit GCM nonce

    plaintext = (
        json.dumps(plaintext_json)
        if not isinstance(plaintext_json, str)
        else plaintext_json
    )
    ciphertext = aead.encrypt(nonce, plaintext.encode('utf-8'), None)

    return base64.b64encode(nonce + ciphertext).decode('ascii')


# =============================================================================
# Edge URL + auth helpers
# =============================================================================

def _edge_endpoint(engine: EdgeEngine, path: str) -> str:
    return f"{resolve_engine_url(engine).rstrip('/')}{path}"


# =============================================================================
# Single / batch push
# =============================================================================

async def push_tenant_secret(
    engine: EdgeEngine,
    tenant_slug: str,
    kind: Kind,
    payload_plaintext: Any,
    db: Session,
) -> bool:
    """Encrypt and push a single tenant secret. Returns True on success."""
    secrets_key = get_or_create_secrets_key(engine, db)
    try:
        ciphertext = encrypt_tenant_secret(payload_plaintext, secrets_key)
    except Exception as e:
        print(f"[SecretsPush] Encryption failed for {tenant_slug}/{kind}: {e}")
        return False

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _edge_endpoint(engine, '/api/import/secrets'),
                headers=get_edge_headers(engine),
                json={"tenantSlug": tenant_slug, "kind": kind, "payload": ciphertext},
            )
            resp.raise_for_status()
            print(f"[SecretsPush] Pushed {kind} for tenant {tenant_slug}")
            return True
    except httpx.HTTPError as e:
        print(f"[SecretsPush] Push failed for {tenant_slug}/{kind}: {e}")
        return False


async def push_tenant_secrets_batch(
    engine: EdgeEngine,
    secrets: list[dict],  # [{tenantSlug, kind, payload(plaintext)}, ...]
    db: Session,
) -> list[dict]:
    """Encrypt and push many tenant secrets in one batch HTTP call.

    Returns the per-item results: [{tenantSlug, kind, success, error?}].
    """
    if not secrets:
        return []

    secrets_key = get_or_create_secrets_key(engine, db)

    encrypted_items: list[dict] = []
    for item in secrets:
        try:
            ciphertext = encrypt_tenant_secret(item['payload'], secrets_key)
            encrypted_items.append({
                "tenantSlug": item['tenantSlug'],
                "kind": item['kind'],
                "payload": ciphertext,
            })
        except Exception as e:
            print(f"[SecretsPush] Encryption failed for {item.get('tenantSlug')}/{item.get('kind')}: {e}")

    if not encrypted_items:
        return []

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                _edge_endpoint(engine, '/api/import/secrets/batch'),
                headers=get_edge_headers(engine),
                json={"secrets": encrypted_items},
            )
            resp.raise_for_status()
            body = resp.json()
            return body.get('results', [])
    except httpx.HTTPError as e:
        print(f"[SecretsPush] Batch push failed: {e}")
        # Surface a failure for every item so callers can retry.
        return [
            {"tenantSlug": i["tenantSlug"], "kind": i["kind"], "success": False, "error": str(e)}
            for i in encrypted_items
        ]


# =============================================================================
# Delete (offboard)
# =============================================================================

async def delete_tenant_secret(
    engine: EdgeEngine,
    tenant_slug: str,
    kind: Kind,
) -> bool:
    """Delete a tenant secret blob from the worker's state-DB."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.delete(
                _edge_endpoint(engine, '/api/import/secrets'),
                headers=get_edge_headers(engine),
                params={"tenantSlug": tenant_slug, "kind": kind},
            )
            resp.raise_for_status()
            return True
    except httpx.HTTPError as e:
        print(f"[SecretsPush] Delete failed for {tenant_slug}/{kind}: {e}")
        return False


# =============================================================================
# Orchestrator: sync all bound tenants for a shared engine
# =============================================================================

def _tenants_bound_to_engine(engine: EdgeEngine, db: Session) -> list[tuple[str, str]]:
    """Return [(tenant_id, tenant_slug), ...] for tenants with datasources
    bound to this engine.

    Chain: engine_datasources → Datasource.project_id → Project.tenant_id → Tenant.
    """
    from app.models.edge import engine_datasources
    from app.services.sync.models.datasource import Datasource
    from app.models.auth import Project
    from app.models.tenant import Tenant

    bound_ids = db.execute(
        sa.select(engine_datasources.c.datasource_id).where(
            engine_datasources.c.engine_id == str(engine.id)
        )
    ).scalars().all()
    if not bound_ids:
        return []

    datasources = db.query(Datasource).filter(Datasource.id.in_(bound_ids)).all()
    project_ids = {ds.project_id for ds in datasources if ds.project_id}
    if not project_ids:
        return []

    projects = db.query(Project).filter(Project.id.in_(project_ids)).all()
    tenant_ids = {p.tenant_id for p in projects if p.tenant_id}
    if not tenant_ids:
        return []

    tenants = db.query(Tenant).filter(Tenant.id.in_(tenant_ids)).all()
    return [(str(t.id), str(t.slug)) for t in tenants if t.slug]


async def sync_shared_engine_tenant_secrets(engine: EdgeEngine, db: Session) -> dict:
    """Push the current per-tenant datasources blob for every tenant bound to
    a shared engine.

    Best-effort and non-fatal: called after a successful deploy so the state-DB
    is populated before/at the time the trimmed env takes effect. A push
    failure is logged but never fails the deploy.

    Returns a small summary: {shared, tenants, results}.
    """
    if not bool(engine.is_shared):
        return {"shared": False, "tenants": 0, "results": []}

    # Lazy import to avoid a circular dependency (secrets_builder → models).
    from .secrets_builder import build_tenant_secret_blobs

    tenants = _tenants_bound_to_engine(engine, db)
    if not tenants:
        return {"shared": True, "tenants": 0, "results": []}

    items: list[dict] = []
    for tenant_id, tenant_slug in tenants:
        blobs = build_tenant_secret_blobs(db, str(engine.id), tenant_id, kinds={'datasources'})
        for kind, plaintext in blobs.items():
            items.append({"tenantSlug": tenant_slug, "kind": kind, "payload": plaintext})

    if not items:
        return {"shared": True, "tenants": len(tenants), "results": []}

    try:
        results = await push_tenant_secrets_batch(engine, items, db)
        ok = sum(1 for r in results if r.get('success'))
        print(f"[SecretsPush] Synced {ok}/{len(items)} secret(s) across {len(tenants)} tenant(s) "
              f"on shared engine {engine.name}")
        return {"shared": True, "tenants": len(tenants), "results": results}
    except Exception as e:
        # Never let a sync failure break a deploy.
        import traceback
        traceback.print_exc()
        print(f"[SecretsPush] Sync failed for engine {engine.name}: {e}")
        return {"shared": True, "tenants": len(tenants), "results": [], "error": str(e)}
