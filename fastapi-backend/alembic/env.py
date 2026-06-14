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


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
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
