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
from typing import Optional

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

    # is_managed flag on edge resources (managed-tier, Frontbase-provisioned)
    for tname in ("edge_engines", "edge_databases", "edge_caches", "edge_queues"):
        if tname in tables:
            cols = {c["name"] for c in inspector.get_columns(tname)}
            if "is_managed" not in cols:
                statements.append(f"ALTER TABLE {tname} ADD COLUMN is_managed BOOLEAN DEFAULT 0")

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


def backfill_project_members(db) -> None:
    """Grant each non-owner/non-admin member access to all their tenant's projects.

    Under the prior single-project model every member could see the one project.
    Multi-project gates non-admins by ``project_members`` rows, so seed those rows
    for existing members to preserve their access. Owners/admins are implicit and
    need no rows. Idempotent: skips members who already have any project access.
    """
    import uuid
    from datetime import datetime, timezone
    from app.models.models import Project, TenantMember, ProjectMember

    now = datetime.now(timezone.utc).isoformat()
    added = 0
    members = db.query(TenantMember).filter(~TenantMember.role.in_(["owner", "admin"])).all()
    for m in members:
        # Skip if the member already has any project access rows.
        existing = (
            db.query(ProjectMember)
            .filter(ProjectMember.tenant_id == m.tenant_id, ProjectMember.user_id == m.user_id)
            .count()
        )
        if existing:
            continue
        projects = db.query(Project).filter(Project.tenant_id == m.tenant_id).all()
        for p in projects:
            db.add(ProjectMember(
                id=str(uuid.uuid4()),
                tenant_id=str(m.tenant_id),
                project_id=str(p.id),
                user_id=str(m.user_id),
                role=str(m.role) if m.role in ("admin", "editor", "viewer") else "viewer",
                created_at=now,
            ))
            added += 1
    if added:
        db.commit()
        logger.info("[multi-project] seeded %d project-member access row(s)", added)


def get_default_project_id(db, tenant_id: str):
    """Return the tenant's default project id (or None)."""
    from app.models.models import Project
    p = (
        db.query(Project)
        .filter(Project.tenant_id == tenant_id, Project.is_default == True)  # noqa: E712
        .first()
    )
    return str(p.id) if p else None


def require_project_writable(db, ctx) -> None:
    """403 if the caller's active project is locked (read-only after a downgrade).

    A locked project allows reads/serving but blocks creates/updates/publishes until
    the tenant upgrades and ``reconcile_projects_cap`` re-activates it.
    """
    from fastapi import HTTPException
    from app.models.models import Project
    if not ctx or not getattr(ctx, "tenant_id", None) or not getattr(ctx, "active_project_id", None):
        return
    p = (
        db.query(Project)
        .filter(Project.id == ctx.active_project_id, Project.tenant_id == ctx.tenant_id)
        .first()
    )
    if p is not None and str(p.status) == "locked":
        raise HTTPException(
            status_code=403,
            detail="This project is locked (read-only). Upgrade your plan to re-activate it.",
        )


# ---------------------------------------------------------------------------
# Per-project roles (owner/admin account = full; members = project_members role)
# ---------------------------------------------------------------------------

_ROLE_RANK = {"viewer": 1, "editor": 2, "admin": 3}


def effective_project_role(db, ctx) -> Optional[str]:
    """The user's role for the active project: 'admin' for owner/admin accounts, their
    project_members role for members, or None if they have no access."""
    if not ctx or not getattr(ctx, "tenant_id", None):
        return None
    if getattr(ctx, "role", None) in ("owner", "admin", "master"):
        return "admin"
    from app.models.models import ProjectMember
    pid = getattr(ctx, "active_project_id", None)
    if not pid:
        return None
    row = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.tenant_id == ctx.tenant_id,
            ProjectMember.project_id == pid,
            ProjectMember.user_id == ctx.user_id,
        )
        .first()
    )
    return str(row.role) if row is not None else None


def require_project_role(db, ctx, min_role: str) -> None:
    """403 if the user's effective project role is below ``min_role`` (viewer < editor < admin).

    Owner/admin accounts pass as 'admin'. Used to enforce editor+ for writes (viewers are
    read-only). No-op for self-host / master (no project membership model there).
    """
    from fastapi import HTTPException
    if ctx is None or getattr(ctx, "is_master", False) or not getattr(ctx, "tenant_id", None):
        return  # self-host / master: no per-project membership to enforce
    eff = effective_project_role(db, ctx)
    if eff is None:
        raise HTTPException(status_code=403, detail="You do not have access to this project.")
    if _ROLE_RANK.get(eff, 0) < _ROLE_RANK.get(min_role, 0):
        raise HTTPException(
            status_code=403,
            detail=f"This action requires the {min_role} role in this project.",
        )


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


def assert_engine_resources_same_project(
    db, engine_project_id, edge_db_id, edge_cache_id, edge_queue_id
) -> None:
    """Assert each bound backing resource (state-db/cache/queue) belongs to the same
    project as the engine being created/updated. No-op for unbound or tenant-level
    (project_id None) resources (legacy/back-compat)."""
    from app.models.models import EdgeDatabase, EdgeCache, EdgeQueue
    checks = (
        (EdgeDatabase, edge_db_id, "State database"),
        (EdgeCache, edge_cache_id, "Cache"),
        (EdgeQueue, edge_queue_id, "Queue"),
    )
    for Model, rid, label in checks:
        if not rid:
            continue
        res = db.query(Model).filter(Model.id == rid).first()
        if res is not None:
            assert_resource_same_project(getattr(res, "project_id", None), engine_project_id, label)
