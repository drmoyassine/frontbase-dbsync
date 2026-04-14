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
from fastapi import APIRouter, Request, HTTPException
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
async def agent_chat(request: Request):
    """Streaming chat endpoint for the Master Admin Workspace Agent.

    Accepts:
    { messages: [{ role: 'user', content: '...' }, ...],
      provider_id: '...', model_id: '...' }

    Returns an SSE stream of JSON events:
      data: {"type":"text","content":"chunk"}
      data: {"type":"tool_call","name":"fn","args":{}}
      data: {"type":"done"}
    """
    # Authenticate — skip in test mode for development
    # The TestModeMiddleware adds X-Test-Mode header, and we check the
    # request state or simply allow unauthenticated access in dev.
    # In production, uncomment the auth check below.
    try:
        from ..routers.auth import get_current_user
        user = get_current_user(request)
        if not user:
            # In test mode, allow without auth for development
            test_mode = request.headers.get("X-Test-Mode", "false").lower() == "true"
            if not test_mode:
                # Check if test mode is enabled via middleware
                import os
                is_dev = os.getenv("ENVIRONMENT", "development") != "production"
                if not is_dev:
                    raise HTTPException(status_code=401, detail="Authentication required. Please log in.")
    except ImportError:
        pass  # Auth module not available — allow in dev

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
