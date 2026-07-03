"""
Portable engine-move manifest builder (+ the matched pack/unpack secret shuttle).

``build_manifest`` walks an engine's dependency closure (see :mod:`engine_closure`),
projects every row into a plain dict, and **decrypts every at-rest secret with the
local ``FERNET_KEY``** so the manifest travels as plaintext — protected in transit
solely by the envelope (see :mod:`engine_bundle`). Import (Step 4) re-encrypts each
secret with the target key.

Secret shuttle
--------------
Encrypted material lives in three shapes across the schema:
  - scalar Fernet columns (``db_token``, ``password_encrypted``, ``api_key`` …),
  - a single Fernet blob holding a JSON dict (``EdgeProviderAccount.provider_credentials``),
  - JSON TEXT columns that may contain nested Fernet values (``engine_config.system_key``,
    ``provider_config.scoped_token_value``, ``extra_config`` …).

The first two are handled explicitly per entity. The third is handled generically by
:func:`_pack_value` / :func:`_unpack_value`: on export, any string that looks like a
Fernet token (``gAAAA…``) is decrypted and wrapped in a sentinel; on import the sentinel
is re-encrypted with the target key. This preserves CF scoped tokens, GPU keys, and any
future nested secret without per-field knowledge.

⚠️ The manifest dict contains live plaintext secrets. Never log it; pass it straight to
``engine_bundle.seal`` and let it go out of scope.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..config.edition import is_cloud
from ..core.security import (
    decrypt_credentials,
    decrypt_field,
    encrypt_field,
    is_encrypted,
)
from .engine_bundle import generate_move_secret
from .engine_closure import Closure, build_closure

#: Version of the *manifest* shape (independent of the envelope's SCHEMA_VERSION).
#: Bump when the manifest structure changes; import rejects mismatches.
MANIFEST_SCHEMA_VERSION = 1

#: Sentinel marking a transit-decrypted secret inside a JSON blob.
_ENC_SENTINEL = "$fbenc"


# ── Secret shuttle ────────────────────────────────────────────────────────

def _pack_value(v: Any) -> Any:
    """Export side: decrypt any Fernet token inline, recursing into dicts/lists.

    A Fernet string → ``{"$fbenc": <plaintext>}``; dicts/lists recurse; all else
    passes through. Reverse is :func:`_unpack_value` (used by import in Step 4).
    """
    if isinstance(v, str):
        if is_encrypted(v):
            try:
                return {_ENC_SENTINEL: decrypt_field(v)}
            except Exception:
                return v  # decrypt failed — leave as-is; import treats it as legacy
        return v
    if isinstance(v, dict):
        return {k: _pack_value(val) for k, val in v.items()}
    if isinstance(v, list):
        return [_pack_value(x) for x in v]
    return v


def _unpack_value(v: Any) -> Any:
    """Import side (Step 4): re-encrypt every ``$fbenc`` sentinel with the local key."""
    if isinstance(v, dict):
        if set(v.keys()) == {_ENC_SENTINEL}:
            plain = v[_ENC_SENTINEL]
            return encrypt_field(plain) if plain is not None else None
        return {k: _unpack_value(val) for k, val in v.items()}
    if isinstance(v, list):
        return [_unpack_value(x) for x in v]
    return v


def _parse_json(text: Any) -> Any:
    """Best-effort parse of a JSON TEXT column → dict/list, or None."""
    if text is None or text == "":
        return None
    if isinstance(text, (dict, list)):
        return text
    try:
        return json.loads(str(text))
    except (json.JSONDecodeError, TypeError):
        return None


def _pack_json_text(text: Any) -> Any:
    """Parse a JSON TEXT column and pack nested Fernet values → dict/list/None."""
    parsed = _parse_json(text)
    return _pack_value(parsed) if parsed is not None else None


# ── Per-entity projectors ─────────────────────────────────────────────────

def _project_account(acct: Any, bundle_id: str) -> dict:
    """Connected Account → manifest entry. ``provider_credentials`` is one Fernet blob
    holding a JSON dict → decrypted wholesale into ``secrets``."""
    return {
        "bundle_id": bundle_id,
        "name": str(acct.name),
        "provider": str(acct.provider),
        "is_active": bool(acct.is_active),
        "provider_metadata": _parse_json(acct.provider_metadata),  # non-secret, verbatim
        "secrets": decrypt_credentials(str(acct.provider_credentials or "{}")),
    }


# Secret-bearing scalar columns per infra kind: (manifest_key, model_attr)
_INFRA_SECRET_FIELDS: dict[str, list[tuple[str, str]]] = {
    "database": [("db_token", "db_token")],
    "cache": [("cache_token", "cache_token")],
    "queue": [
        ("queue_token", "queue_token"),
        ("signing_key", "signing_key"),
        ("next_signing_key", "next_signing_key"),
    ],
    "vector": [("vector_token", "vector_token")],
}
_INFRA_URL_FIELD = {
    "database": "db_url",
    "cache": "cache_url",
    "queue": "queue_url",
    "vector": "vector_url",
}
# Infra kind → (ORM model, url attribute). Used by both export projectors and import.
_INFRA_MODEL: dict[str, tuple[Any, str]] = {}  # populated lazily (see _infra_model)


def _project_infra(row: Any, kind: str, acct_ref_for) -> dict | None:
    """Shared infra row (db/cache/queue/vector) → manifest entry. Tokens are scalar
    Fernet columns → packed via the shuttle."""
    if row is None:
        return None
    secrets: dict[str, Any] = {}
    for dest, attr in _INFRA_SECRET_FIELDS[kind]:
        raw = getattr(row, attr, None)
        if raw:
            secrets[dest] = _pack_value(str(raw))
    return {
        "kind": kind,
        "name": str(row.name),
        "provider": str(row.provider),
        "url": str(getattr(row, _INFRA_URL_FIELD[kind])),
        "provider_config": _pack_json_text(row.provider_config),  # may hold scoped tokens
        "is_default": bool(getattr(row, "is_default", False)),
        "provider_account_ref": acct_ref_for(getattr(row, "provider_account_id", None)),
        "secrets": secrets,
    }


def _project_gpu(m: Any) -> dict:
    return {
        "name": str(m.name),
        "slug": str(m.slug),
        "model_type": str(m.model_type),
        "provider": str(m.provider),
        "model_id": str(m.model_id),
        "base_url": str(m.base_url) if m.base_url else None,
        "provider_config": _pack_json_text(m.provider_config),
        "is_active": bool(m.is_active),
        "api_key": _pack_value(str(m.api_key)) if m.api_key else None,  # scalar Fernet
    }


def _project_api_key(k: Any) -> dict:
    # key_hash is either a Fernet-encrypted raw key (gAAAA…) or a legacy SHA-256 hex.
    # _pack_value packs the former and passes the latter through untouched.
    raw_hash = str(k.key_hash) if k.key_hash else None
    return {
        "name": str(k.name),
        "prefix": str(k.prefix),
        "key_hash": _pack_value(raw_hash) if raw_hash else None,
        "scope": str(k.scope) if k.scope else "user",
        "is_active": bool(k.is_active),
        "expires_at": str(k.expires_at) if k.expires_at else None,
    }


def _project_agent(p: Any) -> dict:
    return {
        "name": str(p.name),
        "slug": str(p.slug),
        "system_prompt": p.system_prompt,                       # not secret
        "permissions": _parse_json(p.permissions),              # resource-action map
        "temperature": str(p.temperature) if p.temperature is not None else None,
        "max_tokens": p.max_tokens,
        "top_p": str(p.top_p) if p.top_p is not None else None,
        "excluded_tools": _parse_json(p.excluded_tools),
        "max_auto_tools": p.max_auto_tools,
        "mcp_enabled": bool(p.mcp_enabled),
        "skills_enabled": bool(p.skills_enabled),
    }


def _project_datasource(ds: Any, acct_ref_for) -> dict:
    """Datasource → manifest entry. Carries BOTH the decrypted inline secret columns
    AND the Connected-Account ref (the credential hub). The resolver prefers the
    account and falls back to inline, so we preserve both — legacy rows may have only
    inline creds, and carrying both is forward-compatible with the centralize lockdown.
    """
    secrets: dict[str, Any] = {}
    if ds.password_encrypted:
        secrets["password"] = _pack_value(str(ds.password_encrypted))
    if ds.api_key_encrypted:
        secrets["api_key"] = _pack_value(str(ds.api_key_encrypted))
    if ds.anon_key_encrypted:
        secrets["anon_key"] = _pack_value(str(ds.anon_key_encrypted))
    return {
        "name": str(ds.name),
        "type": str(ds.type.value) if ds.type else None,
        "host": ds.host,
        "port": ds.port,
        "database": ds.database,
        "username": ds.username,
        "api_url": ds.api_url,
        "table_prefix": str(ds.table_prefix) if ds.table_prefix is not None else "wp_",
        "extra_config": _pack_json_text(ds.extra_config),  # may hold webAppSecret (plaintext → no-op)
        "is_active": bool(ds.is_active),
        "secrets": secrets,
        "provider_account_ref": acct_ref_for(getattr(ds, "provider_account_id", None)),
    }


def _project_storage(st: Any, acct_ref_for) -> dict:
    return {
        "name": str(st.name),
        "provider": str(st.provider),
        "config": _pack_json_text(st.config),  # site_id etc.; non-secret → no-op
        "is_active": bool(st.is_active),
        "provider_account_ref": acct_ref_for(getattr(st, "provider_account_id", None)),
    }


def _project_engine(engine: Any, acct_ref_for) -> dict:
    """Engine root. Source-deploy state (url, checksums, deploy timestamps,
    source_snapshot, is_imported/is_shared/is_system/is_managed, ids, project_id,
    timestamps) is dropped — the target redeploys fresh. Infra refs are implicit via
    the manifest's 1:1 ``infra`` block; only the deploy-account ref is explicit."""
    return {
        "name": str(engine.name),
        "adapter_type": str(engine.adapter_type),
        "engine_config": _pack_json_text(engine.engine_config),  # packs system_key
        "edge_provider_ref": acct_ref_for(getattr(engine, "edge_provider_id", None)),
        "edge_auth_id": str(engine.edge_auth_id) if engine.edge_auth_id else None,
    }


# ── Public entry point ────────────────────────────────────────────────────

def build_manifest(engine: Any, db: Session, *, move_secret: str) -> dict:
    """Build the full portable-move manifest for an engine.

    The manifest holds plaintext secrets (decrypted with the local key). The caller
    must pass it directly to ``engine_bundle.seal`` and not log it. ``move_secret`` (S)
    is supplied by the caller (the export endpoint) so it can also store ``sha256(S)``;
    it is embedded here so it is recoverable only via a successful unseal.

    Datasources/storage/infra/connected-accounts are COPIED (shared resources stay in
    the source); the engine + owned children (gpu/api_key/agent) MOVE.
    """
    closure: Closure = build_closure(engine, db)

    # Stable, deduped bundle-refs for every connected account (referenced by engine,
    # infra, datasources, storage). Ordered by source id for deterministic output.
    accounts_sorted = sorted(closure.connected_accounts, key=lambda a: str(a.id))
    acct_ref = {str(a.id): f"acct-{i}" for i, a in enumerate(accounts_sorted)}

    def acct_ref_for(account_id: Any) -> str | None:
        return acct_ref.get(str(account_id)) if account_id else None

    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "feature": "frontbase.engine_move",
        "source_edition": "cloud" if is_cloud() else "self-host",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "_move_secret": move_secret,
        "engine": _project_engine(closure.engine, acct_ref_for),
        "connected_accounts": [
            _project_account(a, acct_ref[str(a.id)]) for a in accounts_sorted
        ],
        "infra": {
            "database": _project_infra(closure.edge_database, "database", acct_ref_for),
            "cache": _project_infra(closure.edge_cache, "cache", acct_ref_for),
            "queue": _project_infra(closure.edge_queue, "queue", acct_ref_for),
            "vector": _project_infra(closure.edge_vector, "vector", acct_ref_for),
        },
        "gpu_models": [_project_gpu(m) for m in closure.gpu_models],
        "api_keys": [_project_api_key(k) for k in closure.api_keys],
        "agent_profiles": [_project_agent(p) for p in closure.agent_profiles],
        "datasources": [_project_datasource(ds, acct_ref_for) for ds in closure.datasources],
        "storages": [_project_storage(st, acct_ref_for) for st in closure.storages],
    }


# =============================================================================
# Import (Step 4) — the reverse of build_manifest
# =============================================================================

class ManifestIncompatible(Exception):
    """The manifest's schema_version is not supported by this importer."""


def _infra_model(kind: str) -> tuple[Any, str]:
    """Lazy resolver for infra kind → (ORM model, url attr). Defers model imports."""
    from ..models.models import EdgeDatabase, EdgeCache, EdgeQueue, EdgeVector

    table = {
        "database": (EdgeDatabase, "db_url"),
        "cache": (EdgeCache, "cache_url"),
        "queue": (EdgeQueue, "queue_url"),
        "vector": (EdgeVector, "vector_url"),
    }
    return table[kind]


def _dump_json(v: Any) -> str | None:
    """Serialize a parsed JSON value back to a TEXT column string (or None)."""
    if v is None:
        return None
    if isinstance(v, (dict, list)):
        return json.dumps(v)
    return str(v)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _unique_engine_name(db: Session, name: str, project_id: str) -> str:
    """Suffixed name if an engine with this name already exists in the target project."""
    from ..models.models import EdgeEngine

    if not db.query(EdgeEngine).filter_by(project_id=project_id, name=name).first():
        return name
    i = 2
    while True:
        cand = f"{name} (imported {i})"
        if not db.query(EdgeEngine).filter_by(project_id=project_id, name=cand).first():
            return cand
        i += 1


# ── Match-or-create helpers (all scoped to the target project) ─────────────

def _match_account(db: Session, acct: dict, project_id: str) -> Any | None:
    """Find an existing Connected Account to reuse by IDENTITY (primary credential),
    not name — scoped to the target project (tenant-bound). Same api_token = same
    account → reuse; different credential → None → caller creates a fresh account that
    brings the moved credentials. Never a wrong rebinding. See app.core.account_identity.
    """
    from ..core.account_identity import find_account_by_identity

    incoming = {**(acct.get("provider_metadata") or {}), **(acct.get("secrets") or {})}
    return find_account_by_identity(db, project_id, acct["provider"], incoming)


def _match_infra(db: Session, kind: str, row: dict, project_id: str) -> Any | None:
    """Find existing shared infra to reuse. Key: (provider, url) within the project."""
    model, url_attr = _infra_model(kind)
    return (
        db.query(model)
        .filter_by(provider=row["provider"], project_id=project_id)
        .filter(getattr(model, url_attr) == row["url"])
        .first()
    )


def _match_datasource(db: Session, ds: dict, project_id: str) -> Any | None:
    """Find an existing datasource to reuse. Key: (name, project_id) — Datasource has a
    unique(project_id, name) constraint, so name is the natural key."""
    from app.services.sync.models.datasource import Datasource

    return db.query(Datasource).filter_by(name=ds["name"], project_id=project_id).first()


def _match_storage(db: Session, st: dict, project_id: str) -> Any | None:
    """Find existing storage to reuse. Key: (name, provider) within the project."""
    from app.models.storage_provider import StorageProvider

    return (
        db.query(StorageProvider)
        .filter_by(name=st["name"], provider=st["provider"], project_id=project_id)
        .first()
    )


def _new_summary() -> dict:
    return {
        "accounts": {"created": 0, "reused": 0},
        "infra": {"created": 0, "reused": 0},
        "datasources": {"created": 0, "reused": 0},
        "storages": {"created": 0, "reused": 0},
        "gpu_models": 0,
        "api_keys": 0,
        "agent_profiles": 0,
    }


def import_manifest(manifest: dict, db: Session, *, project_id: str) -> dict:
    """Import a manifest into this deployment under the given project.

    The reverse of :func:`build_manifest`: remaps every ID, matches-or-creates shared
    resources (scoped to the target project), re-encrypts every secret with the LOCAL
    ``FERNET_KEY`` via :func:`_unpack_value`, and stages all inserts on the session.
    The caller commits after this returns (so it can reveal ``move_secret`` only once
    the import is durable) and rolls back on any exception.

    The engine lands **inactive and undeployed** (no url/checksums) — the user redeploys
    to take it live. Returns ``{"engine_id", "summary", "move_secret"}``.
    """
    if manifest.get("schema_version") != MANIFEST_SCHEMA_VERSION:
        raise ManifestIncompatible(
            f"manifest schema_version {manifest.get('schema_version')!r} not supported "
            f"(expected {MANIFEST_SCHEMA_VERSION})"
        )

    from ..models.models import (
        EdgeEngine, EdgeProviderAccount, EdgeGPUModel, EdgeAPIKey, EdgeAgentProfile,
    )
    from ..models.edge import engine_datasources, engine_storages
    from app.models.storage_provider import StorageProvider
    from app.services.sync.models.datasource import Datasource, DatasourceType
    from ..core.security import encrypt_credentials

    now = _now_iso()
    summary = _new_summary()

    # 1. Connected accounts — match-or-create; map bundle_ref → target account id.
    acct_id: dict[str, str] = {}
    for a in manifest.get("connected_accounts", []):
        existing = _match_account(db, a, project_id)
        if existing:
            acct_id[a["bundle_id"]] = str(existing.id)
            summary["accounts"]["reused"] += 1
            continue
        new_id = str(uuid.uuid4())
        db.add(EdgeProviderAccount(
            id=new_id, name=a["name"], provider=a["provider"], project_id=project_id,
            provider_credentials=encrypt_credentials(a["secrets"]) if a.get("secrets") else None,
            provider_metadata=_dump_json(a.get("provider_metadata")),
            is_active=bool(a.get("is_active", True)),
            created_at=now, updated_at=now,
        ))
        acct_id[a["bundle_id"]] = new_id
        summary["accounts"]["created"] += 1

    def acct(ref: Any) -> str | None:
        return acct_id.get(ref) if ref else None

    # 2. Shared infra — match-or-create; map kind → target infra id.
    infra_id: dict[str, str] = {}
    for kind, row in (manifest.get("infra") or {}).items():
        if not row:
            continue
        existing = _match_infra(db, kind, row, project_id)
        if existing:
            infra_id[kind] = str(existing.id)
            summary["infra"]["reused"] += 1
            continue
        model, url_attr = _infra_model(kind)
        new_id = str(uuid.uuid4())
        inst = model(
            id=new_id, name=row["name"], provider=row["provider"],
            project_id=project_id, is_default=bool(row.get("is_default", False)),
            provider_account_id=acct(row.get("provider_account_ref")),
            provider_config=_dump_json(_unpack_value(row.get("provider_config"))),
            **{url_attr: row["url"]},
            created_at=now, updated_at=now,
        )
        for dest, attr in _INFRA_SECRET_FIELDS[kind]:
            val = (row.get("secrets") or {}).get(dest)
            if val is not None:
                setattr(inst, attr, _unpack_value(val))
        db.add(inst)
        infra_id[kind] = new_id
        summary["infra"]["created"] += 1

    # 3. Engine root — inactive, undeployed (url is NOT NULL → empty placeholder).
    eng = manifest["engine"]
    engine_id = str(uuid.uuid4())
    engine = EdgeEngine(
        id=engine_id,
        name=_unique_engine_name(db, eng["name"], project_id),
        adapter_type=eng["adapter_type"],
        url="",  # NOT NULL placeholder; overwritten on first redeploy
        engine_config=_dump_json(_unpack_value(eng.get("engine_config"))),
        edge_provider_id=acct(eng.get("edge_provider_ref")),
        edge_db_id=infra_id.get("database"),
        edge_cache_id=infra_id.get("cache"),
        edge_queue_id=infra_id.get("queue"),
        edge_vector_id=infra_id.get("vector"),
        edge_auth_id=eng.get("edge_auth_id"),
        project_id=project_id,
        is_active=False,        # lands inactive; user redeploys to take it live
        is_imported=False,      # fully-configured Frontbase engine (not the old closed import)
        created_at=now, updated_at=now,
    )
    db.add(engine)

    # 4. Owned children (MOVE with the engine).
    for m in manifest.get("gpu_models", []):
        db.add(EdgeGPUModel(
            id=str(uuid.uuid4()), name=m["name"], slug=m["slug"], model_type=m["model_type"],
            provider=m["provider"], model_id=m["model_id"], base_url=m.get("base_url"),
            endpoint_url=None,  # regenerated on deploy from the new engine url
            provider_config=_dump_json(_unpack_value(m.get("provider_config"))),
            api_key=_unpack_value(m["api_key"]) if m.get("api_key") else None,
            edge_engine_id=engine_id, is_active=bool(m.get("is_active", True)),
            created_at=now, updated_at=now,
        ))
        summary["gpu_models"] += 1

    for k in manifest.get("api_keys", []):
        db.add(EdgeAPIKey(
            id=str(uuid.uuid4()), name=k["name"], prefix=k["prefix"],
            key_hash=_unpack_value(k["key_hash"]) if k.get("key_hash") else None,
            edge_engine_id=engine_id, project_id=project_id,
            scope=k.get("scope", "user"), is_active=bool(k.get("is_active", True)),
            expires_at=k.get("expires_at"), created_at=now, updated_at=now,
        ))
        summary["api_keys"] += 1

    for p in manifest.get("agent_profiles", []):
        db.add(EdgeAgentProfile(
            id=str(uuid.uuid4()), engine_id=engine_id, project_id=project_id,
            name=p["name"], slug=p["slug"], system_prompt=p.get("system_prompt"),
            permissions=_dump_json(p.get("permissions")),
            temperature=p.get("temperature"), max_tokens=p.get("max_tokens"),
            top_p=p.get("top_p"), excluded_tools=_dump_json(p.get("excluded_tools")),
            max_auto_tools=p.get("max_auto_tools"),
            mcp_enabled=bool(p.get("mcp_enabled", True)),
            skills_enabled=bool(p.get("skills_enabled", True)),
            created_at=now, updated_at=now,
        ))
        summary["agent_profiles"] += 1

    # 5. Datasources — match-or-create, then bind to the engine via M2M.
    for ds in manifest.get("datasources", []):
        existing = _match_datasource(db, ds, project_id)
        if existing:
            ds_id = str(existing.id)
            summary["datasources"]["reused"] += 1
        else:
            ds_id = str(uuid.uuid4())
            secrets = ds.get("secrets") or {}
            db.add(Datasource(
                id=ds_id, name=ds["name"], project_id=project_id,
                type=DatasourceType(ds["type"]),
                host=ds.get("host"), port=ds.get("port"), database=ds.get("database"),
                username=ds.get("username"), api_url=ds.get("api_url"),
                table_prefix=ds.get("table_prefix") or "wp_",
                password_encrypted=_unpack_value(secrets["password"]) if secrets.get("password") else None,
                api_key_encrypted=_unpack_value(secrets["api_key"]) if secrets.get("api_key") else None,
                anon_key_encrypted=_unpack_value(secrets["anon_key"]) if secrets.get("anon_key") else None,
                extra_config=_dump_json(_unpack_value(ds.get("extra_config"))),
                provider_account_id=acct(ds.get("provider_account_ref")),
                is_active=bool(ds.get("is_active", True)),
            ))
            summary["datasources"]["created"] += 1
        db.execute(engine_datasources.insert().values(
            engine_id=engine_id, datasource_id=ds_id))

    # 6. Storage — match-or-create, then bind via M2M.
    for st in manifest.get("storages", []):
        existing = _match_storage(db, st, project_id)
        if existing:
            st_id = str(existing.id)
            summary["storages"]["reused"] += 1
        else:
            st_id = str(uuid.uuid4())
            db.add(StorageProvider(
                id=st_id, name=st["name"], provider=st["provider"],
                provider_account_id=acct(st.get("provider_account_ref")),
                config=_dump_json(_unpack_value(st.get("config"))) or "{}",
                project_id=project_id, is_active=bool(st.get("is_active", True)),
            ))
            summary["storages"]["created"] += 1
        db.execute(engine_storages.insert().values(
            engine_id=engine_id, storage_id=st_id))

    return {"engine_id": engine_id, "summary": summary, "move_secret": manifest.get("_move_secret")}


# ── Same-deployment fast path (Step 6) ────────────────────────────────────

def move_engine_to_project(db: Session, engine: Any, *, target_project_id: str) -> dict:
    """Same-deployment move: export → import → delete source, all in one transaction.

    Because source and target share the local ``FERNET_KEY``, transport crypto is
    unnecessary — but we reuse build_manifest/import_manifest for a single code path
    (the pack→unpack shuttle re-encrypts with the same key, which is a harmless no-op on
    the plaintext). The source engine is deleted immediately (cascade removes its owned
    children); no soft-lock or confirm token is needed since nothing crosses deployments.
    """
    move_secret = generate_move_secret()
    manifest = build_manifest(engine, db, move_secret=move_secret)
    result = import_manifest(manifest, db, project_id=target_project_id)
    # Owned children cascade-delete with the engine; shared accounts/infra/ds/storage
    # were COPY-imported (match-or-create), so deleting the source engine leaves them.
    db.delete(engine)
    return result


# ── Stale-move TTL prune (Step 5) ─────────────────────────────────────────

# A moved_out engine older than this auto-reverts to active, so a lost or abandoned
# bundle never strands an engine forever. Wired into the Celery beat schedule.
MOVE_TTL_DAYS = 7


def prune_stale_moves(db: Session, *, ttl_days: int = MOVE_TTL_DAYS) -> int:
    """Revert ``moved_out`` engines older than ``ttl_days`` back to active.

    ISO-format timestamps compare lexicographically in chronological order (we control
    the write format via ``datetime.now(UTC).isoformat()``), so a string ``<`` is a safe
    chronological cutoff. Returns the count of reverted engines. Commits only if it
    reverted anything.
    """
    from datetime import timedelta

    from ..models.models import EdgeEngine
    from ..models.edge import MOVE_STATUS_MOVED_OUT

    cutoff = (datetime.now(timezone.utc) - timedelta(days=ttl_days)).isoformat()
    stale = (
        db.query(EdgeEngine)
        .filter(
            EdgeEngine.move_status == MOVE_STATUS_MOVED_OUT,
            EdgeEngine.moved_out_at.isnot(None),
            EdgeEngine.moved_out_at < cutoff,
        )
        .all()
    )
    now = _now_iso()
    for e in stale:
        e.move_status = None  # type: ignore[assignment]
        e.move_secret_hash = None  # type: ignore[assignment]
        e.moved_out_at = None  # type: ignore[assignment]
        e.is_active = True  # type: ignore[assignment]
        e.updated_at = now  # type: ignore[assignment]
    if stale:
        db.commit()
    return len(stale)
