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


def _update_enum_check_constraints(connection):
    """Update CHECK constraints for enum columns to include all current enum values.

    SQLAlchemy creates CHECK constraints for non-native enums that limit values
    to what existed when the table was created. When new enum values are added,
    the constraint must be updated to allow them.

    Currently handles:
    - datasources.type: includes 'wordpress_plugin' and other newer values

    Uses savepoints (nested transactions) to prevent errors from aborting the
    main transaction.
    """
    import logging
    from sqlalchemy import text, inspect as sa_inspect
    from app.services.sync.models.datasource import DatasourceType

    _logger = logging.getLogger("sync.db.migrate")
    dialect = connection.dialect.name

    if dialect == 'sqlite':
        return  # SQLite doesn't use CHECK constraints for enums

    if dialect != 'postgresql':
        return  # Only handle PostgreSQL

    insp = sa_inspect(connection)

    # Update datasources.type CHECK constraint
    if 'datasources' not in insp.get_table_names():
        return

    # Find the existing CHECK constraint on the type column
    constraints = insp.get_check_constraints('datasources')
    type_constraint = None
    for constraint in constraints:
        if 'type' in str(constraint.get('sqltext', '')):
            type_constraint = constraint.get('name')
            break

    # Build the list of all valid enum values
    # IMPORTANT: Use e.name (uppercase) because SQLAlchemy's non-native Enum stores .name, not .value
    datasource_type_values = [e.name for e in DatasourceType]

    # Check if wordpress_plugin is in the existing constraint
    needs_update = False
    if type_constraint:
        try:
            with connection.begin_nested():
                # Get the current constraint definition
                result = connection.execute(text(f"""
                    SELECT pg_get_constraintdef(oid)
                    FROM pg_constraint
                    WHERE conname = '{type_constraint}' AND conrelid = 'datasources'::regclass
                """))
                current_def = result.scalar()
                # Check if WORDPRESS_PLUGIN is missing (note: uppercase, enum.name not .value)
                if current_def and 'WORDPRESS_PLUGIN' not in current_def:
                    needs_update = True
                    _logger.info(f"[AUTO-MIGRATE] CHECK constraint {type_constraint} missing 'WORDPRESS_PLUGIN'")
        except Exception as e:
            _logger.warning(f"[AUTO-MIGRATE] Could not read constraint definition: {e}")

    if needs_update or not type_constraint:
        # Drop old constraint if it exists
        if type_constraint:
            try:
                with connection.begin_nested():
                    connection.execute(text(f'ALTER TABLE datasources DROP CONSTRAINT IF EXISTS {type_constraint}'))
                    _logger.info(f"[AUTO-MIGRATE] Dropped CHECK constraint {type_constraint}")
            except Exception as e:
                _logger.warning(f"[AUTO-MIGRATE] Could not drop constraint {type_constraint}: {e}")

        # IMPORTANT: Fix datasource types BEFORE adding the constraint.
        # This prevents CHECK constraint violations on deployments with legacy data.
        # Strategy: Update case-mismatched types to uppercase (enum.name), then delete truly invalid.
        # Note: SQLAlchemy's non-native Enum stores the enum .name (UPPERCASE), not .value (lowercase)
        values_list = ', '.join(f"'{v}'" for v in datasource_type_values)
        try:
            with connection.begin_nested():
                # Step 1: Update lowercase type variants to uppercase (case fix)
                # This fixes datasources stored as lowercase (e.g., 'wordpress_plugin' -> 'WORDPRESS_PLUGIN')
                update_result = connection.execute(text(f"""
                    UPDATE datasources
                    SET type = UPPER(type)
                    WHERE LOWER(type) IN ({values_list}) AND type NOT IN ({values_list})
                    RETURNING id, name, type
                """))
                updated_rows = update_result.fetchall()
                if updated_rows:
                    _logger.warning(
                        f"[AUTO-MIGRATE] Fixed {len(updated_rows)} datasources with wrong case: "
                        + ", ".join(f"({row[0]}: {row[1]} = {row[2]} → {row[2].upper()})" for row in updated_rows)
                    )

                # Step 2: Delete any remaining truly invalid datasources (not just case issues)
                delete_result = connection.execute(text(f"""
                    DELETE FROM datasources
                    WHERE type NOT IN ({values_list})
                    RETURNING id, name, type
                """))
                deleted_rows = delete_result.fetchall()
                if deleted_rows:
                    _logger.warning(
                        f"[AUTO-MIGRATE] Deleted {len(deleted_rows)} datasources with invalid types: "
                        + ", ".join(f"({row[0]}: {row[1]} = {row[2]})" for row in deleted_rows)
                    )

                # Step 3: Add the constraint - should succeed now
                connection.execute(text(
                    f'ALTER TABLE datasources ADD CONSTRAINT datasources_type_check CHECK (type IN ({values_list}))'
                ))
                _logger.info(f"[AUTO-MIGRATE] Added CHECK constraint for datasources.type with {len(datasource_type_values)} values")
        except Exception as e:
            _logger.warning(f"[AUTO-MIGRATE] Could not add CHECK constraint: {e}")


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
        from app.services.sync.models import datasource, view, project_settings, table_schema  # noqa

        # Drop stale cache tables whose schema diverged (safe — cache is rebuilt).
        # Runs on SQLite AND Postgres: the sync tables are managed by create_all,
        # not Alembic, so this is the only self-heal path on an existing DB.
        await conn.run_sync(_drop_stale_cache_tables)

        await conn.run_sync(Base.metadata.create_all)

        # Auto-migrate: add any columns defined in models but missing from the DB.
        # create_all only creates NEW tables — it won't ALTER existing ones, so an
        # existing Postgres table never gains a newly-added model column without this.
        await conn.run_sync(_add_missing_columns)

        # Auto-migrate: update CHECK constraints for enum columns to include new values.
        # When new enum values are added to models, existing CHECK constraints need to
        # be updated to allow them. Without this, INSERTs with new enum values fail.
        await conn.run_sync(_update_enum_check_constraints)

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
