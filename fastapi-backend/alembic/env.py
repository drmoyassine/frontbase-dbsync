from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlalchemy import text

from alembic import context
import os
import sys

# Add the parent directory to the path so we can import the app
sys.path.append(os.getcwd())

# Import the base and models
from app.database.config import Base, SYNC_DATABASE_URL
# Import models to ensure they are registered with Base
from app.models import models

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# Overwrite the sqlalchemy.url in the config with the one from the app
config.set_main_option("sqlalchemy.url", SYNC_DATABASE_URL)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True, # Enable batch mode for SQLite
    )

    with context.begin_transaction():
        context.run_migrations()


def _ensure_wide_version_column(connection) -> None:
    """Ensure alembic_version.version_num is wide enough on PostgreSQL.

    Alembic's default version table is VARCHAR(32). Several revision IDs in this
    project exceed 32 chars (e.g. 0029_core_zone_and_credential_metadata). Postgres
    ENFORCES the length, so `alembic upgrade head` aborts there with
    StringDataRightTruncation and the Cloud schema gets stuck behind — while
    self-host SQLite ignores VARCHAR length and applies everything cleanly.

    Pre-creating (fresh DB) / widening (stuck DB) the column to VARCHAR(255) lets
    migrations record their revision IDs. No-op on SQLite.
    """
    if connection.dialect.name != "postgresql":
        return
    with connection.begin():
        # Pre-create wide so Alembic won't create it as VARCHAR(32) on a fresh DB.
        connection.execute(text(
            "CREATE TABLE IF NOT EXISTS alembic_version ("
            "version_num VARCHAR(255) NOT NULL, "
            "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
        ))
        # Widen if a previous run already created the narrow VARCHAR(32) version.
        connection.execute(text(
            "ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(255)"
        ))


def _install_idempotent_ddl() -> None:
    """Make create_table / add_column / create_index tolerate pre-existing objects.

    The Docker entrypoint runs ``Base.metadata.create_all()`` BEFORE
    ``alembic upgrade`` (see docker_entrypoint.sh). create_all() builds the FULL
    current schema — every current table with its full current column set — but it
    does NOT add columns to tables that already existed. So on a legacy DB stuck
    below head, ``alembic upgrade`` still has real work to do (the ALTERs on old
    tables), yet its create_table/add_column calls for objects create_all already
    built blow up with "table/column already exists" and trap the container in a
    crash loop (e.g. the 0024 edge_gpu_models and 0050 ip_address_anonymized
    failures on legacy cloud deploys).

    Most migrations guard themselves inline (get_table_names / if_not_exists /
    get_columns), but not all historically did. Rather than depend on every author
    remembering the guard, we encode the create_all-before-alembic contract in ONE
    place: skip a DDL op when its target object is already present, otherwise run
    it unchanged. Genuinely-missing ALTERs (the whole point of upgrading a stuck
    DB) still apply normally.

    We patch ``alembic.ddl.impl.DefaultImpl`` rather than ``Operations`` because it
    is the single seam BOTH regular ops (op.create_table via toimpl) and batch ops
    (op.batch_alter_table -> batch flush) funnel through — the Operations layer
    misses ``batch_op.add_column`` entirely. Patching the impl also preserves the
    Table object ``op.create_table`` returns to migrations (toimpl returns it
    independently of the impl call), so create_table()+bulk_insert() chains keep
    working. Skips are no-ops when there is no live connection (offline/--sql mode).
    """
    from sqlalchemy import inspect as sa_inspect
    from alembic.ddl.impl import DefaultImpl

    if getattr(DefaultImpl, "_frontbase_idempotent_ddl", False):
        return  # guard against double-patching within one process

    _orig_create_table = DefaultImpl.create_table
    _orig_add_column = DefaultImpl.add_column
    _orig_create_index = DefaultImpl.create_index

    def _inspector(self):
        conn = getattr(self, "connection", None)
        if conn is None:
            return None  # offline / --sql mode: nothing to reflect against
        try:
            return sa_inspect(conn)
        except Exception:
            return None

    def create_table(self, table, **kw):
        insp = _inspector(self)
        if insp is not None:
            try:
                if table.name in insp.get_table_names(schema=table.schema):
                    return None
            except Exception:
                pass
        return _orig_create_table(self, table, **kw)

    def add_column(self, table_name, column, *, schema=None, **kw):
        insp = _inspector(self)
        if insp is not None:
            try:
                existing = [c["name"] for c in insp.get_columns(table_name, schema=schema)]
                if column.name in existing:
                    return None
            except Exception:
                pass
        return _orig_add_column(self, table_name, column, schema=schema, **kw)

    def create_index(self, index, **kw):
        insp = _inspector(self)
        if insp is not None:
            try:
                table = getattr(index, "table", None)
                tbl_name = table.name if table is not None else None
                tbl_schema = table.schema if table is not None else None
                if tbl_name is not None:
                    existing = [i["name"] for i in insp.get_indexes(tbl_name, schema=tbl_schema)]
                    if index.name in existing:
                        return None
            except Exception:
                pass
        return _orig_create_index(self, index, **kw)

    DefaultImpl.create_table = create_table
    DefaultImpl.add_column = add_column
    DefaultImpl.create_index = create_index
    DefaultImpl._frontbase_idempotent_ddl = True


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Encode the create_all-before-alembic contract: DDL ops skip objects that
    # bootstrap create_all() already built, so legacy DBs stuck below head can
    # still apply their pending ALTERs instead of crash-looping on "already exists".
    _install_idempotent_ddl()

    # Use the synchronous driver for Alembic (FastAPI app uses sync driver but logic might differ)
    # Our DATABASE_URL in config.py handles this logic (it's sqlite:///./unified.db usually)

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Must run BEFORE context.run_migrations() so the version table can hold
        # over-long revision IDs on Postgres (see helper docstring).
        _ensure_wide_version_column(connection)

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True # Enable batch mode for SQLite
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
