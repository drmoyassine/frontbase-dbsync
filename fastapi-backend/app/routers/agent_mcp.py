"""
Agent MCP Server Router — Expose Workspace Agent as an MCP server.

Implements the Model Context Protocol (MCP) server specification, allowing
external MCP clients to connect to the Workspace Agent and invoke its tools
as MCP tools.

Each agent profile (identified by profile_slug) becomes an accessible MCP
server at /api/agent/mcp/{profile_slug}.

MCP Protocol Support:
- Root endpoint: Server metadata and capabilities
- tools/list: List all available tools for the profile
- tools/call: Execute a tool and return the result
- resources/list: List available resources (pages, workflows, config)
- prompts/list: List available prompts (system prompts)
- prompts/get: Get a specific prompt
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from app.config.edition import is_cloud
from app.database.config import SessionLocal
from app.middleware.tenant_context import TenantContext, get_tenant_context
from app.models.edge import EdgeAgentProfile
from app.models.models import Project

logger = logging.getLogger(__name__)

from ..schemas.op_responses import GetPromptResult, ListPromptsResult, ListResourcesResult, ListToolsResult, McpRootResult
router = APIRouter(prefix="/api/agent/mcp", tags=["Agent MCP"])


def _resolve_profile(db, profile_slug: str) -> EdgeAgentProfile:
    """Resolve an EdgeAgentProfile by slug. Raises 404 if not found."""
    profile = db.query(EdgeAgentProfile).filter(EdgeAgentProfile.slug == profile_slug).first()
    if not profile:
        raise HTTPException(status_code=404, detail=f"Agent profile '{profile_slug}' not found")
    return profile


async def _auth_profile(db, request: Request, profile: EdgeAgentProfile) -> None:
    """Verify the caller has access to this profile.

    For cloud mode: validates JWT tenant owns the profile's project.
    For self-host: validates session or basic auth.
    """
    if is_cloud():
        # Cloud mode: verify tenant ownership via X-Project-Id header
        ctx = await get_tenant_context(request)
        if not ctx or not ctx.tenant_id:
            raise HTTPException(status_code=401, detail="Authentication required")

        # Verify profile's project belongs to the tenant
        project = db.query(Project).filter(
            Project.id == profile.project_id,
            Project.tenant_id == ctx.tenant_id
        ).first()
        if not project:
            raise HTTPException(status_code=403, detail="Profile not accessible")
    else:
        # Self-host: verify session
        from ..routers.auth import get_current_user
        user = get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")


def _tool_to_mcp_schema(tool_def: dict) -> dict:
    """Convert a Workspace Agent tool definition to MCP tool schema."""
    # Extract the tool's input schema if available
    input_schema = tool_def.get("inputSchema", {
        "type": "object",
        "properties": {},
    })

    return {
        "name": tool_def.get("name", "unknown"),
        "description": tool_def.get("description", ""),
        "inputSchema": input_schema,
    }


@router.get("/{profile_slug}", response_model=McpRootResult)
async def mcp_root(profile_slug: str, request: Request):
    """MCP server discovery endpoint.

    Returns server metadata including:
    - name: Server name
    - version: Protocol version
    - capabilities: Supported features (tools, resources, prompts)
    """
    db = SessionLocal()
    try:
        profile = _resolve_profile(db, profile_slug)
        await _auth_profile(db, request, profile)

        return {
            "name": f"Frontbase Workspace Agent - {profile.name}",
            "version": "1.0.0",
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {},
                "resources": {},
                "prompts": {},
            },
            "instructions": f"Workspace Agent profile: {profile.name}. "
                           "Use this agent to manage pages, workflows, datasources, and more.",
        }
    finally:
        db.close()


@router.post("/{profile_slug}/tools/list", response_model=ListToolsResult)
async def list_tools(profile_slug: str, request: Request):
    """List all tools available on this agent profile.

    Returns a list of tool schemas following the MCP tool specification.
    Includes:
    - Curated Workspace Agent tools (pages, workflows, datasources, etc.)
    - Auto-registered API tools (if enabled)
    - Installed MCP client tools (if any)
    - Installed skills (if any)
    """
    db = SessionLocal()
    try:
        profile = _resolve_profile(db, profile_slug)
        await _auth_profile(db, request, profile)

        # Get the ToolContext for this profile
        from ..services.agent_permissions import ToolContext, default_workspace_permissions, default_support_permissions

        # Determine permissions based on profile type (heuristic from use_type)
        use_type = "workspace" if "workspace" in profile.slug.lower() else "support"
        perms = default_workspace_permissions() if use_type == "workspace" else default_support_permissions()

        ctx = ToolContext(
            tenant_id=None,  # Already validated by _auth_profile
            project_id=str(profile.project_id),
            is_master=False,
            profile_slug=str(profile.slug),
            permissions=perms,
            excluded_tools=set(json.loads(str(profile.excluded_tools))) if profile.excluded_tools is not None and str(profile.excluded_tools) else set(),
            max_auto_tools=int(str(profile.max_auto_tools)) if profile.max_auto_tools is not None else 50,
        )

        # Register and get all tools for this context
        from ..services.agent_tools import register_workspace_tools
        from ..services.agent_auto_register import discover_api_tools
        from ..services.agent_executor import _resolve_profile_config

        # Get profile config
        config = _resolve_profile_config(db, use_type, profile.provider_id, profile.model_id)

        tools = []

        # 1. Register curated workspace tools and collect their schemas
        # Note: We need to capture tool definitions without actually creating an agent
        # For now, we'll return a static list based on the permission map
        from ..services.agent_permissions import TOOL_PERMISSION_MAP

        for tool_name, (resource, action) in TOOL_PERMISSION_MAP.items():
            from ..services.agent_permissions import tool_allowed
            if tool_allowed(ctx, tool_name):
                # Generate a basic tool schema
                tools.append(_tool_to_mcp_schema({
                    "name": tool_name,
                    "description": f"Tool for {action} on {resource}",
                }))

        # 2. Add auto-registered API tools (if enabled)
        if profile.mcp_enabled is not None and bool(profile.mcp_enabled):
            auto_tools = discover_api_tools(None, ctx, curated_names=set())
            for tool_def in auto_tools:
                tools.append(_tool_to_mcp_schema(tool_def))

        return {
            "tools": tools,
        }
    finally:
        db.close()


@router.post("/{profile_slug}/tools/call", response_model=str)
async def call_tool(profile_slug: str, request: Request):
    """Execute a tool and return the result.

    Accepts:
    - name: Tool name to execute
    - arguments: Tool input parameters (dict)

    Returns:
    - content: Result content (text or JSON)
    - isError: True if the tool failed
    """
    db = SessionLocal()
    try:
        profile = _resolve_profile(db, profile_slug)
        await _auth_profile(db, request, profile)

        body = await request.json()
        tool_name = body.get("name")
        arguments = body.get("arguments", {})

        if not tool_name:
            raise HTTPException(status_code=400, detail="Missing tool name")

        # Import executor here to avoid circular dependency
        from ..services.agent_executor import execute_agent_turn
        from ..services.agent_permissions import ToolContext, default_workspace_permissions, default_support_permissions

        use_type = "workspace" if "workspace" in profile.slug.lower() else "support"
        perms = default_workspace_permissions() if use_type == "workspace" else default_support_permissions()

        ctx = ToolContext(
            tenant_id=None,
            project_id=str(profile.project_id),
            is_master=False,
            profile_slug=str(profile.slug),
            permissions=perms,
            excluded_tools=set(json.loads(str(profile.excluded_tools))) if profile.excluded_tools is not None and str(profile.excluded_tools) else set(),
            max_auto_tools=int(str(profile.max_auto_tools)) if profile.max_auto_tools is not None else 50,
        )

        # Construct a simple message that asks the agent to use the specific tool
        # This is a workaround - ideally we'd invoke the tool directly
        messages = [
            {
                "role": "user",
                "content": f"Use the {tool_name} tool with these arguments: {json.dumps(arguments)}. "
                          f"Return only the tool result, no explanation.",
            }
        ]

        # Execute the agent turn
        async def _stream():
            try:
                async for chunk in execute_agent_turn(
                    app=None,  # Not needed for tool execution
                    tenant_id=None,
                    project_id=str(profile.project_id),
                    user_id=None,
                    is_master=False,
                    profile_slug=str(profile.slug),
                    messages=messages,
                    use_type=use_type,
                ):
                    yield chunk
            except Exception as e:
                logger.error(f"Tool execution failed: {e}", exc_info=True)
                yield json.dumps({
                    "content": [{"type": "text", "text": f"Tool execution failed: {str(e)}"}],
                    "isError": True,
                })

        # Collect the full response to extract the tool result
        # For now, we'll return a streaming response
        return StreamingResponse(
            _stream(),
            media_type="text/event-stream",
        )
    finally:
        db.close()


@router.post("/{profile_slug}/resources/list", response_model=ListResourcesResult)
async def list_resources(profile_slug: str, request: Request):
    """List available MCP resources.

    Resources represent structured data the agent can access:
    - Pages (from the CMS)
    - Workflows
    - Configuration
    """
    db = SessionLocal()
    try:
        profile = _resolve_profile(db, profile_slug)
        await _auth_profile(db, request, profile)

        # Return basic resources
        resources = [
            {
                "uri": "config://agent",
                "name": "Agent Configuration",
                "description": "Current agent configuration and settings",
                "mimeType": "application/json",
            },
            {
                "uri": "config://profile",
                "name": "Profile Settings",
                "description": f"Settings for profile: {profile.name}",
                "mimeType": "application/json",
            },
        ]

        # Add pages as resources if the profile has pages permission
        from ..services.agent_permissions import has_permission, default_workspace_permissions, default_support_permissions

        use_type = "workspace" if "workspace" in profile.slug.lower() else "support"
        perms = default_workspace_permissions() if use_type == "workspace" else default_support_permissions()

        if has_permission(perms, "pages.all", "read"):
            from app.models.models import Page
            pages = db.query(Page).filter(
                Page.project_id == profile.project_id,
                Page.deleted_at == None
            ).limit(100).all()

            for page in pages:
                name_str = str(page.title) if page.title is not None and str(page.title) else str(page.slug)
                resources.append({
                    "uri": f"page://{page.id}",
                    "name": name_str,
                    "description": f"Page: {str(page.slug)}",
                    "mimeType": "text/html",
                })

        return {"resources": resources}
    finally:
        db.close()


@router.post("/{profile_slug}/prompts/list", response_model=ListPromptsResult)
async def list_prompts(profile_slug: str, request: Request):
    """List available prompts (system prompts)."""
    db = SessionLocal()
    try:
        profile = _resolve_profile(db, profile_slug)
        await _auth_profile(db, request, profile)

        prompts = [
            {
                "name": "default",
                "description": "Default system prompt",
                "arguments": [
                    {
                        "name": "system_prompt",
                        "description": "The system prompt to use",
                        "required": False,
                    }
                ],
            }
        ]

        return {"prompts": prompts}
    finally:
        db.close()


@router.post("/{profile_slug}/prompts/get", response_model=GetPromptResult)
async def get_prompt(profile_slug: str, request: Request):
    """Get a specific prompt by name."""
    db = SessionLocal()
    try:
        profile = _resolve_profile(db, profile_slug)
        await _auth_profile(db, request, profile)

        body = await request.json()
        name = body.get("name", "default")
        arguments = body.get("arguments", {})

        if name == "default":
            system_prompt = arguments.get("system_prompt")
            if not system_prompt and profile.system_prompt is not None and str(profile.system_prompt):
                system_prompt = str(profile.system_prompt)
            if not system_prompt:
                # Use built-in default
                system_prompt = (
                    "You are a helpful AI assistant with access to project management tools. "
                    "Use the available tools to help the user manage their project."
                )

            return {
                "name": "default",
                "description": "Default system prompt",
                "messages": [
                    {
                        "role": "system",
                        "content": {"type": "text", "text": system_prompt},
                    }
                ],
            }

        raise HTTPException(status_code=404, detail="Prompt not found")
    finally:
        db.close()
