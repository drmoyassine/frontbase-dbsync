"""
Vector backends for semantic search (Sprint 4C).

A pluggable vector-store interface so a Frontbase datasource can power semantic
search / AI retrieval. v1 ships a concrete **pgvector** backend (reuses existing
Supabase/Neon Postgres connections — zero new infra) plus interface-conforming
stubs for Cloudflare Vectorize, Turso vector, and embedded LanceDB.

Embeddings are generated through a user-configured OpenAI-compatible endpoint
(see embeddings.py) — Frontbase does not bundle an embedding model.

Flow:
  text → embed() → backend.upsert(id, vector, metadata)
  query → embed() → backend.search(vector, top_k) → ranked rows
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Sequence


class VectorBackend(ABC):
    """Unified vector-store interface. Implement one per provider."""

    @abstractmethod
    async def ensure_index(self, *, table: str, column: str, dimensions: int) -> None:
        """Create the vector column + index if missing (idempotent)."""
        ...

    @abstractmethod
    async def upsert(
        self,
        *,
        table: str,
        column: str,
        rows: Sequence[dict],
    ) -> int:
        """Insert/replace vectors. Each row: {id, vector: list[float], **metadata}."""
        ...

    @abstractmethod
    async def search(
        self,
        *,
        table: str,
        column: str,
        query_vector: Sequence[float],
        top_k: int = 10,
    ) -> list[dict]:
        """Return the top_k nearest rows with a `_score` (similarity) field."""
        ...


class NotSupportedVectorBackend(VectorBackend):
    """Placeholder for backends not yet implemented in v1.

    Sprint 4C trims the original 8-provider list to: pgvector (done), and
    Cloudflare Vectorize / Turso vector / embedded LanceDB (stubbed here).
    Raising on use (not on import) keeps the factory clean.
    """

    def __init__(self, provider: str, reason: str = ""):
        self.provider = provider
        self.reason = reason or f"{provider} vector backend is stubbed for v1 (Sprint 4C)."

    def _not_supported(self) -> "Any":
        raise NotImplementedError(self.reason)

    async def ensure_index(self, **_: Any) -> None:  # pragma: no cover
        self._not_supported()

    async def upsert(self, **_: Any) -> int:  # pragma: no cover
        self._not_supported()

    async def search(self, **_: Any) -> list[dict]:  # pragma: no cover
        self._not_supported()
