"""Database adapters package.

Credential centralization (task #124): the factory resolves credentials from
the datasource's Connected Account (``EdgeProviderAccount``) ONCE, hydrating a
TRANSIENT clone that is handed to the adapter. Adapters are pure connection
handlers — they never resolve credentials themselves and never see the
session-attached row.
"""

import json
import logging
from typing import Any, Optional

from app.services.sync.adapters.base import DatabaseAdapter
from app.services.sync.adapters.supabase_adapter import SupabaseAdapter
from app.services.sync.adapters.postgres_adapter import PostgresAdapter
from app.services.sync.adapters.mysql_adapter import MySQLAdapter
from app.services.sync.adapters.wordpress_api_adapter import WordPressRestAdapter, WordPressGraphQLAdapter
from app.services.sync.adapters.wordpress_plugin_adapter import WordPressPluginAdapter
from app.services.sync.adapters.neon_adapter import NeonAdapter
from app.services.sync.adapters.google_sheets_adapter import GoogleSheetsAdapter
from app.services.sync.adapters.rest_adapter import RESTAdapter
from app.services.sync.models.datasource import Datasource, DatasourceType

logger = logging.getLogger("app.services.sync.adapters")

_ADAPTER_MAP = {
    DatasourceType.SUPABASE: SupabaseAdapter,
    DatasourceType.POSTGRES: PostgresAdapter,
    DatasourceType.WORDPRESS_REST: WordPressRestAdapter,
    DatasourceType.WORDPRESS_GRAPHQL: WordPressGraphQLAdapter,
    DatasourceType.WORDPRESS_PLUGIN: WordPressPluginAdapter,
    DatasourceType.NEON: NeonAdapter,
    DatasourceType.MYSQL: MySQLAdapter,
    DatasourceType.GOOGLE_SHEETS: GoogleSheetsAdapter,
    DatasourceType.REST: RESTAdapter,
}

# Datasource types whose credentials travel in ``extra_config`` JSON
# (google_sheets, rest) rather than the mapped connection columns.
_EXTRA_CONFIG_TYPES = {DatasourceType.GOOGLE_SHEETS, DatasourceType.REST}

# Resolver bookkeeping keys — never merge these into datasource config.
_INTERNAL_CRED_KEYS = {"source", "provider_id", "provider_type", "_creds", "_metadata"}


def get_adapter(datasource: Datasource, db: Any = None) -> DatabaseAdapter:
    """Factory function to get the appropriate adapter for a datasource.

    Credentials are resolved HERE, once: if the datasource references a
    Connected Account (``provider_account_id``), a transient clone is hydrated
    from the CA and the adapter receives the clone — never the caller's
    (possibly session-attached) row. Adapters must not call
    ``get_datasource_credentials`` themselves.

    Args:
        datasource: The datasource model instance
        db: Optional session. Note: ``get_datasource_credentials`` opens its
            own main-DB SessionLocal for the CA lookup (the sync AsyncSession
            cannot see EdgeProviderAccount), so this is only forwarded to
            adapters that accept it.

    Returns:
        Adapter instance for the datasource type
    """
    adapter_class = _ADAPTER_MAP.get(datasource.type)
    if not adapter_class:
        raise ValueError(f"Unsupported datasource type: {datasource.type}")

    resolved = _hydrate_from_connected_account(datasource, db)

    # Try passing db session if adapter supports it (kwargs-compatible)
    try:
        return adapter_class(resolved, db=db)
    except TypeError:
        # Adapter doesn't accept db parameter (legacy adapter)
        return adapter_class(resolved)


def _select_secret(ds_type: Any, creds: dict) -> Optional[str]:
    """Pick the secret destined for the clone's ``api_key_encrypted`` column."""
    t = ds_type.value if hasattr(ds_type, "value") else str(ds_type)
    if t == "supabase":  # mirror get_supabase_context(mode="builder")
        return creds.get("service_role_key") or creds.get("anon_key") or creds.get("api_key")
    if t.startswith("wordpress"):
        return creds.get("app_password") or creds.get("api_key")
    return creds.get("api_key")


def _hydrate_from_connected_account(datasource: Datasource, db: Any = None) -> Datasource:
    """Return a TRANSIENT clone with credentials resolved from the Connected Account.

    Never mutates the passed instance (it may be session-attached; a later
    commit would persist plaintext — see testing.py::test_datasource which
    calls ``get_adapter`` then ``await db.commit()``). Fail-open: without a CA,
    a missing CA row, or a resolution error, the datasource is returned
    unchanged (legacy inline behaviour).
    """
    if not getattr(datasource, "provider_account_id", None):
        return datasource  # no CA → legacy row, unchanged behaviour
    from app.core.credential_resolver import get_datasource_credentials
    try:
        creds = get_datasource_credentials(db, datasource)
    except Exception as e:
        # Resolution failure must not break the adapter — it will raise its
        # own missing-credentials error. Logged, not swallowed silently
        # (silent swallowing is what hid the WordPress 401 root cause).
        logger.warning(
            "CA credential resolution failed for datasource %s (%s): %s",
            getattr(datasource, "id", "?"), getattr(datasource, "type", "?"), e,
        )
        return datasource
    if creds.get("source") != "connected_account":
        return datasource

    clone = _clone_transient_datasource(datasource)

    if datasource.type in _EXTRA_CONFIG_TYPES:
        _hydrate_extra_config(clone, creds)  # google_sheets, rest
    else:
        _hydrate_columns(clone, datasource.type, creds)
    return clone


def _hydrate_columns(clone: Datasource, ds_type: Any, creds: dict) -> None:
    """Hydrate the mapped connection columns of the clone from CA creds.

    CA is AUTHORITATIVE: CA values override inline columns, and any inline
    secret with no CA value is CLEARED on the clone (no stale-secret fallback).

    Secrets are written as PLAINTEXT into the clone's ``*_encrypted`` columns —
    this is safe and intentional: ``decrypt_field`` (security.py) passes
    non-Fernet input through unchanged, so adapters reading via
    ``decrypt_field(...)`` receive the plaintext either way. The clone is
    transient (never session-added), so the plaintext cannot be persisted.
    """
    api_url = creds.get("api_url") or creds.get("base_url")
    if api_url:
        clone.api_url = api_url
    for col in ("host", "database", "username"):
        if creds.get(col):
            setattr(clone, col, creds[col])
    if creds.get("port"):
        try:
            clone.port = int(creds["port"])
        except (TypeError, ValueError):
            pass
    clone.api_key_encrypted = _select_secret(ds_type, creds) or None
    clone.password_encrypted = creds.get("password") or None
    clone.anon_key_encrypted = creds.get("anon_key") or None


def _hydrate_extra_config(clone: Datasource, creds: dict) -> None:
    """Hydrate the extra_config JSON of the clone from CA creds (sheets/rest).

    CA values win over inline extra_config; secrets are included
    (webAppSecret, headers, ...) — same transient-clone plaintext reasoning
    as ``_hydrate_columns``.
    """
    base: dict = {}
    if clone.extra_config:
        try:
            base = json.loads(clone.extra_config)
        except (json.JSONDecodeError, TypeError):
            base = {}
    merged = {**base, **{k: v for k, v in creds.items() if k not in _INTERNAL_CRED_KEYS}}
    clone.extra_config = json.dumps(merged)


def _clone_transient_datasource(ds: Datasource) -> Datasource:
    """Build a transient (never-persisted) copy of a datasource row.

    A ``Datasource()`` that is never ``session.add``-ed cannot be flushed, so
    plaintext hydrated onto it can never reach the database. ``id`` is carried
    over so logging/caching keyed on the datasource id stays correct.
    """
    fields = ("id", "name", "type", "host", "port", "database", "username",
              "password_encrypted", "api_url", "api_key_encrypted", "anon_key_encrypted",
              "table_prefix", "extra_config", "provider_account_id", "project_id")
    clone = Datasource(**{f: getattr(ds, f, None) for f in fields
                          if getattr(ds, f, None) is not None})
    conn_uri = getattr(ds, "connection_uri", None)  # dynamic attr, test-raw only
    if conn_uri:
        setattr(clone, "connection_uri", conn_uri)
    return clone


__all__ = [
    "DatabaseAdapter",
    "SupabaseAdapter",
    "PostgresAdapter",
    "MySQLAdapter",
    "WordPressRestAdapter",
    "WordPressGraphQLAdapter",
    "WordPressPluginAdapter",
    "NeonAdapter",
    "GoogleSheetsAdapter",
    "RESTAdapter",
    "get_adapter",
]
