"""
Google Sheets adapter — fulfills the DatabaseAdapter contract by HTTP-calling
the user-deployed Apps Script Web App (see integrations/google-sheets-rpc/Code.gs).

Config is stored on the datasource's `extra_config` JSON column:
    {
      "webAppUrl": "https://script.google.com/macros/s/.../exec",
      "webAppSecretEncrypted": "<ciphertext>" | "webAppSecret": "<plaintext>",
      "spreadsheetId": "1AbC..."            # optional; else active spreadsheet
    }

No DB columns/migration required.
"""

import json
from typing import Any, Dict, List, Optional, Union

import httpx

from app.services.sync.adapters.base import DatabaseAdapter

# Map the adapter's where-operators to the Web App's filter ops.
_OP_MAP = {
    "==": "eq", "eq": "eq", "equals": "eq",
    "!=": "neq", "neq": "neq", "not_equals": "neq",
    ">": "gt", "gt": "gt",
    ">=": "gte", "gte": "gte",
    "<": "lt", "lt": "lt",
    "<=": "lte", "lte": "lte",
    "contains": "contains",
    "in": "in",
    "is_null": "is_null", "is_not_empty": "not_null", "not_null": "not_null",
    "is_empty": "is_null",
}


def _to_wire_filters(where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]]) -> List[Dict[str, Any]]:
    """Convert the adapter `where` shape to the Web App's WireFilter list."""
    if not where:
        return []
    items = where if isinstance(where, list) else [
        {"field": k, "operator": "==", "value": v} for k, v in where.items()
    ]
    out: List[Dict[str, Any]] = []
    for f in items:
        col = f.get("field") or f.get("column")
        if not col:
            continue
        op = _OP_MAP.get(f.get("operator") or f.get("op") or "==", "eq")
        if op in ("is_null", "not_null"):
            out.append({"column": col, "op": op})
        else:
            val = f.get("value")
            if val is None:
                continue
            out.append({"column": col, "op": op, "value": val})
    return out


class GoogleSheetsAdapter(DatabaseAdapter):
    """DatabaseAdapter backed by a Google Apps Script Web App."""

    def __init__(self, datasource):
        super().__init__(datasource)
        cfg = self._read_config()
        self._web_app_url = cfg.get("webAppUrl") or ""
        self._spreadsheet_id = cfg.get("spreadsheetId")
        self._client: Optional[httpx.AsyncClient] = None

        secret = cfg.get("webAppSecret")
        encrypted = cfg.get("webAppSecretEncrypted")
        if not secret and encrypted:
            try:
                from app.core.security import decrypt_field
                secret = decrypt_field(encrypted) or ""
            except Exception:
                secret = ""
        self._secret = secret or ""

        # Debug logging
        import logging
        logger = logging.getLogger("adapters.googlesheets")
        logger.info(f"[GoogleSheets] Initialized with webAppUrl={bool(self._web_app_url)}, spreadsheetId={bool(self._spreadsheet_id)}, secret={bool(self._secret)}")

    def _read_config(self) -> Dict[str, Any]:
        raw = getattr(self.datasource, "extra_config", None)
        if not raw:
            return {}
        try:
            return json.loads(raw) if isinstance(raw, str) else dict(raw)
        except (json.JSONDecodeError, TypeError):
            return {}

    # ---- lifecycle ----
    async def connect(self) -> None:
        if not self._web_app_url:
            raise ValueError("Google Sheets datasource missing webAppUrl in extra_config")
        self._client = httpx.AsyncClient(timeout=30, follow_redirects=True)

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    def _require_client(self) -> httpx.AsyncClient:
        if self._client is None:
            # Stateless fallback so callers that skip connect() still work.
            self._client = httpx.AsyncClient(timeout=30, follow_redirects=True)
        return self._client

    async def _call(self, action: str, **fields: Any) -> Any:
        client = self._require_client()
        payload = {"secret": self._secret, "action": action, **fields}
        logger = logging.getLogger("adapters.googlesheets")
        logger.info(f"[GoogleSheets] Calling {self._web_app_url} with action={action}, payload_keys={list(payload.keys())}")
        resp = await client.post(self._web_app_url, json=payload)
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"[GoogleSheets] Response for {action}: {list(result.keys()) if isinstance(result, dict) else type(result)}")
        return result

    # ---- schema ----
    async def get_tables(self) -> List[str]:
        schema = await self._call("schema")
        return [t["name"] for t in (schema.get("tables") or [])]

    async def get_schema(self, table: str) -> Dict[str, Any]:
        schema = await self._call("schema")
        for t in (schema.get("tables") or []):
            if t.get("name") == table:
                return {"columns": t.get("columns") or [], "foreign_keys": []}
        return {"columns": [], "foreign_keys": []}

    # ---- reads ----
    async def _rows(
        self,
        table: str,
        columns: Optional[List[str]] = None,
        where=None,
        limit: int = 100,
        offset: int = 0,
        order_by: Optional[str] = None,
        order_direction: str = "asc",
        search: Optional[str] = None,
    ) -> Dict[str, Any]:
        page_size = max(int(limit or 0), 1)
        page = max(int(offset or 0) // page_size, 0) if page_size else 0
        query: Dict[str, Any] = {
            "kind": "rows",
            "table": table,
            "filters": _to_wire_filters(where),
            "page": page,
            "pageSize": page_size,
        }
        if columns:
            query["columns"] = ",".join(columns)
        if order_by:
            query["sort"] = {"column": order_by, "direction": order_direction or "asc"}
        if search:
            query["search"] = search
        return await self._call("rows", query=query)

    async def read_records(self, table, columns=None, where=None, limit=100, offset=0, order_by=None, order_direction="asc"):
        result = await self._rows(table, columns, where, limit, offset, order_by, order_direction)
        return result.get("rows") or []

    async def read_record_by_key(self, table, key_column, key_value):
        rows = await self.read_records(
            table, where=[{"field": key_column, "operator": "==", "value": key_value}], limit=1
        )
        return rows[0] if rows else None

    async def count_records(self, table, where=None):
        # rows action returns `total` = filtered count regardless of page.
        result = await self._rows(table, where=where, limit=1)
        return int(result.get("total") or 0)

    async def search_records(self, table, query, limit=100):
        result = await self._rows(table, search=query, limit=limit)
        return result.get("rows") or []

    async def count_search_matches(self, table, query):
        result = await self._rows(table, search=query, limit=1)
        return int(result.get("total") or 0)

    async def aggregate(self, table, category, aggregation="count", value=None, filters=None, sort="none", limit=10):
        query = {
            "kind": "aggregate",
            "table": table,
            "category": category,
            "aggregation": aggregation,
            "value": value,
            "filters": _to_wire_filters(filters),
            "sort": sort,
            "limit": limit,
        }
        return await self._call("aggregate", query=query)

    # ---- writes ----
    async def upsert_record(self, table, record, key_column):
        existing = await self.read_record_by_key(table, key_column, record.get(key_column))
        if existing:
            await self._call("update", table=table, match={"key": key_column, "value": record.get(key_column)}, patch=record)
        else:
            await self._call("insert", table=table, records=[record])
        return record

    async def delete_record(self, table, key_column, key_value):
        result = await self._call("delete", table=table, match={"key": key_column, "value": key_value})
        return bool((result or {}).get("deleted"))
