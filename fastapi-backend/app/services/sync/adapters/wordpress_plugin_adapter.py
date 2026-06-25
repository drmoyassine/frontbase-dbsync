"""
WordPress Plugin adapter - talks to the Frontbase Connector WordPress plugin.

Unlike WordPressRestAdapter (which walks the public wp/v2 REST API and relies on
the X-WP-Total header for pagination), this adapter speaks to the custom
``/wp-json/frontbase/v1/`` endpoints exposed by the Frontbase Connector plugin:

    GET /info                              -> plugin + site capabilities
    GET /discover                          -> complete data manifest (post types,
                                              taxonomies, custom tables, ACF)
    GET /extract/{post_type}?page&per_page -> paginated, deserialized records

The plugin does the heavy lifting that the public REST API cannot:
  - deserializes PHP-serialized postmeta (the #1 migration blocker),
  - resolves ACF fields into structured data,
  - renders shortcodes to HTML (optional),
  - reports pagination in the *response body* (``total`` / ``total_pages``),
    not in response headers.

WordPress is treated as a **read-only migration source**: discovery and
extraction are supported; write operations raise ``NotImplementedError``.
"""

import base64
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional, Union

import httpx

from app.services.sync.adapters.wordpress_api_adapter import WordPressBaseApiAdapter
from app.services.sync.models.datasource import Datasource

logger = logging.getLogger(__name__)

# Standard fields present on every record returned by the plugin's extract
# endpoint (see Frontbase_Extraction::get_records). Used to build a synthetic
# schema when a post type has no custom fields.
_STANDARD_RECORD_FIELDS = [
    ("id", "integer"),
    ("title", "string"),
    ("content", "string"),
    ("excerpt", "string"),
    ("status", "string"),
    ("type", "string"),
    ("slug", "string"),
    ("permalink", "string"),
    ("date", "datetime"),
    ("date_gmt", "datetime"),
    ("modified", "datetime"),
    ("modified_gmt", "datetime"),
    ("parent", "integer"),
    ("menu_order", "integer"),
    ("comment_status", "string"),
    ("ping_status", "string"),
    ("author", "object"),
    ("featured_media", "object"),
    ("terms", "array"),
    ("meta", "object"),
    ("acf", "object"),
]


class WordPressPluginAdapter(WordPressBaseApiAdapter):
    """Adapter for WordPress sites running the Frontbase Connector plugin."""

    #: REST namespace exposed by the plugin
    PLUGIN_NAMESPACE = "frontbase/v1"

    def __init__(self, datasource: "Datasource", db: Optional[Any] = None) -> None:
        super().__init__(datasource)
        # _api_url is normalised (trailing slash stripped) by the base class
        self._plugin_base = f"{self._api_url}/wp-json/{self.PLUGIN_NAMESPACE}"
        # Short-lived in-process manifest cache (Redis is the durable layer)
        self._manifest_cache: Optional[Dict[str, Any]] = None

        # Resolve credentials from Connected Account or fallback to inline
        self._resolved_username: Optional[str] = None
        self._resolved_api_key: Optional[str] = None

        if db:
            from app.core.credential_resolver import get_datasource_credentials
            try:
                creds = get_datasource_credentials(db, datasource)
                self._resolved_username = creds.get("username") or datasource.username
                self._resolved_api_key = creds.get("app_password") or creds.get("api_key")
                # Store source for debugging
                self._credential_source = creds.get("source", "unknown")
                # Resolve the site URL from the Connected Account when the
                # datasource row doesn't carry it. Datasources created purely
                # from a Connected Account have an empty api_url column; without
                # this _plugin_base points at "/wp-json/frontbase/v1" (no host)
                # and every /discover + /extract call 404s, surfacing as an empty
                # Data Inspector with no error. Recompute _plugin_base because it
                # was derived from the (previously empty) _api_url above.
                if not self._api_url:
                    resolved_url = (creds.get("api_url") or creds.get("base_url") or "").strip()
                    if resolved_url:
                        if "://" not in resolved_url:
                            resolved_url = f"https://{resolved_url}"
                        self._api_url = resolved_url.rstrip("/")
                        self._plugin_base = f"{self._api_url}/wp-json/{self.PLUGIN_NAMESPACE}"
            except Exception as e:
                logger.warning("Failed to resolve credentials from Connected Account: %s", e)
                self._credential_source = "resolution_failed"

        if not self._resolved_username:
            self._resolved_username = datasource.username
        if not self._resolved_api_key:
            # Fallback: try decrypting inline field
            from app.core.security import decrypt_field
            self._resolved_api_key = decrypt_field(datasource.api_key_encrypted) or ""

    # ------------------------------------------------------------------ #
    # Low-level plugin HTTP helpers
    # ------------------------------------------------------------------ #
    def _plugin_url(self, path: str) -> str:
        """Build a URL under the plugin namespace."""
        return f"{self._plugin_base}/{path.lstrip('/')}"

    async def _plugin_get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """GET a plugin endpoint and return parsed JSON, raising on HTTP errors."""
        url = self._plugin_url(path)
        try:
            response = await self._client.get(url, params=params or {}, headers=self._get_headers())
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Plugin request %s failed: %s %s",
                path,
                exc.response.status_code,
                exc.response.text[:300],
            )
            raise
        except Exception as exc:
            logger.error("Plugin request %s errored: %s", path, exc)
            raise

    # ------------------------------------------------------------------ #
    # Plugin-specific operations (not part of the base adapter contract)
    # ------------------------------------------------------------------ #
    async def get_plugin_info(self) -> Dict[str, Any]:
        """Return the /info payload (no auth required by the plugin)."""
        return await self._plugin_get("info")

    async def discover(self, use_cache: bool = True) -> Dict[str, Any]:
        """
        Return the complete discovery manifest.

        Cached in Redis (5 min) and in-process to keep the UI fast; the
        manifest can be large for sites with many custom fields.
        """
        if self._manifest_cache is not None:
            return self._manifest_cache

        from app.services.sync.redis_client import cache_get, cache_set, get_configured_redis_settings

        cache_key = None
        if use_cache:
            key_base = f"{self._api_url}:discover"
            cache_key = f"wp_plugin:discover:{hashlib.md5(key_base.encode()).hexdigest()}"
            cached = await cache_get(None, cache_key)  # type: ignore[arg-type]
            if cached is not None:
                self._manifest_cache = cached
                return cached

        manifest = await self._plugin_get("discover")
        if not isinstance(manifest, dict):
            manifest = {}

        self._manifest_cache = manifest

        if cache_key:
            settings = await get_configured_redis_settings()
            ttl = settings["ttl_count"] if settings else 300  # 5 min default
            await cache_set(None, cache_key, manifest, ttl=ttl)  # type: ignore[arg-type]

        return manifest

    # ------------------------------------------------------------------ #
    # DatabaseAdapter contract
    # ------------------------------------------------------------------ #
    async def connect(self) -> None:
        """Connection is lazy via the shared httpx client."""
        pass

    async def disconnect(self) -> None:
        """Shared client is kept alive across requests."""
        pass

    async def get_tables(self) -> List[str]:
        """
        Discover available post types. Custom tables surfaced by the plugin
        are not listable here because they are not addressable via
        ``/extract/{post_type}``; they are surfaced separately via discover().
        """
        try:
            manifest = await self.discover()
        except Exception as exc:
            logger.warning("Plugin discovery failed for %s: %s", self._api_url, exc)
            return []

        post_types = manifest.get("post_types", []) or []
        names = [pt.get("name") for pt in post_types if pt.get("name")]

        # Core types first, then alphabetical — matches WordPressRestAdapter UX
        core = {"post", "page"}
        return sorted(names, key=lambda n: (n not in core, n))

    async def get_schema(self, table: str) -> Dict[str, Any]:
        """
        Build a column schema for a post type from the discovery manifest:
        standard record fields first, then the plugin's inferred custom fields
        (postmeta), each annotated with its ACF metadata when applicable.
        """
        manifest = await self.discover()
        post_type = next(
            (pt for pt in (manifest.get("post_types") or []) if pt.get("name") == table),
            None,
        )

        columns: List[Dict[str, Any]] = []
        seen = set()

        def add_column(name: str, col_type: str, primary_key: bool = False) -> None:
            if not name or name in seen:
                return
            seen.add(name)
            columns.append(
                {
                    "name": name,
                    "type": col_type,
                    "nullable": True,
                    "primary_key": primary_key,
                }
            )

        # 1. Standard fields
        for name, col_type in _STANDARD_RECORD_FIELDS:
            add_column(name, col_type, primary_key=(name == "id"))

        # 2. Custom fields (postmeta), with ACF enrichment
        if post_type:
            for cf in post_type.get("custom_fields", []) or []:
                meta_key = cf.get("meta_key")
                add_column(meta_key, self._normalise_meta_type(cf.get("type")))

        return {"columns": columns}

    async def read_records(
        self,
        table: str,
        columns: Optional[List[str]] = None,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        limit: int = 100,
        offset: int = 0,
        order_by: Optional[str] = None,
        order_direction: Optional[str] = "asc",
        use_cache: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Read records via the plugin's /extract/{post_type} endpoint.

        The plugin paginates in the response body (``total`` / ``total_pages``)
        and always orders by date DESC server-side, so ``order_by`` is advisory.
        Simple field filters (id/slug/status/...) map to a client-side scan;
        everything else is fetched then filtered locally like WordPressRestAdapter.
        """
        from app.services.sync.redis_client import cache_get, cache_set, get_configured_redis_settings

        cache_key = None
        if use_cache:
            where_str = json.dumps(where, sort_keys=True, default=str) if where else ""
            cols_str = json.dumps(columns, sort_keys=True) if columns else ""
            key_base = f"{self._api_url}:{table}:{limit}:{offset}:{where_str}:{cols_str}"
            cache_key = f"wp_plugin:data:{hashlib.md5(key_base.encode()).hexdigest()}"
            cached = await cache_get(None, cache_key)  # type: ignore[arg-type]
            if cached is not None:
                return cached

        # Normalise filters once
        filter_list: List[Dict[str, Any]] = []
        if where:
            filter_list = (
                where
                if isinstance(where, list)
                else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
            )

        per_page = min(max(limit, 1), 100)  # plugin caps at 100
        start_page = max((offset // 100) + 1, 1)

        # FAST PATH: no filter -> single targeted page is usually enough
        if not filter_list:
            records = await self._fetch_extract_page(table, page=start_page, per_page=per_page)
            # Account for sub-page offsets when offset isn't page-aligned
            sub_offset = offset % 100
            if sub_offset:
                records = records[sub_offset:]
            records = records[:limit]
            records = self._project(records, columns)
        else:
            # SLOW PATH: scan pages applying client-side filters
            records = await self._scan_filtered(table, filter_list, limit)

        if cache_key:
            settings = await get_configured_redis_settings()
            ttl = settings["ttl_data"] if settings else 60
            await cache_set(None, cache_key, records, ttl=ttl)  # type: ignore[arg-type]

        return records

    async def read_record_by_key(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> Optional[Dict[str, Any]]:
        """Read a single record by key. Scans pages (capped) since the plugin
        does not expose a single-record lookup."""
        if key_column != "id":
            records = await self.read_records(
                table, where={key_column: key_value}, limit=1
            )
            return records[0] if records else None

        # id lookups: scan up to 5 pages looking for the matching record
        for page in range(1, 6):
            batch = await self._fetch_extract_page(table, page=page, per_page=100)
            if not batch:
                break
            for record in batch:
                if str(record.get("id")) == str(key_value):
                    return record
        return None

    async def upsert_record(
        self,
        table: str,
        record: Dict[str, Any],
        key_column: str,
    ) -> Dict[str, Any]:
        """WordPress is a read-only migration source."""
        raise NotImplementedError(
            "WordPress plugin adapter is read-only; writes are not supported."
        )

    async def delete_record(
        self,
        table: str,
        key_column: str,
        key_value: Any,
    ) -> bool:
        """WordPress is a read-only migration source."""
        raise NotImplementedError(
            "WordPress plugin adapter is read-only; deletes are not supported."
        )

    async def count_records(
        self,
        table: str,
        where: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
        use_cache: bool = True,
    ) -> int:
        """
        Return the total record count. For unfiltered counts the plugin reports
        the exact total in the extract body; for filtered counts we estimate
        from the first page's match rate (same strategy as WordPressRestAdapter).
        """
        from app.services.sync.redis_client import cache_get, cache_set, get_configured_redis_settings

        cache_key = None
        if use_cache:
            where_str = json.dumps(where, sort_keys=True, default=str) if where else ""
            key_base = f"{self._api_url}:{table}:count:{where_str}"
            cache_key = f"wp_plugin:count:{hashlib.md5(key_base.encode()).hexdigest()}"
            cached = await cache_get(None, cache_key)  # type: ignore[arg-type]
            if cached is not None:
                return int(cached)

        page_payload = await self._plugin_get(
            f"extract/{table}", params={"page": 1, "per_page": 1}
        )
        server_total = int(page_payload.get("total", 0))

        filter_list: List[Dict[str, Any]] = []
        if where:
            filter_list = (
                where
                if isinstance(where, list)
                else [{"field": k, "operator": "==", "value": v} for k, v in where.items()]
            )

        if not filter_list:
            final_count = server_total
        else:
            sample = page_payload.get("records", []) or []
            if not sample:
                final_count = 0
            else:
                # Fetch a fuller sample to estimate the match rate
                sample_batch = await self._fetch_extract_page(table, page=1, per_page=100)
                matches = sum(1 for r in sample_batch if self._matches_filter(r, filter_list))
                if len(sample_batch) < 100 or matches == len(sample_batch):
                    final_count = matches
                else:
                    final_count = max(matches, int(server_total * (matches / len(sample_batch))))

        if cache_key:
            settings = await get_configured_redis_settings()
            ttl = settings["ttl_count"] if settings else 300
            await cache_set(None, cache_key, final_count, ttl=ttl)  # type: ignore[arg-type]

        return final_count

    async def search_records(
        self,
        table: str,
        query: str,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Search across title/content/excerpt via client-side filtering."""
        return await self._scan_filtered(
            table,
            [
                {"field": "title", "operator": "contains", "value": query},
                {"field": "content", "operator": "contains", "value": query},
                {"field": "excerpt", "operator": "contains", "value": query},
            ],
            limit,
            match_any=True,
        )

    async def count_search_matches(self, table: str, query: str) -> int:
        """Estimate search match count from the first page."""
        batch = await self._fetch_extract_page(table, page=1, per_page=100)
        if not batch:
            return 0
        matches = sum(
            1
            for r in batch
            if any(
                query.lower() in str(r.get(f) or "").lower()
                for f in ("title", "content", "excerpt")
            )
        )
        total = await self.count_records(table)
        if len(batch) < 100 or matches == len(batch):
            return matches
        return max(matches, int(total * (matches / len(batch))))

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #
    async def _fetch_extract_page(
        self, table: str, page: int = 1, per_page: int = 100
    ) -> List[Dict[str, Any]]:
        """Fetch one page from /extract/{post_type} and return its records."""
        payload = await self._plugin_get(
            f"extract/{table}",
            params={"page": page, "per_page": min(max(per_page, 1), 100)},
        )
        records = payload.get("records", []) if isinstance(payload, dict) else []
        return records if isinstance(records, list) else []

    async def _scan_filtered(
        self,
        table: str,
        filter_list: List[Dict[str, Any]],
        limit: int,
        match_any: bool = False,
        max_pages: int = 5,
    ) -> List[Dict[str, Any]]:
        """Scan pages applying client-side filters until limit is reached."""
        matched: List[Dict[str, Any]] = []
        for page in range(1, max_pages + 1):
            batch = await self._fetch_extract_page(table, page=page, per_page=100)
            if not batch:
                break
            for record in batch:
                ok = (
                    self._record_matches_any(record, filter_list)
                    if match_any
                    else self._matches_filter(record, filter_list)
                )
                if ok:
                    matched.append(record)
                    if len(matched) >= limit:
                        return matched
            if len(batch) < 100:
                break
        return matched

    @staticmethod
    def _project(records: List[Dict[str, Any]], columns: Optional[List[str]]) -> List[Dict[str, Any]]:
        """Restrict each record to the requested columns (dot-path aware)."""
        if not columns:
            return records

        def pick(record: Dict[str, Any]) -> Dict[str, Any]:
            out: Dict[str, Any] = {}
            for col in columns:
                value: Any = record
                for part in col.split("."):
                    if isinstance(value, dict):
                        value = value.get(part)
                    else:
                        value = None
                        break
                out[col] = value
            return out

        return [pick(r) for r in records]

    @staticmethod
    def _matches_filter(record: Dict[str, Any], filter_list: List[Dict[str, Any]]) -> bool:
        """True if record matches ALL filters (AND). Mirrors WordPressRestAdapter."""
        for f in filter_list:
            if not WordPressPluginAdapter._match_one(record, f):
                return False
        return True

    @staticmethod
    def _record_matches_any(record: Dict[str, Any], filter_list: List[Dict[str, Any]]) -> bool:
        """True if record matches ANY filter (OR). Used for search."""
        return any(WordPressPluginAdapter._match_one(record, f) for f in filter_list)

    @staticmethod
    def _match_one(record: Dict[str, Any], f: Dict[str, Any]) -> bool:
        field = f.get("field")
        target = f.get("value")
        op = f.get("operator", "==")
        if not field:
            return True
        if (target is None or target == "") and op not in ("is_empty", "is_not_empty"):
            return True

        # Resolve dot-notation path
        actual: Any = record
        for part in field.split("."):
            if isinstance(actual, dict):
                actual = actual.get(part)
            else:
                actual = None
                break

        actual_str = str(actual or "").lower()
        target_str = str(target).lower()

        if op in ("==", "eq"):
            return actual_str == target_str
        if op in ("!=", "neq"):
            return actual_str != target_str
        if op == "contains":
            return target_str in actual_str
        if op == "not_contains":
            return target_str not in actual_str
        if op == "starts_with":
            return actual_str.startswith(target_str)
        if op == "ends_with":
            return actual_str.endswith(target_str)
        if op == "is_empty":
            return actual is None or str(actual) == ""
        if op == "is_not_empty":
            return actual is not None and str(actual) != ""
        if op == "in":
            vals = [x.strip().lower() for x in str(target).split(",") if x.strip()]
            return actual_str in vals
        if op == "not_in":
            vals = [x.strip().lower() for x in str(target).split(",") if x.strip()]
            return actual_str not in vals
        if op in (">", "<", ">=", "<="):
            try:
                a, b = float(str(actual or 0)), float(str(target or 0))
                return {
                    ">": a > b,
                    "<": a < b,
                    ">=": a >= b,
                    "<=": a <= b,
                }[op]
            except (ValueError, TypeError):
                return False
        return False

    @staticmethod
    def _normalise_meta_type(raw: Optional[str]) -> str:
        """Map the plugin's inferred meta type to a schema column type."""
        if not raw:
            return "string"
        raw = raw.lower()
        mapping = {
            "int": "integer",
            "integer": "integer",
            "float": "number",
            "double": "number",
            "number": "number",
            "bool": "boolean",
            "boolean": "boolean",
            "array": "array",
            "object": "object",
            "datetime": "datetime",
            "date": "date",
            "text": "text",
        }
        return mapping.get(raw, "string")

    def _get_auth_header(self) -> Dict[str, str]:  # type: ignore[override]
        """Basic Auth header using the decrypted WordPress application password.

        Credentials are resolved from Connected Account (preferred) or fallback
        to inline encrypted fields. This ensures safe credential handling with
        proper fallback on decryption failures.
        """
        from app.core.security import decrypt_field

        # Use resolved credentials from __init__ if available
        username = getattr(self, "_resolved_username", None) or self.datasource.username or ""
        api_key = getattr(self, "_resolved_api_key", None)

        if not api_key:
            # Final fallback: try decrypting inline field
            api_key = decrypt_field(self.datasource.api_key_encrypted) or ""
            # Detect undecryptable credentials (FERNET_KEY mismatch on redeploy):
            # Fernet tokens are base64-url and start with 'gAAAAA'. When decryption
            # fails, decrypt_field returns the raw blob, which always 401s at
            # WordPress (BACKEND-G). Root cause is operational: FERNET_KEY must
            # persist across deploys, else stored app_passwords are unrecoverable.
            if api_key and api_key.startswith("gAAAAA"):
                logger.error(
                    "WP plugin credentials for %s appear undecryptable (FERNET_KEY "
                    "mismatch on redeploy?). Re-enter the app_password after "
                    "persisting FERNET_KEY in the deployment environment.",
                    self.datasource.api_url,
                )

        auth_string = api_key
        if ":" not in api_key and username:
            auth_string = f"{username}:{api_key}"
        if ":" not in auth_string:
            return {}

        encoded = base64.b64encode(auth_string.encode()).decode()
        return {"Authorization": f"Basic {encoded}"}
