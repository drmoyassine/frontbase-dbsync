"""Multi-project startup setup.

`Base.metadata.create_all` creates NEW tables but does NOT add columns to existing
tables. So the multi-project columns on `project` and `tenant_invites` are ensured
here at startup (covers existing dev + prod DBs). New tables (project_members,
project_datasources, project_storage, project_connected_accounts, tenant_addons)
are created automatically by `create_all`.

Also backfills `is_default` on each tenant's existing project (under the prior 1:1
tenant↔project model, the single project becomes the default).
"""

import logging

from sqlalchemy import inspect

logger = logging.getLogger(__name__)


_PROJECT_COLUMNS = [
    ("is_default", "BOOLEAN DEFAULT 0"),
    ("status", "VARCHAR(20) DEFAULT 'active'"),
    ("created_by", "VARCHAR"),
]


def ensure_multiproject_schema(engine) -> None:
    """Add multi-project columns to existing `project` / `tenant_invites` tables."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    statements: list[str] = []

    if "project" in tables:
        cols = {c["name"] for c in inspector.get_columns("project")}
        for name, ddl in _PROJECT_COLUMNS:
            if name not in cols:
                statements.append(f"ALTER TABLE project ADD COLUMN {name} {ddl}")

    if "tenant_invites" in tables:
        cols = {c["name"] for c in inspector.get_columns("tenant_invites")}
        if "project_ids" not in cols:
            statements.append("ALTER TABLE tenant_invites ADD COLUMN project_ids TEXT")

    if not statements:
        return
    with engine.connect() as conn:
        for sql in statements:
            conn.exec_driver_sql(sql)
        conn.commit()
    logger.info("[multi-project] applied %d schema statement(s)", len(statements))


def backfill_default_projects(db) -> None:
    """Flag each tenant's earliest project as default if none is flagged yet.

    Idempotent. Under the prior 1:1 model every tenant had one project; mark it
    `is_default` so the active-project fallback + community-engine constraint work.
    """
    from app.models.models import Project, Tenant

    fixed = 0
    for t in db.query(Tenant).all():
        has_default = (
            db.query(Project)
            .filter(Project.tenant_id == t.id, Project.is_default == True)  # noqa: E712
            .first()
        )
        if has_default:
            continue
        first = (
            db.query(Project)
            .filter(Project.tenant_id == t.id)
            .order_by(Project.created_at)
            .first()
        )
        if first:
            first.is_default = True  # type: ignore[assignment]
            fixed += 1
    if fixed:
        db.commit()
        logger.info("[multi-project] flagged %d default project(s)", fixed)


def get_default_project_id(db, tenant_id: str):
    """Return the tenant's default project id (or None)."""
    from app.models.models import Project
    p = (
        db.query(Project)
        .filter(Project.tenant_id == tenant_id, Project.is_default == True)  # noqa: E712
        .first()
    )
    return str(p.id) if p else None


def assert_community_engine_in_default_project(db, tenant_id: str, project_id, is_shared: bool) -> None:
    """A shared/community engine may only live in the tenant's DEFAULT project.

    Non-default projects must use the tenant's own (or managed) engines.
    Raises HTTPException 403 if a shared engine is bound to a non-default project.
    """
    from fastapi import HTTPException
    if not is_shared or not tenant_id:
        return
    default_id = get_default_project_id(db, tenant_id)
    if default_id and project_id and str(project_id) != default_id:
        raise HTTPException(
            status_code=403,
            detail="Community/shared engines can only be used in the default project.",
        )


def assert_resource_same_project(resource_project_id, engine_project_id, label: str) -> None:
    """A project-exclusive resource (state-db/cache/queue/datasource) may only bind an
    engine in the SAME project. Raises HTTPException 403 on a cross-project bind."""
    from fastapi import HTTPException
    if (
        resource_project_id is not None
        and engine_project_id is not None
        and str(resource_project_id) != str(engine_project_id)
    ):
        raise HTTPException(
            status_code=403,
            detail=f"{label} belongs to a different project and cannot be bound here.",
        )
