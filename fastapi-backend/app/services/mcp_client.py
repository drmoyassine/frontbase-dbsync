"""MCP client for the Workspace Agent.

Connects to external MCP servers (registered in the ``mcp_servers`` table) and
exposes their tools to the agent — the Python counterpart of the Edge Agent's
``buildMcpClientTools`` (``services/edge/src/engine/agent/tools/user-tools.ts``).

The official ``mcp`` SDK is imported lazily so the backend runs without it (the
agent gracefully reports MCP as unavailable). All public entrypoints are sync
wrappers around the async SDK so they can be called from the sync tool layer
(``_with_db`` / ``run_in_threadpool``).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _mcp_available() -> bool:
    try:
        import mcp  # noqa: F401
        return True
    except Exception:
        return False


def _auth_headers(auth_config: Optional[str], auth_type: Optional[str]) -> dict[str, str]:
    """Build request headers from a (decrypted) auth_config blob."""
    headers: dict[str, str] = {}
    if not auth_config:
        return headers
    try:
        cfg = json.loads(auth_config) if isinstance(auth_config, str) else auth_config
    except (json.JSONDecodeError, TypeError):
        return headers
    token = cfg.get("token")
    atype = (auth_type or cfg.get("type") or "").lower()
    if token and atype == "bearer":
        headers["Authorization"] = f"Bearer {token}"
    elif token and atype == "basic":
        headers["Authorization"] = f"Basic {token}"
    elif isinstance(cfg.get("headers"), dict):
        headers.update({str(k): str(v) for k, v in cfg["headers"].items()})
    return headers


async def _list_tools_async(url: str, transport: str, headers: dict[str, str]) -> list[dict[str, Any]]:
    """Connect to an MCP server and return its tool catalogue."""
    from mcp import ClientSession
    if transport == "sse":
        from mcp.client.sse import sse_client
        ctx = sse_client(url, headers=headers)
    else:
        from mcp.client.streamable_http import streamablehttp_client
        ctx = streamablehttp_client(url, headers=headers)

    async with ctx as (read, write, _info):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.list_tools()
            return [
                {"name": t.name, "description": t.description, "inputSchema": t.inputSchema}
                for t in (result.tools or [])
            ]


async def _call_tool_async(
    url: str, transport: str, headers: dict[str, str], name: str, args: dict[str, Any]
) -> Any:
    """Call one tool on an MCP server and return its text content."""
    from mcp import ClientSession
    if transport == "sse":
        from mcp.client.sse import sse_client
        ctx = sse_client(url, headers=headers)
    else:
        from mcp.client.streamable_http import streamablehttp_client
        ctx = streamablehttp_client(url, headers=headers)

    async with ctx as (read, write, _info):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(name, args or {})
            # Concatenate text content blocks (mirror the Edge agent behaviour).
            texts = [
                getattr(c, "text", "")
                for c in (getattr(result, "content", []) or [])
                if getattr(c, "type", None) == "text"
            ]
            if texts:
                joined = "\n".join(texts)
                try:
                    return json.loads(joined)
                except (json.JSONDecodeError, TypeError):
                    return joined
            return None


def _run(coro):
    """Run a coroutine to completion, creating a new loop if needed."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    # Already inside a loop — run in a dedicated thread to avoid blocking it.
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        return ex.submit(asyncio.run, coro).result()


def ping(url: str, timeout: float = 5.0) -> bool:
    """Cheap reachability probe (HTTP HEAD/GET). Used by mcp_servers_test."""
    try:
        import httpx
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            resp = client.get(url)
        return resp.status_code < 500
    except Exception:
        return False


def list_tools(
    url: str,
    transport: str = "streamable-http",
    auth_config: Optional[str] = None,
    auth_type: Optional[str] = None,
) -> list[dict[str, Any]]:
    """List the tools exposed by an MCP server (sync wrapper)."""
    if not _mcp_available():
        raise RuntimeError("The 'mcp' SDK is not installed.")
    headers = _auth_headers(auth_config, auth_type)
    return _run(_list_tools_async(url, transport, headers))


def call_tool(
    url: str,
    name: str,
    args: Optional[dict[str, Any]] = None,
    transport: str = "streamable-http",
    auth_config: Optional[str] = None,
    auth_type: Optional[str] = None,
) -> Any:
    """Call a tool on an MCP server (sync wrapper)."""
    if not _mcp_available():
        raise RuntimeError("The 'mcp' SDK is not installed.")
    headers = _auth_headers(auth_config, auth_type)
    return _run(_call_tool_async(url, transport, headers, name, args or {}))
