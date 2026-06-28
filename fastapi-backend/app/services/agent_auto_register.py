"""API auto-registration for the Workspace Agent.

Mirrors the Edge Engine's ``auto-register.ts``: introspect the backend's own
OpenAPI schema and expose selected endpoints as agent tools, gated by the
``api.{tag}`` permission (deny-by-default), de-duplicated against the curated
tool set, and capped by ``ctx.max_auto_tools``.

Permission configurability is the headline feature: the master admin toggles
which API tags the Workspace Agent may call (``api.pages``, ``api.users``, …)
per profile, sets the cap, and excludes specific endpoints — exactly as the
Edge Agent does.

The internal HTTP call is best-effort and configurable via
``WORKSPACE_AGENT_API_BASE`` (e.g. ``http://localhost:8000``). When unset the
tools still register (so the catalogue + permissions are observable / testable)
but report that the internal bridge is not configured.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Endpoints never exposed as auto-tools (recursion / auth / agent self-calls).
_EXCLUDE_PATH_PATTERNS = (
    re.compile(r"^/api/agent", re.IGNORECASE),
    re.compile(r"/openapi", re.IGNORECASE),
    re.compile(r"/docs", re.IGNORECASE),
    re.compile(r"/redoc", re.IGNORECASE),
    re.compile(r"^/api/admin", re.IGNORECASE),  # admin-only, never auto-exposed
    re.compile(r"/auth", re.IGNORECASE),
)

_DEFAULT_CAP = 50


def _slug_tag(tag: Optional[str]) -> str:
    if not tag:
        return "api"
    return re.sub(r"\s+", "_", str(tag).strip().lower()) or "api"


def _is_excluded(path: str) -> bool:
    return any(p.search(path) for p in _EXCLUDE_PATH_PATTERNS)


def discover_api_tools(app: Any, ctx: Any, curated_names: Optional[set[str]] = None) -> list[dict[str, Any]]:
    """Return the permission-gated, de-duplicated, capped list of auto-API tools.

    Each entry: ``{name, tag, method, path, summary}``. This is the observable
    catalogue — used by the admin UI ("which API tools are registered?") and by
    the registration layer.
    """
    curated = curated_names or set()
    try:
        schema = app.openapi() if hasattr(app, "openapi") else None
    except Exception:
        schema = None
    if not schema:
        return []

    cap = ctx.max_auto_tools or _DEFAULT_CAP
    paths = schema.get("paths") or {}
    tools: list[dict[str, Any]] = []
    seen: set[str] = set()

    from .agent_permissions import has_permission

    for path, methods in paths.items():
        if _is_excluded(path):
            continue
        for method, op in (methods or {}).items():
            if method.lower() not in ("get", "post", "put", "patch", "delete"):
                continue
            tag = _slug_tag((op.get("tags") or [None])[0])
            # Permission gate (deny-by-default). Master admin / self-host bypasses.
            if ctx.isolated and not (
                has_permission(ctx.permissions, f"api.{tag}", "execute")
                or has_permission(ctx.permissions, "api.all", "execute")
            ):
                continue

            op_id = op.get("operationId") or f"{method}_{path}".replace("/", "_").strip("_")
            name = f"{tag}_{op_id}"
            if name in curated or name in seen or ctx.is_tool_excluded(name):
                continue
            if len(tools) >= cap:
                logger.info("[auto-register] cap (%d) reached; skipping remaining endpoints", cap)
                return tools

            seen.add(name)
            tools.append({
                "name": name,
                "tag": tag,
                "method": method.upper(),
                "path": path,
                "summary": op.get("summary") or op.get("description") or f"{method.upper()} {path}",
            })
    return tools


def register_auto_tools(agent: Any, app: Any, ctx: Any, curated_names: Optional[set[str]] = None) -> list[str]:
    """Register the discovered API tools on a PydanticAI agent.

    Each tool takes a single ``params: dict`` (the model fills query/body params)
    and dispatches an internal HTTP call to the backend. Returns the list of
    registered tool names. When no internal base URL is configured, the tool
    registers but reports that the bridge is off (so the catalogue + permissions
    remain observable and testable without a live HTTP path).
    """
    if ctx.is_tool_excluded("__auto_register__"):
        return []

    catalogue = discover_api_tools(app, ctx, curated_names)
    base_url = os.getenv("WORKSPACE_AGENT_API_BASE", "").rstrip("/")
    registered: list[str] = []

    for entry in catalogue:
        name = entry["name"]
        method = entry["method"]
        path = entry["path"]
        summary = entry["summary"]

        # Close over the per-entry values (avoid late-binding in the loop). Define
        # the function, set its name + doc, THEN register — PydanticAI reads
        # __name__/__doc__ at registration time, so they must be set first.
        def _make(_name=name, _method=method, _path=path, _summary=summary):
            def _auto_api_tool(params: dict[str, Any]) -> str:
                """Call an internal Frontbase API endpoint."""
                return json.dumps(_invoke_internal(_method, _path, params, base_url, ctx, _name))

            _auto_api_tool.__name__ = _name
            _auto_api_tool.__doc__ = f"[Auto-registered API: {_method} {_path}] {_summary}"
            try:
                agent.tool_plain(_auto_api_tool)  # register by call (not decorator)
            except Exception:  # pragma: no cover — never let one bad endpoint break registration
                logger.debug("[auto-register] skipped %s", _name, exc_info=True)
                return None
            return _name

        result = _make()
        if result:
            registered.append(result)
    return registered


def _invoke_internal(
    method: str,
    path: str,
    params: dict[str, Any],
    base_url: Optional[str],
    ctx: Any,
    tool_name: str,
) -> dict[str, Any]:
    """Dispatch the internal API call. Defensive: never raises into the tool loop.

    Re-validates permissions at execution time (not just at registration) to ensure
    revocation takes effect immediately.
    """
    # SECURITY: Re-check permissions on every execution, not just at registration.
    # This prevents a tool from being used after its permission is revoked.
    from .agent_permissions import has_permission
    # Extract the API tag from the path (e.g., /api/workflows -> workflows)
    tag = _slug_tag(path.split('/')[2] if len(path.split('/')) > 2 else None)
    if tag and getattr(ctx, 'isolated', False) and not has_permission(ctx.permissions, f"api.{tag}", "execute"):
        return {
            "success": False,
            "error": "Permission denied",
            "endpoint": f"{method} {path}",
            "tool": tool_name,
        }

    if not base_url:
        return {
            "success": False,
            "error": "Internal API bridge is not configured (WORKSPACE_AGENT_API_BASE unset).",
            "endpoint": f"{method} {path}",
            "tool": tool_name,
        }
    try:
        import httpx
        headers = {"Content-Type": "application/json"}
        # Forward the caller's project context so the internal call is scoped identically.
        if ctx.project_id:
            headers["X-Project-Id"] = str(ctx.project_id)
        url = base_url + path
        with httpx.Client(timeout=15.0) as client:
            if method == "GET":
                resp = client.get(url, params=params or None, headers=headers)
            else:
                resp = client.request(method, url, json=params or None, headers=headers)
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        return {
            "success": 200 <= resp.status_code < 300,
            "status": resp.status_code,
            "endpoint": f"{method} {path}",
            "data": body,
        }
    except Exception as e:  # pragma: no cover
        return {"success": False, "error": f"Internal API call failed: {e}", "endpoint": f"{method} {path}"}
