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

    Dialect-agnostic (SQLite + PostgreSQL) via SQLAlchemy inspect. Each DDL runs
    in a SAVEPOINT so a failure doesn't abort the whole startup transaction (on
    Postgres a failed statement poisons the surrounding transaction).
    """
    import logging
    from sqlalchemy import text, inspect as sa_inspect
    _logger = logging.getLogger("sync.db.migrate")

    insp = sa_inspect(connection)
    existing_tables = set(insp.get_table_names())

    for table in Base.metadata.sorted_tables:
        if table.name not in _REBUILDABLE_TABLES or table.name not in existing_tables:
            continue

        existing_cols = {c["name"] for c in insp.get_columns(table.name)}
        model_cols = {col.name for col in table.columns}
        stale_cols = existing_cols - model_cols

        if stale_cols:
            _logger.info(f"[AUTO-MIGRATE] Dropping stale cache table '{table.name}' (extra cols: {stale_cols})")
            try:
                with connection.begin_nested():
                    connection.execute(text(f'DROP TABLE IF EXISTS "{table.name}"'))
            except Exception as e:
                _logger.warning(f"[AUTO-MIGRATE] Could not drop stale table {table.name}: {e}")


def _add_missing_columns(connection):
    """Compare model columns against the physical tables and ADD any missing ones.

    A lightweight, dialect-agnostic (SQLite + PostgreSQL) self-heal for simple
    column additions. The sync tables (datasources, table_schema_cache, ...) are
    created by create_all, not Alembic, so without this a column added to a model
    never reaches an EXISTING Postgres table (create_all won't ALTER) → SELECT *
    fails with "column does not exist". Runs on every startup.

    Each ALTER runs in its own SAVEPOINT: on Postgres a failed statement aborts
    the surrounding transaction, so per-statement savepoints are required for the
    "try, warn, continue" behaviour to work across dialects.
    """
    import logging
    from sqlalchemy import text, inspect as sa_inspect
    _logger = logging.getLogger("sync.db.migrate")

    insp = sa_inspect(connection)
    existing_tables = set(insp.get_table_names())

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # Table doesn't exist yet — create_all will handle it

        existing_cols = {c["name"] for c in insp.get_columns(table.name)}

        for col in table.columns:
            if col.name in existing_cols:
                continue

            col_type = col.type.compile(connection.dialect)
            nullable = "" if col.nullable else " NOT NULL"
            default = ""
            if col.default is not None and hasattr(col.default, 'is_scalar') and col.default.is_scalar:  # type: ignore[union-attr]
                from enum import Enum as _Enum
                _arg = col.default.arg  # type: ignore[union-attr]
                val = _arg.value if isinstance(_arg, _Enum) else _arg
                default = f" DEFAULT {val!r}"
            stmt = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}{nullable}{default}'
            try:
                with connection.begin_nested():
                    connection.execute(text(stmt))
                _logger.info(f"[AUTO-MIGRATE] Added column {table.name}.{col.name} ({col_type})")
            except Exception as e:
                # A NOT NULL add fails on a populated table without a default.
                # Fall back to a nullable add so reads (SELECT *) stop crashing.
                if nullable:
                    try:
                        with connection.begin_nested():
                            connection.execute(text(
                                f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}{default}'
                            ))
                        _logger.info(f"[AUTO-MIGRATE] Added column {table.name}.{col.name} as NULLABLE (fallback)")
                        continue
                    except Exception as e2:
                        e = e2
                _logger.warning(f"[AUTO-MIGRATE] Could not add {table.name}.{col.name}: {e}")


async def init_db():
    """Initialize database tables and auto-migrate missing columns."""
    async with engine.begin() as conn:
        # Import models to register them with Base
        from app.services.sync.models import datasource, sync_config, job, conflict, view, project_settings, table_schema  # noqa

        # Drop stale cache tables whose schema diverged (safe — cache is rebuilt).
        # Runs on SQLite AND Postgres: the sync tables are managed by create_all,
        # not Alembic, so this is the only self-heal path on an existing DB.
        await conn.run_sync(_drop_stale_cache_tables)

        await conn.run_sync(Base.metadata.create_all)

        # Auto-migrate: add any columns defined in models but missing from the DB.
        # create_all only creates NEW tables — it won't ALTER existing ones, so an
        # existing Postgres table never gains a newly-added model column without this.
        await conn.run_sync(_add_missing_columns)

        # Idempotent startup backfill (Phase 1): associate project-less datasources to default project
        from app.config.edition import is_cloud
        if is_cloud():
            from sqlalchemy import text
            import logging
            _logger = logging.getLogger("sync.db.migrate")
            try:
                # Find default project
                default_proj = await conn.execute(text("SELECT id FROM project WHERE tenant_id IS NULL LIMIT 1"))
                row = default_proj.fetchone()
                if row:
                    default_id = row[0]
                    # Update datasources that have null project_id, skipping duplicates
                    # Use ON CONFLICT to handle unique constraint violations gracefully
                    await conn.execute(
                        text("""
                            UPDATE datasources
                            SET project_id = :default_id
                            WHERE id IN (
                                SELECT ds.id FROM datasources ds
                                WHERE ds.project_id IS NULL
                                AND NOT EXISTS (
                                    SELECT 1 FROM datasources existing
                                    WHERE existing.project_id = :default_id
                                    AND existing.name = ds.name
                                )
                            )
                        """),
                        {"default_id": default_id}
                    )
                    updated = await conn.execute(
                        text("SELECT COUNT(*) FROM datasources WHERE project_id = :default_id"),
                        {"default_id": default_id}
                    )
                    count = updated.scalar() or 0
                    _logger.info(f"[AUTO-MIGRATE] Backfilled unassigned datasources to default project '{default_id}' ({count} total)")
            except Exception as e:
                _logger.warning(f"[AUTO-MIGRATE] Backfill failed: {e}")


async def get_db():
    """Dependency to get database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
# auto-migrate v2
