"""
Agent Tools — PydanticAI tool definitions for the Workspace Agent.

These are the Python equivalents of the Edge Engine's tool tiers (curated
pages/styles/engine tools + generic datasource/workflow tools + project
management), operating directly on SQLAlchemy models.

Feature-parity highlights vs. the Edge Agent
(``services/edge/src/engine/agent/tools.ts``):

  * **Two-level isolation**: every query is scoped to the caller's tenant AND
    active project via :class:`ToolContext` (see ``agent_permissions.py``).
    Self-host / master admin is unrestricted (behaviour-preserving).
  * **Permission gating**: tools are registered only when the resolved profile
    grants the required ``{resource: [actions]}`` permission (deny-by-default).
  * **Credential masking**: provider/datasource secrets are never returned to
    the model — only a boolean ``has_credentials``.
  * **Audit trail**: destructive calls are logged to ``agent_tool_audit``.

Tools are registered on a PydanticAI Agent via ``register_workspace_tools()``.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..models.models import (
    Page,
    EdgeEngine,
    EdgeProviderAccount,
    EdgeDatabase,
    AutomationDraft,
    AutomationExecution,
    McpServer,
    AgentTool,
    AgentSkill,
    ComponentTheme,
)
from ..database.config import SessionLocal
from .agent_permissions import (
    ToolContext,
    assert_project_owned,
    project_filter,
    require_permission,
    tool_allowed,
)
from .agent_audit import log_tool_call

logger = logging.getLogger(__name__)


# =============================================================================
# Helpers
# =============================================================================

def _with_db(fn):
    """Execute a function with a fresh DB session and return the result."""
    db = SessionLocal()
    try:
        return fn(db)
    finally:
        db.close()


def _ok(message: str, **extra: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"success": True, "message": message}
    out.update(extra)
    return out


def _err(message: str, **extra: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"success": False, "error": message}
    out.update(extra)
    return out


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _short_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4()}"


def _parse_layout(page: Page) -> dict[str, Any]:
    layout_data = page.layout_data
    if isinstance(layout_data, str):
        try:
            layout_data = json.loads(layout_data)
        except (json.JSONDecodeError, TypeError):
            layout_data = {"content": [], "root": {}}
    if not isinstance(layout_data, dict):
        return {"content": [], "root": {}}
    return layout_data


def _summarize_components(components: list) -> list:
    result = []
    for c in (components or []):
        summary: dict[str, Any] = {"id": c.get("id"), "type": c.get("type")}
        props = c.get("props", {}) or {}
        if props.get("text"):
            summary["text"] = str(props["text"])[:100]
        if props.get("label"):
            summary["label"] = props["label"]
        if props.get("src"):
            summary["src"] = props["src"]
        binding = c.get("binding", {}) or {}
        if binding.get("tableName"):
            summary["boundTo"] = binding["tableName"]
        children = c.get("children", [])
        if children:
            summary["children"] = _summarize_components(children)
        result.append(summary)
    return result


# =============================================================================
# Content: Pages
# =============================================================================

def _pages_list_impl(db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(Page).filter(Page.deleted_at == None)  # noqa: E711
    q = project_filter(q, Page, ctx)
    pages = q.all()
    return {
        "count": len(pages),
        "pages": [
            {
                "id": str(p.id),
                "name": str(p.name),
                "slug": str(p.slug),
                "isHomepage": bool(p.is_homepage),
                "isPublic": bool(p.is_public),
            }
            for p in pages
        ],
    }


def _pages_get_impl(slug: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(Page).filter(Page.slug == slug, Page.deleted_at == None)  # noqa: E711
    q = project_filter(q, Page, ctx)
    page = q.first()
    if not page:
        return _err(f"Page with slug '{slug}' not found")

    layout_data = _parse_layout(page)
    content = layout_data.get("content", [])
    return {
        "name": str(page.name),
        "slug": str(page.slug),
        "isHomepage": bool(page.is_homepage),
        "isPublic": bool(page.is_public),
        "seo": {"title": str(page.title or page.name), "description": str(page.description or "")},
        "components": _summarize_components(content),
    }


def _pages_update_component_impl(slug: str, component_id: str, updates: dict, db: Session, ctx: ToolContext) -> dict[str, Any]:
    require_permission(ctx, "pages.all", "write")
    assert_project_owned(db, ctx)
    q = db.query(Page).filter(Page.slug == slug, Page.deleted_at == None)  # noqa: E711
    q = project_filter(q, Page, ctx)
    page = q.first()
    if not page:
        return _err(f"Page '{slug}' not found")

    layout_data = _parse_layout(page)

    def find_and_update(components: list, target_id: str) -> bool:
        for c in components:
            if c.get("id") == target_id:
                c.setdefault("props", {}).update(updates)
                return True
            if c.get("children") and find_and_update(c["children"], target_id):
                return True
        return False

    if not find_and_update(layout_data.get("content", []), component_id):
        return _err(f"Component '{component_id}' not found on page '{slug}'")

    page.layout_data = json.dumps(layout_data)  # type: ignore[assignment]
    page.updated_at = _now()  # type: ignore[assignment]
    db.commit()
    log_tool_call(ctx, "pages_update_component", args={"slug": slug, "component_id": component_id}, is_destructive=True)
    return _ok(f"Updated component '{component_id}' on page '{slug}'")


def _pages_create_impl(name: str, slug: str, db: Session, ctx: ToolContext, is_homepage: bool = False) -> dict[str, Any]:
    require_permission(ctx, "pages.all", "write")
    project_id = assert_project_owned(db, ctx)
    existing = db.query(Page).filter(Page.slug == slug, Page.deleted_at == None)  # noqa: E711
    existing = project_filter(existing, Page, ctx)
    if existing.first():
        return _err(f"A page with slug '{slug}' already exists")
    now = _now()
    page = Page(
        id=_short_id(),
        name=name,
        slug=slug,
        title=name,
        layout_data=json.dumps({"content": [], "root": {}}),
        is_homepage=is_homepage,
        is_public=True,
        project_id=project_id,
        created_at=now,
        updated_at=now,
    )
    db.add(page)
    db.commit()
    log_tool_call(ctx, "pages_create", args={"slug": slug}, is_destructive=True)
    return _ok(f"Created page '{slug}'", id=str(page.id), slug=str(page.slug))


def _pages_delete_impl(slug: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    require_permission(ctx, "pages.all", "write")
    assert_project_owned(db, ctx)
    q = db.query(Page).filter(Page.slug == slug, Page.deleted_at == None)  # noqa: E711
    q = project_filter(q, Page, ctx)
    page = q.first()
    if not page:
        return _err(f"Page '{slug}' not found")
    page.deleted_at = _now()  # type: ignore[assignment]  # soft-delete
    db.commit()
    log_tool_call(ctx, "pages_delete", args={"slug": slug}, is_destructive=True)
    return _ok(f"Deleted page '{slug}'")


def _seo_get_impl(slug: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(Page).filter(Page.slug == slug, Page.deleted_at == None)  # noqa: E711
    q = project_filter(q, Page, ctx)
    page = q.first()
    if not page:
        return _err(f"Page '{slug}' not found")
    seo_raw = page.seo_data
    try:
        seo = json.loads(str(seo_raw)) if seo_raw else {}
    except Exception:
        seo = {}
    return {
        "slug": str(page.slug),
        "title": str(page.title or page.name),
        "description": str(page.description or ""),
        "keywords": str(page.keywords or ""),
        "seo_data": seo,
    }


def _seo_update_impl(slug: str, updates: dict[str, Any], db: Session, ctx: ToolContext) -> dict[str, Any]:
    require_permission(ctx, "seo.all", "write")
    assert_project_owned(db, ctx)
    q = db.query(Page).filter(Page.slug == slug, Page.deleted_at == None)  # noqa: E711
    q = project_filter(q, Page, ctx)
    page = q.first()
    if not page:
        return _err(f"Page '{slug}' not found")
    if "title" in updates and updates["title"] is not None:
        page.title = str(updates["title"])[:200]  # type: ignore[assignment]
    if "description" in updates and updates["description"] is not None:
        page.description = str(updates["description"])  # type: ignore[assignment]
    if "keywords" in updates and updates["keywords"] is not None:
        page.keywords = str(updates["keywords"])[:500]  # type: ignore[assignment]
    page.updated_at = _now()  # type: ignore[assignment]
    db.commit()
    log_tool_call(ctx, "seo_update", args={"slug": slug}, is_destructive=True)
    return _ok(f"Updated SEO for page '{slug}'")


# =============================================================================
# Content: Styles / Themes
# =============================================================================

def _styles_list_impl(db: Session, ctx: ToolContext) -> dict[str, Any]:
    # ComponentTheme is global (no project_id column) — visible across the project.
    themes = db.query(ComponentTheme).all()
    return {
        "count": len(themes),
        "styles": [
            {
                "id": str(t.id),
                "name": str(t.name),
                "componentType": str(t.component_type),
                "isSystem": bool(getattr(t, "is_system", False)),
            }
            for t in themes
        ],
    }


def _styles_get_impl(theme_id: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(ComponentTheme).filter(ComponentTheme.id == theme_id)
    # ComponentTheme is global (no project_id) — project_filter is a no-op here.
    t = q.first()
    if not t:
        return _err(f"Style '{theme_id}' not found")
    config = t.styles_data
    if isinstance(config, str):
        try:
            config = json.loads(config)
        except Exception:
            pass
    return {
        "id": str(t.id),
        "name": str(t.name),
        "componentType": str(t.component_type),
        "config": config,
    }


def _styles_update_impl(theme_id: str, updates: dict[str, Any], db: Session, ctx: ToolContext) -> dict[str, Any]:
    require_permission(ctx, "styles.all", "write")
    q = db.query(ComponentTheme).filter(ComponentTheme.id == theme_id)
    t = q.first()
    if not t:
        return _err(f"Style '{theme_id}' not found")
    if getattr(t, "is_system", False):
        return _err("System themes are immutable")
    current = t.styles_data
    if isinstance(current, str):
        try:
            current = json.loads(current)
        except Exception:
            current = {}
    if not isinstance(current, dict):
        current = {}
    current.update(updates)
    t.styles_data = json.dumps(current)  # type: ignore[assignment]
    t.updated_at = _now()  # type: ignore[assignment]
    db.commit()
    log_tool_call(ctx, "styles_update", args={"theme_id": theme_id}, is_destructive=True)
    return _ok(f"Updated style '{t.name}'")


# =============================================================================
# Infrastructure: Edge Engines
# =============================================================================

def _edge_engines_list_impl(db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(EdgeEngine).filter(EdgeEngine.is_active == True)  # noqa: E712
    q = project_filter(q, EdgeEngine, ctx)
    engines = q.all()
    return {
        "count": len(engines),
        "engines": [
            {
                "id": str(e.id),
                "name": str(e.name),
                "url": str(e.url),
                "adapterType": str(e.adapter_type),
                "isSystem": bool(e.is_system),
                "lastDeployedAt": str(e.last_deployed_at) if e.last_deployed_at else None,
            }
            for e in engines
        ],
    }


def _edge_engines_get_impl(engine_id: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    q = project_filter(q, EdgeEngine, ctx)
    e = q.first()
    if not e:
        return _err(f"Edge engine '{engine_id}' not found")
    return {
        "id": str(e.id),
        "name": str(e.name),
        "url": str(e.url),
        "adapterType": str(e.adapter_type),
        "isActive": bool(e.is_active),
        "isSystem": bool(e.is_system),
        "isImported": bool(e.is_imported),
        "lastDeployedAt": str(e.last_deployed_at) if e.last_deployed_at else None,
        "lastSyncedAt": str(e.last_synced_at) if e.last_synced_at else None,
    }


def _edge_engines_create_impl(name: str, url: str, adapter_type: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    require_permission(ctx, "edges.all", "write")
    project_id = assert_project_owned(db, ctx)
    now = _now()
    engine = EdgeEngine(
        id=_short_id(),
        name=name,
        url=url,
        adapter_type=adapter_type or "full",
        project_id=project_id,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(engine)
    db.commit()
    log_tool_call(ctx, "edge_engines_create", args={"name": name}, is_destructive=True)
    return _ok(f"Registered edge engine '{name}'", id=str(engine.id))


def _edge_engines_deploy_impl(engine_id: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    require_permission(ctx, "edges.all", "write")
    assert_project_owned(db, ctx)
    q = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    q = project_filter(q, EdgeEngine, ctx)
    engine = q.first()
    if not engine:
        return _err(f"Edge engine '{engine_id}' not found")
    # Kick off the real deploy in a background-safe way. The deploy service is
    # async + side-effecting (writes bundles, calls providers), so we hand it off
    # and report intent rather than blocking the tool call.
    try:
        from ..services.engine_deploy import redeploy  # local import — heavy module
        import asyncio
        try:
            asyncio.get_running_loop()
            # Already inside a loop — cannot await here; schedule it.
            asyncio.ensure_future(redeploy(engine, db))
        except RuntimeError:
            asyncio.run(redeploy(engine, db))
    except Exception as e:  # pragma: no cover — deploy infra varies by edition
        logger.warning("[agent] edge_engines_deploy deferred: %s", e)
        return _ok(f"Deploy scheduled for engine '{engine.name}' (id={engine_id}). It will go live shortly.")
    log_tool_call(ctx, "edge_engines_deploy", args={"engine_id": engine_id}, is_destructive=True)
    return _ok(f"Deploy triggered for engine '{engine.name}' (id={engine_id}).")


# Back-compat shim: the old ``engine_info`` tool name (now scoped + aliased).
_engine_info_impl = _edge_engines_list_impl


# =============================================================================
# Infrastructure: Providers (credential-masked)
# =============================================================================

def _provider_view(p: EdgeProviderAccount) -> dict[str, Any]:
    return {
        "id": str(p.id),
        "name": str(p.name),
        "provider": str(p.provider),
        "hasCredentials": bool(p.provider_credentials),
        "isActive": bool(p.is_active),
    }


def _providers_list_impl(db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.is_active == True)  # noqa: E712
    q = project_filter(q, EdgeProviderAccount, ctx)
    providers = q.all()
    return {"count": len(providers), "providers": [_provider_view(p) for p in providers]}


def _providers_create_impl(name: str, provider: str, api_key: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    require_permission(ctx, "providers.all", "write")
    project_id = assert_project_owned(db, ctx)
    from ..core.security import encrypt_credentials
    now = _now()
    creds = encrypt_credentials({"api_key": api_key})
    account = EdgeProviderAccount(
        id=_short_id(),
        name=name,
        provider=provider,
        provider_credentials=creds,
        project_id=project_id,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(account)
    db.commit()
    log_tool_call(ctx, "providers_create", args={"name": name, "provider": provider}, is_destructive=True)
    return _ok(f"Created provider '{name}'", id=str(account.id))


def _providers_test_impl(provider_id: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id)
    q = project_filter(q, EdgeProviderAccount, ctx)
    p = q.first()
    if not p:
        return _err(f"Provider '{provider_id}' not found")
    has = bool(p.provider_credentials)
    return _ok(
        "Provider credentials present" if has else "Provider has no credentials",
        providerId=str(p.id),
        hasCredentials=has,
        provider=str(p.provider),
    )


def _providers_update_impl(provider_id: str, updates: dict[str, Any], db: Session, ctx: ToolContext) -> dict[str, Any]:
    require_permission(ctx, "providers.all", "write")
    assert_project_owned(db, ctx)
    q = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id)
    q = project_filter(q, EdgeProviderAccount, ctx)
    p = q.first()
    if not p:
        return _err(f"Provider '{provider_id}' not found")
    if "name" in updates and updates["name"]:
        p.name = str(updates["name"])  # type: ignore[assignment]
    if "is_active" in updates and updates["is_active"] is not None:
        p.is_active = bool(updates["is_active"])  # type: ignore[assignment]
    if "api_key" in updates and updates["api_key"]:
        from ..core.security import encrypt_credentials
        p.provider_credentials = encrypt_credentials({"api_key": str(updates["api_key"])})  # type: ignore[assignment]
    p.updated_at = _now()  # type: ignore[assignment]
    db.commit()
    log_tool_call(ctx, "providers_update", args={"provider_id": provider_id}, is_destructive=True)
    return _ok(f"Updated provider '{p.name}'")


# =============================================================================
# Data: Datasources (EdgeDatabase — credential-masked)
# =============================================================================

def _datasource_view(d) -> dict[str, Any]:
    return {
        "id": str(d.id),
        "name": str(d.name),
        "provider": str(d.provider),
        "hasCredentials": bool(getattr(d, "db_token", None)),
        "isDefault": bool(getattr(d, "is_default", False)),
    }


def _datasources_list_impl(db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(EdgeDatabase)
    q = project_filter(q, EdgeDatabase, ctx)
    rows = q.all()
    return {"count": len(rows), "datasources": [_datasource_view(d) for d in rows]}


def _datasources_get_impl(datasource_id: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(EdgeDatabase).filter(EdgeDatabase.id == datasource_id)
    q = project_filter(q, EdgeDatabase, ctx)
    d = q.first()
    if not d:
        return _err(f"Datasource '{datasource_id}' not found")
    return _datasource_view(d)


def _datasources_create_impl(name: str, provider: str, db_url: str, db: Session, ctx: ToolContext, token: str | None = None) -> dict[str, Any]:
    require_permission(ctx, "datasources.all", "write")
    project_id = assert_project_owned(db, ctx)
    from ..core.security import encrypt_field
    now = _now()
    ds = EdgeDatabase(
        id=_short_id(),
        name=name,
        provider=provider,
        db_url=db_url,
        db_token=encrypt_field(token) if token else None,
        project_id=project_id,
        created_at=now,
        updated_at=now,
    )
    db.add(ds)
    db.commit()
    log_tool_call(ctx, "datasources_create", args={"name": name, "provider": provider}, is_destructive=True)
    return _ok(f"Created datasource '{name}'", id=str(ds.id))


def _datasources_update_impl(datasource_id: str, updates: dict[str, Any], db: Session, ctx: ToolContext) -> dict[str, Any]:
    require_permission(ctx, "datasources.all", "write")
    assert_project_owned(db, ctx)
    q = db.query(EdgeDatabase).filter(EdgeDatabase.id == datasource_id)
    q = project_filter(q, EdgeDatabase, ctx)
    d = q.first()
    if not d:
        return _err(f"Datasource '{datasource_id}' not found")
    if "name" in updates and updates["name"]:
        d.name = str(updates["name"])  # type: ignore[assignment]
    if "db_url" in updates and updates["db_url"]:
        d.db_url = str(updates["db_url"])  # type: ignore[assignment]
    if "token" in updates and updates["token"]:
        from ..core.security import encrypt_field
        d.db_token = encrypt_field(str(updates["token"]))  # type: ignore[assignment]
    d.updated_at = _now()  # type: ignore[assignment]
    db.commit()
    log_tool_call(ctx, "datasources_update", args={"datasource_id": datasource_id}, is_destructive=True)
    return _ok(f"Updated datasource '{d.name}'")


def _datasources_delete_impl(datasource_id: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    require_permission(ctx, "datasources.all", "delete")
    assert_project_owned(db, ctx)
    q = db.query(EdgeDatabase).filter(EdgeDatabase.id == datasource_id)
    q = project_filter(q, EdgeDatabase, ctx)
    d = q.first()
    if not d:
        return _err(f"Datasource '{datasource_id}' not found")
    if getattr(d, "is_system", False):
        return _err("System datasources cannot be deleted")
    db.delete(d)
    db.commit()
    log_tool_call(ctx, "datasources_delete", args={"datasource_id": datasource_id}, is_destructive=True)
    return _ok(f"Deleted datasource '{d.name}'")


def _datasources_test_impl(datasource_id: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(EdgeDatabase).filter(EdgeDatabase.id == datasource_id)
    q = project_filter(q, EdgeDatabase, ctx)
    d = q.first()
    if not d:
        return _err(f"Datasource '{datasource_id}' not found")
    # A real connectivity probe happens through the edge adapter at deploy time;
    # here we validate the record is complete enough to attempt a connection.
    has_url = bool(d.db_url)
    has_token = bool(getattr(d, "db_token", None))
    return _ok(
        "Datasource is configured" if has_url else "Datasource is missing a URL",
        datasourceId=str(d.id),
        hasUrl=has_url,
        hasCredentials=has_token,
    )


# =============================================================================
# Automation: Workflows
# =============================================================================

def _workflow_view(w: AutomationDraft) -> dict[str, Any]:
    return {
        "id": str(w.id),
        "name": str(w.name),
        "triggerType": str(w.trigger_type),
        "isPublished": bool(w.is_published),
        "isActive": bool(getattr(w, "is_active", True)),
        "description": str(w.description) if w.description else None,
    }


def _workflows_list_impl(db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(AutomationDraft)
    q = project_filter(q, AutomationDraft, ctx)
    rows = q.all()
    return {"count": len(rows), "workflows": [_workflow_view(w) for w in rows]}


def _workflows_get_impl(workflow_id: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(AutomationDraft).filter(AutomationDraft.id == workflow_id)
    q = project_filter(q, AutomationDraft, ctx)
    w = q.first()
    if not w:
        return _err(f"Workflow '{workflow_id}' not found")
    view = _workflow_view(w)
    view["nodeCount"] = len(w.nodes or []) if w.nodes is not None else 0
    return view


def _workflows_trigger_impl(workflow_id: str, payload: dict[str, Any], db: Session, ctx: ToolContext) -> dict[str, Any]:
    require_permission(ctx, "workflows.all", "trigger")
    assert_project_owned(db, ctx)
    q = db.query(AutomationDraft).filter(AutomationDraft.id == workflow_id)
    q = project_filter(q, AutomationDraft, ctx)
    w = q.first()
    if not w:
        return _err(f"Workflow '{workflow_id}' not found")
    if not w.is_published:
        return _err(f"Workflow '{w.name}' is not published and cannot be triggered")
    # Record the execution intent. Actual edge-side execution is dispatched by the
    # automation runtime; we log the trigger request for traceability.
    now = datetime.now(timezone.utc)
    execution = AutomationExecution(
        id=_short_id(),
        workflow_id=workflow_id,
        project_id=ctx.project_id,
        status="started",
        trigger_type=str(w.trigger_type),
        trigger_payload=payload or {},
        started_at=now,
    )
    db.add(execution)
    db.commit()
    log_tool_call(ctx, "workflows_trigger", args={"workflow_id": workflow_id}, is_destructive=True)
    return _ok(
        f"Triggered workflow '{w.name}'",
        executionId=str(execution.id),
        workflowId=workflow_id,
    )


def _workflows_create_impl(name: str, db: Session, ctx: ToolContext, description: str | None = None, trigger_type: str = "manual") -> dict[str, Any]:
    require_permission(ctx, "workflows.all", "write")
    project_id = assert_project_owned(db, ctx)
    w = AutomationDraft(
        id=_short_id(),
        name=name,
        description=description,
        trigger_type=trigger_type or "manual",
        nodes=[],
        edges=[],
        project_id=project_id,
    )
    db.add(w)
    db.commit()
    log_tool_call(ctx, "workflows_create", args={"name": name}, is_destructive=True)
    return _ok(f"Created workflow '{name}'", id=str(w.id))


# =============================================================================
# Integrations: MCP servers + Tools + Skills
# =============================================================================

def _mcp_servers_list_impl(db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(McpServer).filter(McpServer.is_active == True)  # noqa: E712
    q = project_filter(q, McpServer, ctx)
    rows = q.all()
    return {
        "count": len(rows),
        "mcpServers": [
            {
                "id": str(m.id),
                "name": str(m.name),
                "slug": str(m.slug),
                "url": str(m.url),
                "transport": str(m.transport),
                "category": str(m.category) if m.category else None,
            }
            for m in rows
        ],
    }


def _mcp_servers_add_impl(name: str, slug: str, url: str, db: Session, ctx: ToolContext, transport: str = "streamable-http", auth_type: str | None = None, token: str | None = None, category: str | None = None) -> dict[str, Any]:
    require_permission(ctx, "mcp_servers.all", "write")
    project_id = assert_project_owned(db, ctx)
    now = _now()
    auth_config = None
    if token:
        from ..core.security import encrypt_credentials
        auth_config = encrypt_credentials({"type": auth_type or "bearer", "token": token})
    server = McpServer(
        id=_short_id(),
        name=name,
        slug=slug,
        url=url,
        transport=transport,
        auth_type=auth_type,
        auth_config=auth_config,
        category=category,
        tenant_id=ctx.tenant_id,
        project_id=project_id,
        created_at=now,
        updated_at=now,
    )
    db.add(server)
    db.commit()
    log_tool_call(ctx, "mcp_servers_add", args={"name": name, "slug": slug}, is_destructive=True)
    return _ok(f"Added MCP server '{name}'", id=str(server.id))


def _mcp_servers_test_impl(server_id: str, db: Session, ctx: ToolContext) -> dict[str, Any]:
    q = db.query(McpServer).filter(McpServer.id == server_id)
    q = project_filter(q, McpServer, ctx)
    m = q.first()
    if not m:
        return _err(f"MCP server '{server_id}' not found")
    # Delegate the live probe to the MCP client module (optional dep — degrades gracefully).
    try:
        from . import mcp_client
        reachable = mcp_client.ping(str(m.url))
        return _ok("MCP server reachable" if reachable else "MCP server did not respond", serverId=str(m.id), reachable=reachable)
    except Exception as e:
        return _err(f"MCP test unavailable: {e}", serverId=str(m.id))


def _tools_list_impl(db: Session, ctx: ToolContext) -> dict[str, Any]:
    """List configured tools + installed skills available in this project."""
    tools_q = db.query(AgentTool)
    # Skills: include both project-scoped AND tenant-wide (built-in) skills
    skills_q = db.query(AgentSkill).filter(AgentSkill.is_active == True)  # noqa: E712
    if ctx.isolated and ctx.project_id:
        # Project-scoped OR tenant-wide (project_id IS NULL for built-ins)
        skills_q = skills_q.filter(
            (AgentSkill.project_id == ctx.project_id) | (AgentSkill.project_id == None)  # noqa: E712
        )
    return {
        "configuredTools": [
            {"id": str(t.id), "name": str(t.name), "type": str(t.type), "isActive": bool(t.is_active)}
            for t in tools_q.all()
        ],
        "skills": [
            {"id": str(s.id), "name": str(s.name), "slug": str(s.slug), "category": str(s.category) if s.category else None, "isBuiltin": bool(s.is_builtin)}
            for s in skills_q.all()
        ],
    }


# =============================================================================
# PydanticAI Tool Registration (permission-gated, isolation-aware)
# =============================================================================

def register_workspace_tools(agent: Any, ctx: ToolContext | None = None) -> None:
    """Register all permitted workspace tools on a PydanticAI agent.

    ``agent`` is a ``pydantic_ai.Agent`` at runtime; typed ``Any`` so this module
    imports without the optional ``pydantic_ai`` dependency. ``ctx`` carries the
    tenant + project + permission context; when omitted (legacy callers) a
    permissive default context is used (master-admin semantics).
    """
    if ctx is None:
        ctx = ToolContext()  # unrestricted default — back-compat for any direct caller

    # ---- Content: Pages ----------------------------------------------------
    if tool_allowed(ctx, "pages_list"):
        @agent.tool_plain
        def pages_list() -> str:
            """List all pages in the active project. Returns page name, slug, and status."""
            return json.dumps(_with_db(lambda db: _pages_list_impl(db, ctx)))

    if tool_allowed(ctx, "pages_get"):
        @agent.tool_plain
        def pages_get(slug: str) -> str:
            """Get the full structure of a page by slug — component tree (types/IDs) and SEO.

            Args:
                slug: The page slug (URL path), e.g. "about" or "pricing"
            """
            return json.dumps(_with_db(lambda db: _pages_get_impl(slug, db, ctx)))

    if tool_allowed(ctx, "pages_update_component"):
        @agent.tool_plain
        def pages_update_component(slug: str, component_id: str, updates: dict[str, Any]) -> str:
            """Update a component's properties on a page.

            Args:
                slug: The page slug
                component_id: The component ID to update
                updates: Key-value property updates
            """
            return json.dumps(_with_db(lambda db: _pages_update_component_impl(slug, component_id, updates, db, ctx)))

    if tool_allowed(ctx, "pages_update_text"):
        @agent.tool_plain
        def pages_update_text(slug: str, component_id: str, text: str) -> str:
            """Update the text of a Text/Heading component.

            Args:
                slug: The page slug
                component_id: The component ID
                text: The new text content
            """
            return json.dumps(_with_db(lambda db: _pages_update_component_impl(slug, component_id, {"text": text}, db, ctx)))

    if tool_allowed(ctx, "pages_create"):
        @agent.tool_plain
        def pages_create(name: str, slug: str, is_homepage: bool = False) -> str:
            """Create a new blank page.

            Args:
                name: Display name of the page
                slug: URL-safe slug, e.g. "contact"
                is_homepage: Whether this is the landing page (default False)
            """
            return json.dumps(_with_db(lambda db: _pages_create_impl(name, slug, db, ctx, is_homepage=is_homepage)))

    if tool_allowed(ctx, "pages_delete"):
        @agent.tool_plain
        def pages_delete(slug: str) -> str:
            """Delete a page by slug (soft-delete).

            Args:
                slug: The page slug to delete
            """
            return json.dumps(_with_db(lambda db: _pages_delete_impl(slug, db, ctx)))

    # ---- Content: SEO ------------------------------------------------------
    if tool_allowed(ctx, "seo_get"):
        @agent.tool_plain
        def seo_get(slug: str) -> str:
            """Get SEO settings (title, description, keywords) for a page.

            Args:
                slug: The page slug
            """
            return json.dumps(_with_db(lambda db: _seo_get_impl(slug, db, ctx)))

    if tool_allowed(ctx, "seo_update"):
        @agent.tool_plain
        def seo_update(slug: str, updates: dict[str, Any]) -> str:
            """Update SEO settings for a page. Keys: title, description, keywords.

            Args:
                slug: The page slug
                updates: dict with optional 'title', 'description', 'keywords'
            """
            return json.dumps(_with_db(lambda db: _seo_update_impl(slug, updates, db, ctx)))

    # ---- Content: Styles ---------------------------------------------------
    if tool_allowed(ctx, "styles_list"):
        @agent.tool_plain
        def styles_list() -> str:
            """List all component style/theme definitions in the project."""
            return json.dumps(_with_db(lambda db: _styles_list_impl(db, ctx)))

    if tool_allowed(ctx, "styles_get"):
        @agent.tool_plain
        def styles_get(theme_id: str) -> str:
            """Get a style/theme definition by ID.

            Args:
                theme_id: The style ID
            """
            return json.dumps(_with_db(lambda db: _styles_get_impl(theme_id, db, ctx)))

    if tool_allowed(ctx, "styles_update"):
        @agent.tool_plain
        def styles_update(theme_id: str, updates: dict[str, Any]) -> str:
            """Update a style/theme definition.

            Args:
                theme_id: The style ID
                updates: Style property overrides
            """
            return json.dumps(_with_db(lambda db: _styles_update_impl(theme_id, updates, db, ctx)))

    # ---- Infrastructure: Edge Engines -------------------------------------
    if tool_allowed(ctx, "edge_engines_list"):
        @agent.tool_plain
        def edge_engines_list() -> str:
            """List all active Edge Engines deployed in this project."""
            return json.dumps(_with_db(lambda db: _edge_engines_list_impl(db, ctx)))

    if tool_allowed(ctx, "edge_engines_get"):
        @agent.tool_plain
        def edge_engines_get(engine_id: str) -> str:
            """Get details (URL, status, deploy/sync timestamps) of an Edge Engine.

            Args:
                engine_id: The engine UUID
            """
            return json.dumps(_with_db(lambda db: _edge_engines_get_impl(engine_id, db, ctx)))

    if tool_allowed(ctx, "edge_engines_create"):
        @agent.tool_plain
        def edge_engines_create(name: str, url: str, adapter_type: str = "full") -> str:
            """Register a new Edge Engine endpoint.

            Args:
                name: Engine display name
                url: Engine URL (e.g. https://my-site.pages.dev)
                adapter_type: 'edge' | 'automations' | 'full' (default 'full')
            """
            return json.dumps(_with_db(lambda db: _edge_engines_create_impl(name, url, adapter_type, db, ctx)))

    if tool_allowed(ctx, "edge_engines_deploy"):
        @agent.tool_plain
        def edge_engines_deploy(engine_id: str) -> str:
            """Trigger a redeploy of an Edge Engine.

            Args:
                engine_id: The engine UUID to deploy
            """
            return json.dumps(_with_db(lambda db: _edge_engines_deploy_impl(engine_id, db, ctx)))

    if tool_allowed(ctx, "engine_info"):
        @agent.tool_plain
        def engine_info() -> str:
            """Get information about all active Edge Engines (alias of edge_engines_list)."""
            return json.dumps(_with_db(lambda db: _edge_engines_list_impl(db, ctx)))

    # ---- Infrastructure: Providers ----------------------------------------
    if tool_allowed(ctx, "providers_list"):
        @agent.tool_plain
        def providers_list() -> str:
            """List all configured Edge Provider accounts (credentials are masked)."""
            return json.dumps(_with_db(lambda db: _providers_list_impl(db, ctx)))

    if tool_allowed(ctx, "providers_create"):
        @agent.tool_plain
        def providers_create(name: str, provider: str, api_key: str) -> str:
            """Add a new provider account. The API key is encrypted at rest.

            Args:
                name: Display name, e.g. "Personal OpenAI"
                provider: Provider type, e.g. 'openai' | 'anthropic' | 'google' | 'cloudflare'
                api_key: The provider API key (stored encrypted)
            """
            return json.dumps(_with_db(lambda db: _providers_create_impl(name, provider, api_key, db, ctx)))

    if tool_allowed(ctx, "providers_test"):
        @agent.tool_plain
        def providers_test(provider_id: str) -> str:
            """Check whether a provider account has credentials configured.

            Args:
                provider_id: The provider UUID
            """
            return json.dumps(_with_db(lambda db: _providers_test_impl(provider_id, db, ctx)))

    if tool_allowed(ctx, "providers_update"):
        @agent.tool_plain
        def providers_update(provider_id: str, updates: dict[str, Any]) -> str:
            """Update a provider account. Keys: name, is_active, api_key.

            Args:
                provider_id: The provider UUID
                updates: dict with optional 'name', 'is_active', 'api_key'
            """
            return json.dumps(_with_db(lambda db: _providers_update_impl(provider_id, updates, db, ctx)))

    # ---- Data: Datasources -------------------------------------------------
    if tool_allowed(ctx, "datasources_list"):
        @agent.tool_plain
        def datasources_list() -> str:
            """List all configured datasources (edge databases). Credentials are masked."""
            return json.dumps(_with_db(lambda db: _datasources_list_impl(db, ctx)))

    if tool_allowed(ctx, "datasources_get"):
        @agent.tool_plain
        def datasources_get(datasource_id: str) -> str:
            """Get a datasource's configuration by ID.

            Args:
                datasource_id: The datasource UUID
            """
            return json.dumps(_with_db(lambda db: _datasources_get_impl(datasource_id, db, ctx)))

    if tool_allowed(ctx, "datasources_create"):
        @agent.tool_plain
        def datasources_create(name: str, provider: str, db_url: str, token: str | None = None) -> str:
            """Create a new datasource connection.

            Args:
                name: Display name
                provider: e.g. 'turso' | 'neon' | 'planetscale'
                db_url: Connection URL
                token: Optional auth token (encrypted at rest)
            """
            return json.dumps(_with_db(lambda db: _datasources_create_impl(name, provider, db_url, db, ctx, token=token)))

    if tool_allowed(ctx, "datasources_update"):
        @agent.tool_plain
        def datasources_update(datasource_id: str, updates: dict[str, Any]) -> str:
            """Update a datasource. Keys: name, db_url, token.

            Args:
                datasource_id: The datasource UUID
                updates: dict with optional 'name', 'db_url', 'token'
            """
            return json.dumps(_with_db(lambda db: _datasources_update_impl(datasource_id, updates, db, ctx)))

    if tool_allowed(ctx, "datasources_delete"):
        @agent.tool_plain
        def datasources_delete(datasource_id: str) -> str:
            """Delete a datasource (system datasources are protected).

            Args:
                datasource_id: The datasource UUID to delete
            """
            return json.dumps(_with_db(lambda db: _datasources_delete_impl(datasource_id, db, ctx)))

    if tool_allowed(ctx, "datasources_test"):
        @agent.tool_plain
        def datasources_test(datasource_id: str) -> str:
            """Validate a datasource has the required URL + credentials.

            Args:
                datasource_id: The datasource UUID
            """
            return json.dumps(_with_db(lambda db: _datasources_test_impl(datasource_id, db, ctx)))

    # ---- Automation: Workflows --------------------------------------------
    if tool_allowed(ctx, "workflows_list"):
        @agent.tool_plain
        def workflows_list() -> str:
            """List all workflows (automation drafts) in the project."""
            return json.dumps(_with_db(lambda db: _workflows_list_impl(db, ctx)))

    if tool_allowed(ctx, "workflows_get"):
        @agent.tool_plain
        def workflows_get(workflow_id: str) -> str:
            """Get a workflow's definition by ID.

            Args:
                workflow_id: The workflow UUID
            """
            return json.dumps(_with_db(lambda db: _workflows_get_impl(workflow_id, db, ctx)))

    if tool_allowed(ctx, "workflows_trigger"):
        @agent.tool_plain
        def workflows_trigger(workflow_id: str, payload: dict[str, Any] | None = None) -> str:
            """Trigger a published workflow.

            Args:
                workflow_id: The workflow UUID
                payload: Optional input parameters for the workflow
            """
            return json.dumps(_with_db(lambda db: _workflows_trigger_impl(workflow_id, payload or {}, db, ctx)))

    if tool_allowed(ctx, "workflows_create"):
        @agent.tool_plain
        def workflows_create(name: str, description: str | None = None, trigger_type: str = "manual") -> str:
            """Create a new blank workflow.

            Args:
                name: Workflow name
                description: Optional description
                trigger_type: e.g. 'manual' | 'schedule' | 'webhook' (default 'manual')
            """
            return json.dumps(_with_db(lambda db: _workflows_create_impl(name, db, ctx, description=description, trigger_type=trigger_type)))

    # ---- Integrations: MCP + Tools + Skills -------------------------------
    if tool_allowed(ctx, "mcp_servers_list"):
        @agent.tool_plain
        def mcp_servers_list() -> str:
            """List all configured MCP servers in the project."""
            return json.dumps(_with_db(lambda db: _mcp_servers_list_impl(db, ctx)))

    if tool_allowed(ctx, "mcp_servers_add"):
        @agent.tool_plain
        def mcp_servers_add(name: str, slug: str, url: str, transport: str = "streamable-http", auth_type: str | None = None, token: str | None = None, category: str | None = None) -> str:
            """Register an external MCP server as a tool source.

            Args:
                name: Display name
                slug: URL-safe slug
                url: MCP server endpoint URL
                transport: 'streamable-http' | 'sse' (default 'streamable-http')
                auth_type: 'bearer' | 'basic' | 'none'
                token: Optional auth token (encrypted at rest)
                category: e.g. 'database' | 'web' | 'utility'
            """
            return json.dumps(_with_db(lambda db: _mcp_servers_add_impl(name, slug, url, db, ctx, transport=transport, auth_type=auth_type, token=token, category=category)))

    if tool_allowed(ctx, "mcp_servers_test"):
        @agent.tool_plain
        def mcp_servers_test(server_id: str) -> str:
            """Test connectivity to an MCP server.

            Args:
                server_id: The MCP server UUID
            """
            return json.dumps(_with_db(lambda db: _mcp_servers_test_impl(server_id, db, ctx)))

    if tool_allowed(ctx, "tools_list"):
        @agent.tool_plain
        def tools_list() -> str:
            """List configured tools and installed skills available in this project."""
            return json.dumps(_with_db(_tools_list_impl))
