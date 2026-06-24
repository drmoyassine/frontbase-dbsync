"""Database adapters package."""

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


def get_adapter(datasource: Datasource, db=None) -> DatabaseAdapter:
    """Factory function to get the appropriate adapter for a datasource.

    Args:
        datasource: The datasource model instance
        db: Optional database session for resolving Connected Account credentials.
            Adapters that support Connected Account credential resolution will
            use this to fetch credentials from EdgeProviderAccount.

    Returns:
        Adapter instance for the datasource type
    """
    from typing import Optional
    from sqlalchemy.orm import Session

    adapter_map = {
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

    adapter_class = adapter_map.get(datasource.type)
    if not adapter_class:
        raise ValueError(f"Unsupported datasource type: {datasource.type}")

    # Try passing db session if adapter supports it (kwargs-compatible)
    try:
        return adapter_class(datasource, db=db)
    except TypeError:
        # Adapter doesn't accept db parameter (legacy adapter)
        return adapter_class(datasource)


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


