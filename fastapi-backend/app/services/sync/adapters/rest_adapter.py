"""
REST adapter — read-only datasource backed by a generic HTTP/JSON endpoint.

Config (datasource.extra_config JSON):
    {
      "baseUrl": "https://api.example.com",
      "resourcePath": "/things",          # appended to baseUrl for the list endpoint
      "jsonPath": "data.items",           # dotted path to the rows array in the response
      "headers": {"Authorization": "Bearer ..."},   # optional static headers
      "idField": "id"                      # PK field for read_record_by_key (default "id")
    }

Read-only: writes raise NotImplementedError. No standard query contract is
assumed (REST APIs vary), so where/search/sort are best-effort client-side filters.
Intended for read components + manual/ui_event triggers only — NOT data_change
(change detection is unsupported on REST).
"""

import json
from typing import Any, Dict, List, Optional, Union

import httpx

from app.services.sync.adapters.base import DatabaseAdapter


def _get_path(obj: Any, path: str) -> Any:
    cur: Any = obj
    for part in (path or "").split("."):
        if part == "":
            continue
        if isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _match(row: Dict[str, Any], where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]], query: Optional[str]) -> bool:
    items = []
    if where:
        items = where if isinstance(where, list) else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
    for f in items:
        col = f.get("field") or f.get("column")
        if not col:
            continue
        op = f.get("operator") or f.get("op") or "=="
        want = f.get("value")
        cell = row.get(col)
        if op in ("==", "eq"):
            if str(cell) != str(want):
                return False
        elif op in ("!=", "neq"):
            if str(cell) == str(want):
                return False
        elif op in ("contains",):
            if str(want).lower() not in str(cell).lower():
                return False
    if query and query.lower() not in json.dumps(row, default=str).lower():
        return False
    return True


class RESTAdapter(DatabaseAdapter):
    """Read-only adapter over a generic REST/JSON endpoint."""

    def __init__(self, datasource):
        super().__init__(datasource)
        cfg = self._read_config()
        self._base_url = (cfg.get("baseUrl") or "").rstrip("/")
        self._resource_path = cfg.get("resourcePath") or "/"
        self._json_path = cfg.get("jsonPath") or ""
        self._headers = cfg.get("headers") or {}
        self._id_field = cfg.get("idField") or "id"
        self._client: Optional[httpx.AsyncClient] = None

    def _read_config(self) -> Dict[str, Any]:
        raw = getattr(self.datasource, "extra_config", None)
        if not raw:
            return {}
        try:
            return json.loads(raw) if isinstance(raw, str) else dict(raw)
        except (json.JSONDecodeError, TypeError):
            return {}

    async def connect(self) -> None:
        if not self._base_url:
            raise ValueError("REST datasource missing baseUrl in extra_config")
        self._client = httpx.AsyncClient(timeout=30, headers=self._headers)

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    def _client_or_new(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30, headers=self._headers)
        return self._client

    async def _fetch_all(self, table: str) -> List[Dict[str, Any]]:
        client = self._client_or_new()
        # `table` is treated as the resource path when resourcePath is unset.
        path = self._resource_path if self._resource_path != "/" else f"/{table}"
        url = f"{self._base_url}{path}"
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
        rows = _get_path(data, self._json_path)
        return list(rows) if isinstance(rows, list) else ([] if rows is None else [rows])

    async def get_tables(self) -> List[str]:
        # No canonical table list for REST; expose the configured resource.
        return [self._resource_path.strip("/") or "data"]

    async def get_schema(self, table: str) -> Dict[str, Any]:
        rows = await self._fetch_all(table)
        columns = []
        seen = set()
        for r in rows[:50]:
            if not isinstance(r, dict):
                continue
            for k, v in r.items():
                if k not in seen:
                    seen.add(k)
                    t = "number" if isinstance(v, (int, float)) and not isinstance(v, bool) else "boolean" if isinstance(v, bool) else "string"
                    columns.append({"name": k, "type": t})
        return {"columns": columns, "foreign_keys": []}

    async def read_records(self, table, columns=None, where=None, limit=100, offset=0, order_by=None, order_direction="asc"):
        rows = await self._fetch_all(table)
        filtered = [r for r in rows if isinstance(r, dict) and _match(r, where, None)]
        end = (offset or 0) + (limit or len(filtered))
        sliced = filtered[offset or 0:end]
        if columns:
            sliced = [{k: r.get(k) for k in columns} for r in sliced]
        return sliced

    async def read_record_by_key(self, table, key_column, key_value):
        rows = await self.read_records(table, where=[{"field": key_column or self._id_field, "operator": "==", "value": key_value}], limit=1)
        return rows[0] if rows else None

    async def count_records(self, table, where=None):
        rows = await self._fetch_all(table)
        return sum(1 for r in rows if isinstance(r, dict) and _match(r, where, None))

    async def search_records(self, table, query, limit=100):
        rows = await self._fetch_all(table)
        return [r for r in rows if isinstance(r, dict) and _match(r, None, query)][:limit]

    async def count_search_matches(self, table, query):
        rows = await self._fetch_all(table)
        return sum(1 for r in rows if isinstance(r, dict) and _match(r, None, query))

    async def aggregate(self, table, category, aggregation="count", value=None, filters=None, sort="none", limit=10):
        # Best-effort client-side aggregation.
        rows = [r for r in await self._fetch_all(table) if isinstance(r, dict) and _match(r, filters, None)]
        groups: Dict[str, List[Any]] = {}
        for r in rows:
            key = str(r.get(category))
            groups.setdefault(key, []).append(r.get(value) if value else 1)
        out = []
        for k, vals in groups.items():
            if aggregation == "count":
                v = len(vals)
            elif aggregation == "sum":
                v = sum(float(x or 0) for x in vals)
            elif aggregation == "average":
                v = sum(float(x or 0) for x in vals) / (len(vals) or 1)
            elif aggregation == "min":
                v = min(float(x or 0) for x in vals)
            elif aggregation == "max":
                v = max(float(x or 0) for x in vals)
            else:
                v = 0
            out.append({"category": k, "value": v})
        if sort == "asc":
            out.sort(key=lambda x: x["value"])
        elif sort == "desc":
            out.sort(key=lambda x: x["value"], reverse=True)
        return out[:limit]

    # ---- writes (read-only) ----
    async def upsert_record(self, table, record, key_column):
        raise NotImplementedError("REST adapter is read-only")

    async def delete_record(self, table, key_column, key_value):
        raise NotImplementedError("REST adapter is read-only")
