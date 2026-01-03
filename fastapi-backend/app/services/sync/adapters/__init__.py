"""Database adapters package."""

from app.services.sync.adapters.base import DatabaseAdapter
from app.services.sync.adapters.supabase_adapter import SupabaseAdapter
from app.services.sync.adapters.postgres_adapter import PostgresAdapter
from app.services.sync.adapters.mysql_adapter import MySQLAdapter
from app.services.sync.adapters.wordpress_api_adapter import WordPressRestAdapter, WordPressGraphQLAdapter
from app.services.sync.adapters.neon_adapter import NeonAdapter
from app.services.sync.models.datasource import Datasource, DatasourceType


def get_adapter(datasource: Datasource) -> DatabaseAdapter:
    """Factory function to get the appropriate adapter for a datasource."""
    adapter_map = {
        DatasourceType.SUPABASE: SupabaseAdapter,
        DatasourceType.POSTGRES: PostgresAdapter,
        DatasourceType.WORDPRESS: MySQLAdapter,  # WordPress DB uses MySQL
        DatasourceType.WORDPRESS_REST: WordPressRestAdapter,
        DatasourceType.WORDPRESS_GRAPHQL: WordPressGraphQLAdapter,
        DatasourceType.NEON: NeonAdapter,
        DatasourceType.MYSQL: MySQLAdapter,
    }
    
    adapter_class = adapter_map.get(datasource.type)
    if not adapter_class:
        raise ValueError(f"Unsupported datasource type: {datasource.type}")
    
    return adapter_class(datasource)


__all__ = [
    "DatabaseAdapter",
    "SupabaseAdapter",
    "PostgresAdapter",
    "MySQLAdapter",
    "WordPressRestAdapter",
    "WordPressGraphQLAdapter",
    "NeonAdapter",
    "get_adapter",
]


