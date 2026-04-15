"""
Agent Tools — PydanticAI tool definitions for the Master Admin Workspace Agent.

These are the Python equivalents of the Edge Engine's Tier 2 tools
(pages.ts, styles.ts, engine.ts), operating directly on SQLAlchemy models.

Tools are registered on a PydanticAI Agent via register_workspace_tools().
"""

import json
import logging
from typing import Any

from pydantic_ai import Agent, RunContext
from sqlalchemy.orm import Session

from ..models.models import Page, EdgeEngine, EdgeProviderAccount
from ..database.config import SessionLocal

logger = logging.getLogger(__name__)


# =============================================================================
# Helper: run a sync DB function and return the result
# =============================================================================

def _with_db(fn):
    """Execute a function with a fresh DB session and return the result."""
    db = SessionLocal()
    try:
        return fn(db)
    finally:
        db.close()


# =============================================================================
# Tool Implementations (pure functions, no PydanticAI dependency)
# =============================================================================

def _pages_list_impl(db: Session) -> dict[str, Any]:
    """List all pages in the system."""
    pages = db.query(Page).filter(Page.deleted_at == None).all()  # noqa: E711
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


def _pages_get_impl(slug: str, db: Session) -> dict[str, Any]:
    """Get the full structure of a page by slug."""
    page = db.query(Page).filter(
        Page.slug == slug, Page.deleted_at == None  # noqa: E711
    ).first()

    if not page:
        return {"error": f"Page with slug '{slug}' not found"}

    layout_data = page.layout_data
    if isinstance(layout_data, str):
        try:
            layout_data = json.loads(layout_data)
        except (json.JSONDecodeError, TypeError):
            layout_data = {"content": [], "root": {}}

    def summarize_components(components: list) -> list:
        result = []
        for c in (components or []):
            summary: dict[str, Any] = {
                "id": c.get("id"),
                "type": c.get("type"),
            }
            props = c.get("props", {})
            if props.get("text"):
                summary["text"] = str(props["text"])[:100]
            if props.get("label"):
                summary["label"] = props["label"]
            if props.get("src"):
                summary["src"] = props["src"]
            binding = c.get("binding", {})
            if binding and binding.get("tableName"):
                summary["boundTo"] = binding["tableName"]
            children = c.get("children", [])
            if children:
                summary["children"] = summarize_components(children)
            result.append(summary)
        return result

    content = layout_data.get("content", []) if isinstance(layout_data, dict) else []

    return {
        "name": str(page.name),
        "slug": str(page.slug),
        "isHomepage": bool(page.is_homepage),
        "isPublic": bool(page.is_public),
        "seo": {
            "title": str(page.title or page.name),
            "description": str(page.description or ""),
        },
        "components": summarize_components(content),
    }


def _pages_update_component_impl(slug: str, component_id: str, updates: dict, db: Session) -> dict[str, Any]:
    """Update a specific component's properties on a page."""
    page = db.query(Page).filter(
        Page.slug == slug, Page.deleted_at == None  # noqa: E711
    ).first()
    if not page:
        return {"error": f"Page '{slug}' not found"}

    layout_data = page.layout_data
    if isinstance(layout_data, str):
        try:
            layout_data = json.loads(layout_data)
        except (json.JSONDecodeError, TypeError):
            return {"error": "Failed to parse page layout data"}

    def find_and_update(components: list, target_id: str) -> bool:
        for c in components:
            if c.get("id") == target_id:
                if "props" not in c:
                    c["props"] = {}
                c["props"].update(updates)
                return True
            if c.get("children") and find_and_update(c["children"], target_id):
                return True
        return False

    content = layout_data.get("content", [])
    if not find_and_update(content, component_id):
        return {"error": f"Component '{component_id}' not found on page '{slug}'"}

    page.layout_data = json.dumps(layout_data)  # type: ignore[assignment]
    db.commit()

    return {
        "success": True,
        "message": f"Updated component '{component_id}' on page '{slug}'",
    }


def _engine_info_impl(db: Session) -> dict[str, Any]:
    """Get information about the Edge Engines deployed."""
    engines = db.query(EdgeEngine).filter(EdgeEngine.is_active == True).all()  # noqa: E711
    return {
        "count": len(engines),
        "engines": [
            {
                "id": str(e.id),
                "name": str(e.name),
                "url": str(e.url),
                "adapterType": str(e.adapter_type),
                "isSystem": bool(e.is_system),
            }
            for e in engines
        ],
    }


def _providers_list_impl(db: Session) -> dict[str, Any]:
    """List all configured Edge Provider accounts."""
    providers = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.is_active == True  # noqa: E711
    ).all()
    return {
        "count": len(providers),
        "providers": [
            {
                "id": str(p.id),
                "name": str(p.name),
                "provider": str(p.provider),
                "hasCredentials": bool(p.provider_credentials),
            }
            for p in providers
        ],
    }


# =============================================================================
# PydanticAI Tool Registration
# =============================================================================

def register_workspace_tools(agent: Agent) -> None:
    """Register all workspace tools on a PydanticAI agent."""

    @agent.tool_plain
    def pages_list() -> str:
        """List all pages in the Frontbase project. Returns page name, slug, and status for each page."""
        result = _with_db(_pages_list_impl)
        return json.dumps(result)

    @agent.tool_plain
    def pages_get(slug: str) -> str:
        """Get the full structure of a page by slug. Returns the page name, component tree (types and IDs), and SEO metadata.

        Args:
            slug: The page slug (URL path), e.g. "about" or "pricing"
        """
        result = _with_db(lambda db: _pages_get_impl(slug, db))
        return json.dumps(result)

    @agent.tool_plain
    def pages_update_component(slug: str, component_id: str, updates: dict[str, Any]) -> str:
        """Update a specific component's properties on a page. Provide the page slug, component ID, and a dict of property updates.

        Args:
            slug: The page slug
            component_id: The ID of the component to update
            updates: Key-value pairs of properties to update on the component
        """
        result = _with_db(lambda db: _pages_update_component_impl(slug, component_id, updates, db))
        return json.dumps(result)

    @agent.tool_plain
    def pages_update_text(slug: str, component_id: str, text: str) -> str:
        """Update the text content of a Text or Heading component. Shortcut for updating the 'text' prop.

        Args:
            slug: The page slug
            component_id: The ID of the text/heading component
            text: The new text content
        """
        result = _with_db(lambda db: _pages_update_component_impl(slug, component_id, {"text": text}, db))
        return json.dumps(result)

    @agent.tool_plain
    def engine_info() -> str:
        """Get information about all active Edge Engines deployed in this Frontbase instance."""
        result = _with_db(_engine_info_impl)
        return json.dumps(result)

    @agent.tool_plain
    def providers_list() -> str:
        """List all configured Edge Provider accounts (Cloudflare, Supabase, etc.)."""
        result = _with_db(_providers_list_impl)
        return json.dumps(result)
