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
import uuid
from datetime import datetime, UTC
from typing import Any, Literal

import httpx
import sqlalchemy as sa
from sqlalchemy.orm import Session

from ..models.models import EdgeEngine
from ..core.security import decrypt_field, encrypt_field
from .edge_client import get_edge_headers, resolve_engine_url


Kind = Literal['datasources', 'auth', 'agent_profiles', 'security', 'storage']


# =============================================================================
# engine_config helpers
# =============================================================================

def _engine_config(engine: EdgeEngine) -> dict:
    """Parse engine_config JSON into a dict (never raises)."""
    try:
        return json.loads(str(engine.engine_config or '{}'))
    except (json.JSONDecodeError, TypeError):
        return {}


def _save_engine_config(engine: EdgeEngine, cfg: dict, db: Session) -> None:
    """Persist an updated engine_config dict and commit."""
    engine.engine_config = json.dumps(cfg)  # type: ignore[assignment]
    db.commit()


# =============================================================================
# Per-worker encryption key
# =============================================================================

def _generate_secrets_key() -> str:
    """Generate a new 256-bit key as standard base64 (32 raw bytes)."""
    return base64.b64encode(os.urandom(32)).decode('ascii')


# HKDF domain-separation constants (RFC 5869). The system_key is already
# per-engine unique (see edge_client.generate_system_key), so a fixed salt
# yields a per-engine derived key without the edge needing to know its
# engine_id — it derives locally from the system_key it already holds.
_HKDF_SALT = b'frontbase-secrets-v2'
_HKDF_INFO = b'aes-256-gcm'


def derive_secrets_key_from_system_key(system_key: str) -> str:
    """Derive a 256-bit AES-GCM key from the engine's system_key via HKDF-SHA256.

    Deterministic: the same system_key always yields the same derived key, so
    both the control plane (encrypt at push time) and the edge worker (decrypt
    at request time, deriving locally from its own system_key) agree without a
    shared stored secret.

    Args:
        system_key: the raw (decrypted) engine system_key string.

    Returns:
        standard base64 of the 32-byte derived key (frontable by AES-GCM and
        WebCrypto alike — matches services/edge/src/config/tenantSecrets.ts).
    """
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_HKDF_SALT,
        info=_HKDF_INFO,
    )
    derived = hkdf.derive(system_key.encode('utf-8'))
    return base64.b64encode(derived).decode('ascii')


def get_or_create_secrets_key(engine: EdgeEngine, db: Session) -> str:
    """Return the raw (standard base64) per-worker RANDOM secrets key.

    Stored Fernet-encrypted in engine_config['secrets_key'] (same convention as
    system_key). Generates + persists on first access. This is the legacy /
    non-HKDF path; new engines may opt into HKDF via engine_config['use_hkdf']
    (see resolve_secrets_key), which derives deterministically and stores nothing.
    """
    cfg = _engine_config(engine)

    encrypted = cfg.get('secrets_key')
    raw_key = decrypt_field(encrypted) if encrypted else None

    if not raw_key:
        raw_key = _generate_secrets_key()
        encrypted_new = encrypt_field(raw_key)
        if encrypted_new:
            cfg['secrets_key'] = encrypted_new
            _save_engine_config(engine, cfg, db)

    return str(raw_key)


def resolve_secrets_key(engine: EdgeEngine, db: Session) -> str:
    """Canonical resolver for the per-worker AES-GCM key.

    - engine_config['use_hkdf'] == True → derive from the engine's system_key
      (deterministic, nothing stored). Used by V2 HKDF engines.
    - otherwise → the persisted random key (get_or_create_secrets_key).

    All encrypt/push paths must call this so HKDF and random-key engines are
    transparently supported.
    """
    cfg = _engine_config(engine)
    if cfg.get('use_hkdf'):
        encrypted_sys = cfg.get('system_key')
        if not encrypted_sys:
            raise ValueError("use_hkdf is set but engine_config has no system_key")
        system_key = decrypt_field(encrypted_sys)
        if not system_key:
            raise ValueError("Could not decrypt system_key for HKDF key derivation")
        return derive_secrets_key_from_system_key(str(system_key))
    return get_or_create_secrets_key(engine, db)


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


def decrypt_tenant_secret(ciphertext_b64: str, secrets_key: str) -> str:
    """Decrypt a tenant secret blob with AES-256-GCM (inverse of encrypt_tenant_secret).

    Used during key rotation dry-run verification and diagnostics. Raises on
    tamper / wrong key (GCM auth-tag failure) — callers catch.
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = base64.b64decode(secrets_key)
    if len(key) != 32:
        raise ValueError(f"secrets_key must decode to 32 bytes, got {len(key)}")

    raw = base64.b64decode(ciphertext_b64)
    if len(raw) < 13:
        raise ValueError('ciphertext too short')

    nonce = raw[:12]
    encrypted = raw[12:]
    aead = AESGCM(key)
    plaintext = aead.decrypt(nonce, encrypted, None)
    return plaintext.decode('utf-8')


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
    secrets_key = resolve_secrets_key(engine, db)
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

    secrets_key = resolve_secrets_key(engine, db)

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


# =============================================================================
# V2 — Key Rotation (HKDF + graceful transition)
# =============================================================================
#
# Rotation re-encrypts every tenant secret under a NEW per-worker key while the
# OLD key stays valid for a transition window, so no tenant request fails.
#
# Flow:
#   1. resolve OLD key (current) + count affected tenants (authoritative: DB)
#   2. generate NEW key (random, or HKDF-derived from system_key)
#   3. persist: new key active, old key kept as secrets_key_old, rotation metadata
#   4. redeploy → worker gets FRONTBASE_SECRETS_KEY=new + FRONTBASE_SECRETS_KEY_OLD=old,
#      then sync re-pushes all ciphertext re-encrypted with the new key. During the
#      brief window before the re-push lands, old ciphertext still decrypts via KEY_OLD.
#   5. after window_seconds, prune_expired_rotation() drops secrets_key_old so the
#      next deploy stops emitting KEY_OLD (lazy, invoked at the top of redeploy).
#
# Zero downtime, and atomic w.r.t. the control plane: the engine_config flip to
# the new key happens only after the new key is generated; the redeploy is the
# single deploy that propagates it. A failed redeploy leaves the old key active.

def _build_rotation_items(engine: EdgeEngine, db: Session) -> list[dict]:
    """Rebuild the plaintext tenant-secret items that will be re-encrypted.

    Authoritative source = control-plane DB (same path as
    sync_shared_engine_tenant_secrets). We rebuild from DB rather than
    round-tripping edge ciphertext so rotation reflects the latest secret state.
    """
    from .secrets_builder import build_tenant_secret_blobs

    items: list[dict] = []
    tenants = _tenants_bound_to_engine(engine, db)
    for tenant_id, tenant_slug in tenants:
        blobs = build_tenant_secret_blobs(db, str(engine.id), tenant_id, kinds={'datasources'})
        for kind, plaintext in blobs.items():
            items.append({"tenantSlug": tenant_slug, "kind": kind, "payload": plaintext})
    return items


async def fetch_all_tenant_secrets(engine: EdgeEngine) -> list[dict]:
    """Read back ALL tenant_secrets rows (ciphertext) from a worker's state-DB.

    Diagnostics / dry-run verification for rotation (GET /api/import/secrets,
    system-key auth). Returns [] on failure (best-effort, never raises).
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                _edge_endpoint(engine, '/api/import/secrets'),
                headers=get_edge_headers(engine),
            )
            resp.raise_for_status()
            body = resp.json()
            return body.get('secrets', []) if isinstance(body, dict) else []
    except httpx.HTTPError as e:
        print(f"[SecretsRotation] Fetch-all failed for engine {getattr(engine, 'name', '?')}: {e}")
        return []


async def rotate_secrets_key(
    engine: EdgeEngine,
    db: Session,
    strategy: Literal['random', 'hkdf'] = 'random',
    window_seconds: int = 300,
    dry_run: bool = False,
) -> dict:
    """Rotate a shared engine's per-worker secrets key.

    Args:
        strategy: 'random' (new random 256-bit key) or 'hkdf' (derive from the
            engine's system_key; also flips engine_config['use_hkdf']=True).
        window_seconds: transition window during which the old key stays valid.
        dry_run: validate + plan only — no mutations, no deploy.

    Returns a status dict. Raises ValueError on bad input / preconditions.
    """
    if not bool(engine.is_shared):
        raise ValueError("Key rotation only applies to shared/community engines")
    if window_seconds < 0:
        raise ValueError("window_seconds must be >= 0")

    cfg = _engine_config(engine)

    # 1. Resolve the current (soon-to-be-old) key.
    old_key = resolve_secrets_key(engine, db)

    # 2. Count affected tenants (authoritative: control-plane DB).
    tenants_count = len(_tenants_bound_to_engine(engine, db))

    # 3. Generate the new key.
    if strategy == 'hkdf':
        encrypted_sys = cfg.get('system_key')
        if not encrypted_sys:
            raise ValueError("strategy=hkdf requires a system_key in engine_config")
        system_key = decrypt_field(encrypted_sys)
        if not system_key:
            raise ValueError("Could not decrypt system_key for HKDF rotation")
        new_key = derive_secrets_key_from_system_key(str(system_key))
    else:
        new_key = _generate_secrets_key()

    rotation_id = uuid.uuid4().hex
    new_version = int(cfg.get('key_version', 1)) + 1
    old_version = new_version - 1

    # Sanity: rotating must actually change the key (hkdf from an unchanged
    # system_key is deterministic — flag it so callers know nothing changed).
    key_changed = new_key != old_key

    if dry_run:
        return {
            "status": "dry_run",
            "rotation_id": rotation_id,
            "old_key_version": old_version,
            "new_key_version": new_version,
            "tenants_affected": tenants_count,
            "strategy": strategy,
            "window_seconds": window_seconds,
            "key_changed": key_changed,
        }

    # 4. Persist: new key active, old key retained for the transition window.
    if strategy == 'hkdf':
        # HKDF derives from system_key — no random key to store. Drop any legacy
        # random key and switch the resolver to HKDF mode.
        cfg.pop('secrets_key', None)
        cfg['use_hkdf'] = True
    else:
        encrypted_new = encrypt_field(new_key)
        if encrypted_new:
            cfg['secrets_key'] = encrypted_new

    encrypted_old = encrypt_field(old_key)
    if encrypted_old:
        cfg['secrets_key_old'] = encrypted_old

    cfg['key_version'] = new_version
    started_at = datetime.now(UTC)
    cfg['rotation'] = {
        "id": rotation_id,
        "started_at": started_at.isoformat() + "Z",
        "strategy": strategy,
        "window_seconds": window_seconds,
        "status": "transitioning",
        "new_key_version": new_version,
        "old_key_version": old_version,
    }
    _save_engine_config(engine, cfg, db)

    # 5. Redeploy: propagates new+old keys as env and re-pushes ciphertext
    #    re-encrypted with the new key (via the deploy's post-sync step).
    from .engine_deploy import redeploy
    deploy_result = await redeploy(engine, db)

    print(f"[SecretsRotation] Rotated engine {getattr(engine, 'name', '?')} "
          f"v{old_version}→v{new_version} ({strategy}), {tenants_count} tenant(s)")

    return {
        "status": "completed",
        "rotation_id": rotation_id,
        "old_key_version": old_version,
        "new_key_version": new_version,
        "tenants_affected": tenants_count,
        "strategy": strategy,
        "window_seconds": window_seconds,
        "key_changed": key_changed,
        "deploy": deploy_result,
    }


def prune_expired_rotation(engine: EdgeEngine, db: Session) -> bool:
    """Drop the transition (old) key once its window has elapsed.

    Lazy cleanup invoked at the top of redeploy: if the rotation window expired,
    remove secrets_key_old + rotation metadata so the next build_engine_secrets
    stops emitting FRONTBASE_SECRETS_KEY_OLD. Returns True if a rotation was pruned.
    """
    cfg = _engine_config(engine)
    rotation = cfg.get('rotation')
    if not rotation:
        return False

    started_at = rotation.get('started_at')
    window = int(rotation.get('window_seconds', 0) or 0)
    if not started_at or window <= 0:
        return False

    try:
        started = datetime.fromisoformat(str(started_at).rstrip('Z'))
    except ValueError:
        return False

    if (datetime.now(UTC) - started).total_seconds() < window:
        return False  # still inside the transition window

    cfg.pop('secrets_key_old', None)
    cfg.pop('rotation', None)
    _save_engine_config(engine, cfg, db)
    print(f"[SecretsRotation] Pruned expired transition key for engine "
          f"{getattr(engine, 'name', '?')}")
    return True


def get_rotation_status(engine: EdgeEngine) -> dict:
    """Report the current rotation state for an engine (no I/O)."""
    cfg = _engine_config(engine)
    rotation = cfg.get('rotation')

    base = {
        "active": False,
        "key_version": cfg.get('key_version', 1),
        "use_hkdf": bool(cfg.get('use_hkdf')),
    }
    if not rotation:
        return base

    started_at = rotation.get('started_at')
    window = int(rotation.get('window_seconds', 0) or 0)
    remaining: int | None = None
    if started_at and window > 0:
        try:
            started = datetime.fromisoformat(str(started_at).rstrip('Z'))
            remaining = max(0, window - int((datetime.now(UTC) - started).total_seconds()))
        except ValueError:
            pass

    return {
        "active": True,
        "rotation_id": rotation.get('id'),
        "strategy": rotation.get('strategy'),
        "status": rotation.get('status'),
        "started_at": started_at,
        "new_key_version": rotation.get('new_key_version'),
        "old_key_version": rotation.get('old_key_version'),
        "window_seconds": window,
        "remaining_seconds": remaining,
        "use_hkdf": bool(cfg.get('use_hkdf')),
        "key_version": cfg.get('key_version', rotation.get('new_key_version', 1)),
    }
