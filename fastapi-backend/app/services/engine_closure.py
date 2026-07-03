"""
Engine dependency-closure traversal — the structural map of an EdgeEngine's subgraph.

Single shared source for "what is this engine connected to?" Two consumers project it
differently:
  - ``engine_serializer.serialize_engine`` — renders secrets-free summaries for the API
    (uses :func:`bound_datasources` / :func:`bound_storages` only, to stay cheap on the
    hot list path).
  - ``engine_move.build_manifest`` — walks the FULL closure via :func:`build_closure` and
    decrypts secrets on top to emit a portable bundle.

This is the extraction point agreed for Step 3 of the portable engine-move feature
(see ``docs/portable-engine-move-plan.md``): the structural traversal lives here, field
treatment stays in each consumer.

What's in the closure (and what is deliberately NOT):
  - Owned children that MOVE with the engine: ``gpu_models``, ``api_keys``,
    ``agent_profiles``.
  - Shared infra (1:1 FKs): ``edge_database`` / ``edge_cache`` / ``edge_queue`` /
    ``edge_vector`` — COPIED, not removed from source.
  - The engine's deploy account (``edge_provider``) plus every Connected Account
    referenced by the engine, its infra, its datasources, or its storage — these are the
    credential hub and the heart of the bundle.
  - M2M bindings: ``datasources`` and ``storages`` — COPIED.
  - ``page_deployments`` is EXCLUDED: it is deploy-state with a FK to ``pages.id``, not
    engine config, and Pages are out of scope for a move. The target engine starts
    undeployed and republishes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Session

from ..models.edge import engine_datasources, engine_storages


# ── Cheap M2M helpers (shared with the serializer hot path) ────────────────

def bound_datasource_ids(db: Session, engine_id: str) -> list[str]:
    """Return the datasource IDs bound to an engine via the M2M table."""
    stmt = sa.select(engine_datasources.c.datasource_id).where(
        engine_datasources.c.engine_id == engine_id
    )
    return [str(x) for x in db.execute(stmt).scalars().all()]


def bound_storage_ids(db: Session, engine_id: str) -> list[str]:
    """Return the storage-provider IDs bound to an engine via the M2M table."""
    stmt = sa.select(engine_storages.c.storage_id).where(
        engine_storages.c.engine_id == engine_id
    )
    return [str(x) for x in db.execute(stmt).scalars().all()]


def bound_datasources(db: Session, engine_id: str) -> list[Any]:
    """The bound ``Datasource`` rows (resolved from the M2M IDs)."""
    from app.services.sync.models.datasource import Datasource

    ids = bound_datasource_ids(db, engine_id)
    if not ids:
        return []
    return db.query(Datasource).filter(Datasource.id.in_(ids)).all()


def bound_storages(db: Session, engine_id: str) -> list[Any]:
    """The bound ``StorageProvider`` rows (resolved from the M2M IDs)."""
    from app.models.storage_provider import StorageProvider

    ids = bound_storage_ids(db, engine_id)
    if not ids:
        return []
    return db.query(StorageProvider).filter(StorageProvider.id.in_(ids)).all()


# ── Full closure (for build_manifest) ─────────────────────────────────────

@dataclass
class Closure:
    """The structural dependency graph of an engine (ORM objects, no projection)."""

    engine: Any
    gpu_models: list = field(default_factory=list)
    api_keys: list = field(default_factory=list)
    agent_profiles: list = field(default_factory=list)
    edge_database: Any | None = None
    edge_cache: Any | None = None
    edge_queue: Any | None = None
    edge_vector: Any | None = None
    edge_provider: Any | None = None          # the engine's deploy account
    connected_accounts: list = field(default_factory=list)   # deduped EdgeProviderAccount rows
    datasources: list = field(default_factory=list)          # bound Datasource rows
    storages: list = field(default_factory=list)             # bound StorageProvider rows


def build_closure(engine: Any, db: Session) -> Closure:
    """Walk an engine's full dependency subgraph and return it as a :class:`Closure`.

    Pure structural traversal — no field projection, no decryption. The caller decides
    how to render each row. Relationships (children, infra, deploy account) are read via
    SQLAlchemy relationships within the active session; M2M bindings and the collected
    Connected Accounts are fetched explicitly.
    """
    from ..models.models import EdgeProviderAccount

    # Owned children + 1:1 shared infra + deploy account — via relationships.
    gpu_models = list(engine.gpu_models or [])
    api_keys = list(engine.api_keys or [])
    agent_profiles = list(engine.agent_profiles or [])
    edge_database = engine.edge_database
    edge_cache = engine.edge_cache
    edge_queue = engine.edge_queue
    edge_vector = engine.edge_vector
    edge_provider = engine.edge_provider

    # M2M bindings.
    datasources = bound_datasources(db, str(engine.id))
    storages = bound_storages(db, str(engine.id))

    # Collect every referenced Connected Account (the credential hub), deduped.
    # page_deployments intentionally excluded — see module docstring.
    account_ids: set[str] = set()
    if engine.edge_provider_id:
        account_ids.add(str(engine.edge_provider_id))
    for infra in (edge_database, edge_cache, edge_queue, edge_vector):
        aid = getattr(infra, "provider_account_id", None)
        if aid:
            account_ids.add(str(aid))
    for ds in datasources:
        if getattr(ds, "provider_account_id", None):
            account_ids.add(str(ds.provider_account_id))
    for st in storages:
        if getattr(st, "provider_account_id", None):
            account_ids.add(str(st.provider_account_id))

    connected_accounts: list = []
    if account_ids:
        connected_accounts = (
            db.query(EdgeProviderAccount)
            .filter(EdgeProviderAccount.id.in_(account_ids))
            .all()
        )

    return Closure(
        engine=engine,
        gpu_models=gpu_models,
        api_keys=api_keys,
        agent_profiles=agent_profiles,
        edge_database=edge_database,
        edge_cache=edge_cache,
        edge_queue=edge_queue,
        edge_vector=edge_vector,
        edge_provider=edge_provider,
        connected_accounts=connected_accounts,
        datasources=datasources,
        storages=storages,
    )
