"""
Agent Router — Streaming chat endpoint for the Master Admin Workspace Agent.

Provides a POST /api/agent/chat endpoint that:
  1. Validates the admin session (cookie-based auth, skipped in test mode)
  2. Accepts a messages array from the frontend chat widget
  3. Streams the response as SSE via PydanticAI

This runs entirely within FastAPI using PydanticAI.
No Edge Engine involvement, no JWT tokens, no Zod.
"""

import logging
from fastapi import APIRouter, Request, HTTPException, Depends
from app.middleware.tenant_context import TenantContext, get_tenant_context
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from ..services.agent_executor import execute_agent_turn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["Agent"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: Optional[str] = None


@router.post("/chat")
async def agent_chat(
    request: Request,
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Streaming chat endpoint for the Master Admin Workspace Agent.

    Accepts:
    { messages: [{ role: 'user', content: '...' }, ...],
      provider_id: '...', model_id: '...' }

    Returns an SSE stream of JSON events:
      data: {"type":"text","content":"chunk"}
      data: {"type":"tool_call","name":"fn","args":{}}
      data: {"type":"done"}
    """
    # In cloud mode, require_tenant_context/get_tenant_context will raise 401 if unauthenticated.
    # In self-host, get_tenant_context returns None, so we verify using get_current_user in production
    from app.config.edition import is_cloud
    if not is_cloud():
        import os
        is_dev = os.getenv("ENVIRONMENT", "development") != "production"
        if not is_dev:
            from ..routers.auth import get_current_user
            user = get_current_user(request)
            if not user:
                raise HTTPException(status_code=401, detail="Authentication required. Please log in.")

    # Parse the request body
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    messages = body.get("messages", [])
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    # Filter to valid message roles
    valid_messages = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role in ("user", "assistant", "system") and content:
            valid_messages.append({"role": role, "content": content})

    if not valid_messages:
        raise HTTPException(status_code=400, detail="No valid messages provided")

    provider_id = body.get("provider_id")
    model_id = body.get("model_id")

    logger.info(f"[Agent] Chat request: {len(valid_messages)} messages | Provider: {provider_id} | Model: {model_id}")

    # Stream the response via PydanticAI
    return StreamingResponse(
        execute_agent_turn(valid_messages, provider_id=provider_id, model_id=model_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("/chat/{profile_slug}")
async def agent_chat_with_profile(profile_slug: str, request: Request):
    """Same as /chat but with a profile slug for forward-compatibility.

    Currently all profiles route to the same workspace agent.
    In the future, different profiles could have different system prompts
    and tool permissions.
    """
    return await agent_chat(request)
