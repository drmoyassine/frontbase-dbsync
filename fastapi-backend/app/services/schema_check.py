"""Startup schema verification — fail loudly on ORM/DB column drift.

Catches the "model declares a column the live DB doesn't have" class of bug (e.g. an
ORM column added without a matching alembic migration), which otherwise only surfaces as
runtime `column ... does not exist` errors on every query that touches the table.

Runs after create_all + the startup self-heal, over the main app metadata. If any ORM
column is missing from an existing table, it logs CRITICAL and **raises to halt startup**
(failing fast beats serving 500s). Set ``FB_ALLOW_SCHEMA_DRIFT=1`` to downgrade to a loud
warning and continue (emergency bypass only).
"""

import logging
import os

from sqlalchemy import inspect

from ..database.config import Base

logger = logging.getLogger(__name__)

# Tables managed by the db-sync service, which has its OWN schema lifecycle (init_db /
# its own migrations), separate from the main app's alembic chain. Excluded from this
# check to avoid false positives on sync-managed drift (e.g. table_schema_cache columns).
# If a sync table is added, add its name here.
SYNC_MANAGED_TABLES: set[str] = {
    "sync_configs", "field_mappings", "sync_jobs", "conflicts",
    "datasource_views", "table_schema_cache", "datasources", "project_settings",
}


def verify_schema(engine) -> None:
    """Raise RuntimeError if any ORM-declared column is missing from its DB table.

    Only main-app tables are checked (sync-service tables manage their own schema).
    """
    inspector = inspect(engine)
    db_tables = set(inspector.get_table_names())

    missing: list[str] = []
    for table_name, table in Base.metadata.tables.items():
        if table_name in SYNC_MANAGED_TABLES:
            continue
        if table_name not in db_tables:
            # create_all should have created it; an absent table is a different problem.
            continue
        db_cols = {c["name"] for c in inspector.get_columns(table_name)}
        for col in table.columns:
            if col.name not in db_cols:
                missing.append(f"{table_name}.{col.name}")

    if not missing:
        return

    msg = (
        "SCHEMA DRIFT: ORM expects column(s) missing from the database — "
        + ", ".join(missing)
        + ". Run `alembic upgrade head` (or add the column(s)) before serving. "
        "Set FB_ALLOW_SCHEMA_DRIFT=1 to bypass and continue (affected queries will 500)."
    )
    if os.getenv("FB_ALLOW_SCHEMA_DRIFT") == "1":
        logger.critical("[schema] %s (FB_ALLOW_SCHEMA_DRIFT set — continuing anyway)", msg)
        return
    logger.critical("[schema] %s", msg)
    raise RuntimeError(msg)
