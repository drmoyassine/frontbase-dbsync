"""
Neon adapter - PostgreSQL adapter optimized for Neon serverless.
"""

from typing import Any, Dict, List, Optional
import asyncpg

from app.services.sync.adapters.postgres_adapter import PostgresAdapter
from app.services.sync.models.datasource import Datasource


class NeonAdapter(PostgresAdapter):
    """
    Neon serverless PostgreSQL adapter.
    
    Optimized for Neon's connection pooling and serverless architecture.
    Uses smaller connection pool and handles connection timeouts gracefully.
    """
    
    async def connect(self) -> None:
        """Establish connection pool to Neon PostgreSQL."""
        # Neon uses smaller pool sizes due to serverless nature
        connection_string = self._build_connection_string()
        
        self._pool = await asyncpg.create_pool(
            connection_string,
            min_size=1,
            max_size=5,  # Smaller pool for serverless
            command_timeout=30,
            statement_cache_size=0,  # Disable for serverless
        )
    
    def _build_connection_string(self) -> str:
        """Build Neon connection string with SSL."""
        # Neon requires SSL
        user = self.datasource.username or ""
        password = self.datasource.password_encrypted or ""  # TODO: decrypt
        host = self.datasource.host
        port = self.datasource.port
        database = self.datasource.database
        
        # Neon connection string format
        return f"postgresql://{user}:{password}@{host}:{port}/{database}?sslmode=require"
    
    async def get_tables(self) -> List[str]:
        """Get list of tables, filtering out Neon system tables."""
        tables = await super().get_tables()
        
        # Filter out Neon internal tables
        neon_prefixes = ("_neon", "pg_", "information_schema")
        return [t for t in tables if not t.startswith(neon_prefixes)]
