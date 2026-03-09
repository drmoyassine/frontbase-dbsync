"""
Database configuration and session management for SQLite config storage.
"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.services.sync.config import settings


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""
    pass


# Ensure data directory exists
os.makedirs("data", exist_ok=True)

from sqlalchemy import event

# Create async engine
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
)

@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    # Only run PRAGMA execution for SQLite connections
    if "sqlite" not in str(settings.database_url):
        return

    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
    except:
        pass
    finally:
        cursor.close()

# Session factory
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
# Tables that are safe to drop and recreate (transient caches, not user data)
_REBUILDABLE_TABLES = {"table_schema_cache"}


def _drop_stale_cache_tables(connection):
    """Drop cache tables whose physical schema has extra/conflicting columns.

    Only targets tables in _REBUILDABLE_TABLES — these contain transient cache
    data that is rebuilt from remote sources on next access.
    """
    import logging
    from sqlalchemy import text
    _logger = logging.getLogger("sync.db.migrate")

    for table in Base.metadata.sorted_tables:
        if table.name not in _REBUILDABLE_TABLES:
            continue

        result = connection.execute(text(f'PRAGMA table_info("{table.name}")'))
        existing_cols = {row[1] for row in result}

        if not existing_cols:
            continue  # Table doesn't exist — nothing to drop

        model_cols = {col.name for col in table.columns}
        stale_cols = existing_cols - model_cols

        if stale_cols:
            _logger.info(f"[AUTO-MIGRATE] Dropping stale cache table '{table.name}' (extra cols: {stale_cols})")
            connection.execute(text(f'DROP TABLE IF EXISTS "{table.name}"'))


def _add_missing_columns(connection):
    """Compare model columns against physical SQLite tables and ADD any missing ones.

    This is a lightweight alternative to Alembic for simple column additions.
    Runs on every startup — safe because ALTER TABLE ADD COLUMN is a no-op if
    the column already exists (we check via PRAGMA first).
    """
    import logging
    _logger = logging.getLogger("sync.db.migrate")

    for table in Base.metadata.sorted_tables:
        # Get existing columns from SQLite
        result = connection.execute(
            __import__("sqlalchemy").text(f"PRAGMA table_info(\"{table.name}\")")
        )
        existing_cols = {row[1] for row in result}

        if not existing_cols:
            continue  # Table doesn't exist yet — create_all will handle it

        for col in table.columns:
            if col.name not in existing_cols:
                # Build the column type string
                col_type = col.type.compile(connection.dialect)
                nullable = "" if col.nullable else " NOT NULL"
                default = ""
                if col.default is not None and col.default.is_scalar:
                    from enum import Enum as _Enum
                    val = col.default.arg.value if isinstance(col.default.arg, _Enum) else col.default.arg
                    default = f" DEFAULT {val!r}"
                stmt = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}{nullable}{default}'
                try:
                    connection.execute(__import__("sqlalchemy").text(stmt))
                    _logger.info(f"[AUTO-MIGRATE] Added column {table.name}.{col.name} ({col_type})")
                except Exception as e:
                    _logger.warning(f"[AUTO-MIGRATE] Could not add {table.name}.{col.name}: {e}")


async def init_db():
    """Initialize database tables and auto-migrate missing columns."""
    async with engine.begin() as conn:
        # Import models to register them with Base
        from app.services.sync.models import datasource, sync_config, job, conflict, view, project_settings, table_schema  # noqa

        # Drop stale cache tables whose schema diverged (safe — cache is rebuilt)
        if "sqlite" in str(settings.database_url):
            await conn.run_sync(_drop_stale_cache_tables)

        await conn.run_sync(Base.metadata.create_all)

        # Auto-migrate: add any columns defined in models but missing from the DB.
        # create_all only creates NEW tables — it won't ALTER existing ones.
        if "sqlite" in str(settings.database_url):
            await conn.run_sync(_add_missing_columns)


async def get_db():
    """Dependency to get database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
# auto-migrate v2
