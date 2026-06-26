"""
Edge Vector Proxy Backend (libSQL/LanceDB via HTTP).

Proxies vector operations to the local edge engine over HTTP.
The edge hosts the actual vector store (libSQL or LanceDB); this backend
acts as a client, enforcing tenant isolation via table name prefixing.

Flow:
  backend → HTTP POST /api/vector/{upsert,search} → edge → libSQL/LanceDB

Tenant isolation:
  - Self-host mode (tenant_id=None): table names used as-is (docs → docs)
  - Cloud mode (tenant_id set): table names prefixed (docs → tenant_abc123_docs)

This ensures that even though the edge has no tenant awareness (only system key auth),
tenants cannot access each other's vector data.
"""

from __future__ import annotations

import logging
from typing import Any, Sequence

from .base import VectorBackend

logger = logging.getLogger(__name__)


class EdgeVectorProxyBackend(VectorBackend):
    """Vector backend proxy to the local edge engine.

    The edge runs libSQL (default) or LanceDB (opt-in) and exposes
    /api/vector/* endpoints protected by x-system-key. This backend
    proxies requests to the edge, adding tenant-scoped table prefixes.
    """

    def __init__(self, edge_url: str, system_key: str, tenant_id: str | None = None):
        """Initialize the proxy backend.

        Args:
            edge_url: Base URL of the edge engine (e.g., http://localhost:3002)
            system_key: The FRONTBASE_SYSTEM_KEY for x-system-key auth
            tenant_id: Current tenant ID (or None for self-host mode). Used to
                      prefix table names for tenant isolation.
        """
        self.edge_url = edge_url.rstrip("/")
        self.system_key = system_key
        self.tenant_id = tenant_id

    def _prefix_table(self, table: str) -> str:
        """Prefix table name with tenant_id if set (cloud mode).

        Self-host mode (tenant_id=None): returns table as-is.
        Cloud mode: returns tenant_{tenant_id}_{table}.
        """
        if self.tenant_id:
            return f"tenant_{self.tenant_id}_{table}"
        return table

    async def ensure_index(self, *, table: str, column: str, dimensions: int) -> None:
        """No-op for edge proxy.

        The edge stores (libSQL/LanceDB) auto-create tables on first upsert,
        so no explicit ensure_index step is needed.
        """
        # No-op: tables are created on first upsert
        pass

    async def upsert(
        self,
        *,
        table: str,
        column: str,
        rows: Sequence[dict],
    ) -> int:
        """Upsert vectors via the edge /api/vector/upsert endpoint.

        The column parameter is ignored by the edge (it uses a fixed 'embedding'
        column name), but kept for interface compatibility.

        Each row must have: {id: str, vector: list[float], **metadata}
        """
        if not rows:
            return 0

        import httpx

        prefixed_table = self._prefix_table(table)
        url = f"{self.edge_url}/api/vector/upsert"

        payload = {
            "tableName": prefixed_table,
            "vectors": list(rows),  # Each row: {id, vector, ...metadata}
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={"x-system-key": self.system_key},
                )
                response.raise_for_status()
                data = response.json()
                return data.get("inserted", len(rows))
        except httpx.HTTPStatusError as e:
            logger.error(f"Edge upsert failed: {e.response.status_code} {e.response.text}")
            raise ValueError(f"Edge upsert failed: {e.response.text}") from e
        except httpx.RequestError as e:
            logger.error(f"Edge request failed: {e}")
            raise ValueError(f"Edge unreachable: {e}") from e

    async def search(
        self,
        *,
        table: str,
        column: str,
        query_vector: Sequence[float],
        top_k: int = 10,
    ) -> list[dict]:
        """Search vectors via the edge /api/vector/search endpoint.

        Returns rows with a `_score` field (similarity, higher = better).
        """
        import httpx

        prefixed_table = self._prefix_table(table)
        url = f"{self.edge_url}/api/vector/search"

        payload = {
            "tableName": prefixed_table,
            "queryVector": list(query_vector),
            "limit": max(1, min(int(top_k), 1000)),
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={"x-system-key": self.system_key},
                )
                response.raise_for_status()
                data = response.json()
                results = data.get("results", [])
                # Ensure _score field exists (edge returns it)
                for r in results:
                    if "_score" not in r:
                        r["_score"] = r.get("_distance", 0.0)
                return results
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return []  # Table not found → empty results
            logger.error(f"Edge search failed: {e.response.status_code} {e.response.text}")
            raise ValueError(f"Edge search failed: {e.response.text}") from e
        except httpx.RequestError as e:
            logger.error(f"Edge request failed: {e}")
            raise ValueError(f"Edge unreachable: {e}") from e
