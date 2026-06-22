"""
pgvector backend (Sprint 4C) — semantic search over an existing Postgres datasource.

Reuses the tenant's Supabase/Neon Postgres connection via asyncpg. Requires the
`vector` extension (Supabase + Neon both ship it). Zero new infrastructure: the
vectors live beside the source rows in a `vector(n)` column.

This is the recommended v1 vector backend because it adds no new provider
accounts, keys, or billing.
"""

from __future__ import annotations

import logging
from typing import Any, Sequence

from .base import VectorBackend

logger = logging.getLogger(__name__)

# pgvector literal format: '[0.1,0.2,...]'. Bounded to avoid huge literals.
_MAX_LITERAL_VECTORS = 500


def _vector_literal(vec: Sequence[float]) -> str:
    return "[" + ",".join(str(float(x)) for x in vec) + "]"


class PgVectorBackend(VectorBackend):
    """Vector search over a Postgres datasource using the pgvector extension."""

    def __init__(self, dsn: str):
        """`dsn` is a Postgres connection string for the target datasource."""
        self.dsn = dsn

    async def _connect(self):
        import asyncpg  # local import — asyncpg is already a dependency
        return await asyncpg.connect(self.dsn)

    async def ensure_index(self, *, table: str, column: str, dimensions: int) -> None:
        """Create the vector extension + a vector(dimensions) column + ivfflat index.

        Identifiers are validated (the table/column come from caller config) and
        interpolated; values are parameterised. Idempotent.
        """
        if not table.replace("_", "").isalnum():
            raise ValueError(f"unsafe table name: {table!r}")
        if not column.replace("_", "").isalnum():
            raise ValueError(f"unsafe column name: {column!r}")
        if not (1 <= dimensions <= 2000):
            raise ValueError(f"dimensions out of range: {dimensions}")

        conn = await self._connect()
        try:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await conn.execute(
                f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{column}" vector({dimensions})'
            )
            # ivfflat needs lists tuning for large tables; 100 is a sane default.
            await conn.execute(
                f'CREATE INDEX IF NOT EXISTS "{table}_{column}_idx" '
                f'ON "{table}" USING ivfflat ("{column}" vector_cosine_ops) WITH (lists = 100)'
            )
        finally:
            await conn.close()

    async def upsert(self, *, table: str, column: str, rows: Sequence[dict]) -> int:
        """Upsert vectors by `id`. Batches to avoid enormous queries."""
        if not rows:
            return 0
        if not table.replace("_", "").isalnum() or not column.replace("_", "").isalnum():
            raise ValueError("unsafe table or column name")

        conn = await self._connect()
        inserted = 0
        try:
            for batch_start in range(0, len(rows), _MAX_LITERAL_VECTORS):
                batch = rows[batch_start : batch_start + _MAX_LITERAL_VECTORS]
                # Build a multi-row VALUES clause with parameterised vectors.
                # pgvector accepts the literal form cast to vector.
                args: list[Any] = []
                value_parts: list[str] = []
                for i, row in enumerate(batch):
                    base = i * 2
                    args.append(str(row["id"]))
                    args.append(_vector_literal(row["vector"]))
                    value_parts.append(f"(${base + 1}, ${base + 2}::vector)")
                sql = (
                    f'INSERT INTO "{table}" (id, "{column}") VALUES '
                    + ",".join(value_parts)
                    + f' ON CONFLICT (id) DO UPDATE SET "{column}" = EXCLUDED."{column}"'
                )
                result = await conn.execute(sql, *args)
                # asyncpg returns "INSERT 0 N"; parse N
                try:
                    inserted += int(result.split()[-1])
                except (IndexError, ValueError):
                    pass
        finally:
            await conn.close()
        return inserted

    async def search(
        self,
        *,
        table: str,
        column: str,
        query_vector: Sequence[float],
        top_k: int = 10,
    ) -> list[dict]:
        """Cosine-distance nearest-neighbour search. Returns rows + `_score`."""
        if not table.replace("_", "").isalnum() or not column.replace("_", "").isalnum():
            raise ValueError("unsafe table or column name")
        top_k = max(1, min(int(top_k), 200))

        conn = await self._connect()
        try:
            rows = await conn.fetch(
                f'SELECT *, (1 - ("{column}" <=> $1::vector)) AS _score '
                f'FROM "{table}" WHERE "{column}" IS NOT NULL '
                f'ORDER BY "{column}" <=> $1::vector LIMIT $2',
                _vector_literal(query_vector),
                top_k,
            )
            return [dict(r) for r in rows]
        finally:
            await conn.close()
