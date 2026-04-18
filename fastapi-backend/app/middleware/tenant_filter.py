"""
Tenant-aware query helpers.

Provides scoped query builders that auto-filter by tenant context
in cloud mode.  In self-host mode (ctx=None) the queries return
all rows, preserving existing behaviour.

Usage::

    from app.middleware.tenant_filter import scoped_pages_query, scoped_project_query, _scoped_provider_query
    
    # ...
    pages = scoped_pages_query(db, ctx).all()
"""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

from sqlalchemy.orm import Session, Query

from app.models.page import Page
from app.models.auth import Project
from app.models.edge import EdgeProviderAccount

if TYPE_CHECKING:
    from app.middleware.tenant_context import TenantContext


def scoped_pages_query(
    db: Session,
    ctx: "Optional[TenantContext]",
    *,
    include_deleted: bool = False,
) -> "Query[Page]":
    """Return a Page query scoped to the tenant's project(s).

    - ``ctx is None``      → unfiltered (self-host)
    - ``ctx.is_master``    → unfiltered (platform admin)
    - otherwise            → filtered by project_id ∈ tenant's projects
    """
    q: Query[Page] = db.query(Page)
    if not include_deleted:
        q = q.filter(Page.deleted_at == None)  # noqa: E711

    if ctx and ctx.tenant_id and not ctx.is_master:
        project_ids = (
            db.query(Project.id)
            .filter(Project.tenant_id == ctx.tenant_id)
            .scalar_subquery()
        )
        q = q.filter(Page.project_id.in_(project_ids))

    return q


def scoped_project_query(
    db: Session, ctx: "Optional[TenantContext]"
) -> "Query[Project]":
    """Return a Project query scoped to the tenant.

    - ``ctx is None``      → unfiltered (self-host)
    - ``ctx.is_master``    → unfiltered (platform admin)
    - otherwise            → filtered by tenant_id
    """
    q: Query[Project] = db.query(Project)

    if ctx and ctx.tenant_id and not ctx.is_master:
        q = q.filter(Project.tenant_id == ctx.tenant_id)

    return q


def _scoped_provider_query(
    db: Session, ctx: "Optional[TenantContext]"
) -> "Query[EdgeProviderAccount]":
    """Return an EdgeProviderAccount query scoped to the tenant.

    - ``ctx is None``      → unfiltered (self-host)
    - ``ctx.is_master``    → unfiltered (platform admin)
    - otherwise            → filtered by project_id ∈ tenant's projects
    """
    q: Query[EdgeProviderAccount] = db.query(EdgeProviderAccount)

    if ctx and ctx.tenant_id and not ctx.is_master:
        project_ids = (
            db.query(Project.id)
            .filter(Project.tenant_id == ctx.tenant_id)
            .scalar_subquery()
        )
        q = q.filter(EdgeProviderAccount.project_id.in_(project_ids))

    return q
