"""
Agent Executor — PydanticAI-powered Workspace Agent.

Replaces the hand-rolled OpenAI loop with PydanticAI for:
  - Multi-provider support (OpenAI, Anthropic, Google, Ollama)
  - Native tool-calling agent loop
  - Clean streaming via run_stream()

Streams plain SSE events to the frontend:
  data: {"type":"text","content":"..."}
  data: {"type":"tool_call","name":"...","args":{}}
  data: {"type":"tool_result","name":"...","result":"..."}
  data: {"type":"done"}
"""

import json
import logging
from typing import AsyncGenerator, Any

from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .agent_tools import register_workspace_tools
from ..core.security import get_provider_creds
from ..models.models import EdgeProviderAccount
from ..database.config import SessionLocal

# pydantic_ai is an OPTIONAL dependency (the Master Admin Workspace Agent). It is imported
# lazily inside _build_model / execute_agent_turn so the app — and the test suite — import and
# run without it. The agent endpoints degrade gracefully (error event) when it is absent.

logger = logging.getLogger(__name__)


# Default system prompt for the Master Admin Workspace Agent
WORKSPACE_SYSTEM_PROMPT = """You are the Master Admin's Workspace Agent for Frontbase — an open-source, edge-native platform for deploying AI-powered apps.

You have full, unrestricted access to the Frontbase project. You can:
- List and inspect all pages, their component trees, and SEO metadata
- Update component properties (text, styles, bindings)
- View Edge Engine deployment status and provider accounts

When the user asks you to modify a page, always:
1. First use pages_get to inspect the current structure
2. Identify the correct component ID
3. Use pages_update_component or pages_update_text to make changes
4. Confirm what you changed

Be concise but helpful. You are an expert Frontbase developer."""


def _resolve_llm_credentials(
    db: Session,
    target_provider_id: str | None = None,
    target_model_id: str | None = None,
) -> tuple[str, str, str]:
    """Resolve the LLM API key, model, and provider type from the active provider account.

    Returns (api_key, model_id, provider_type).
    """
    target = None

    if target_provider_id:
        target = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == target_provider_id
        ).first()
        if not target or not bool(target.is_active):
            raise ValueError("The selected LLM provider is either inactive or doesn't exist.")
    else:
        providers = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.is_active == True  # noqa: E711
        ).all()

        default_provider = None
        fallback_provider = None

        for p in providers:
            if str(p.provider) in ("openai", "anthropic", "google", "ollama", "workers_ai"):
                fallback_provider = p
                if p.provider_metadata is not None:
                    try:
                        meta = json.loads(str(p.provider_metadata))
                        if meta.get("is_workspace_default"):
                            default_provider = p
                            break
                    except Exception:
                        pass

        target = default_provider or fallback_provider

    if not target:
        raise ValueError("No active LLM provider configured. Add an OpenAI or Anthropic provider in Edge Providers.")

    creds = get_provider_creds(str(target.id), db)
    api_key = creds.get("api_key") or creds.get("apiKey") or ""

    if not api_key:
        raise ValueError(f"Provider '{target.name}' has no API key configured.")

    provider_type = str(target.provider)

    # Determine model
    if target_model_id and target_model_id.lower() != "default":
        model_id = target_model_id
    else:
        model_defaults: dict[str, str] = {
            "anthropic": "claude-sonnet-4-20250514",
            "google": "gemini-2.5-flash",
            "workers_ai": "@cf/meta/llama-3.1-8b-instruct",
        }
        model_id = model_defaults.get(provider_type, "gpt-4o")

    return api_key, model_id, provider_type


def _build_model(api_key: str, model_id: str, provider_type: str) -> Any:
    """Build a PydanticAI model object for the given provider."""
    from pydantic_ai.models.openai import OpenAIModel
    from pydantic_ai.models.anthropic import AnthropicModel
    from pydantic_ai.models.google import GoogleModel
    from pydantic_ai.providers.openai import OpenAIProvider
    from pydantic_ai.providers.anthropic import AnthropicProvider
    from pydantic_ai.providers.google import GoogleProvider

    if provider_type == "anthropic":
        return AnthropicModel(
            model_id,
            provider=AnthropicProvider(api_key=api_key),
        )
    elif provider_type == "google":
        return GoogleModel(
            model_id,
            provider=GoogleProvider(api_key=api_key),
        )
    elif provider_type == "ollama":
        # Ollama exposes an OpenAI-compatible API
        return OpenAIModel(
            model_id,
            provider=OpenAIProvider(
                api_key="ollama",
                base_url="http://localhost:11434/v1",
            ),
        )
    else:
        # Default: OpenAI (also handles workers_ai via compatible API)
        return OpenAIModel(
            model_id,
            provider=OpenAIProvider(api_key=api_key),
        )


def _sse_event(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


def _serialize_tool_args(part: Any) -> Any:
    """Best-effort serialization of a ToolCallPart's args for the SSE ``tool_call`` event."""
    try:
        args_as_dict = getattr(part, "args_as_dict", None)
        if callable(args_as_dict):
            return args_as_dict()
    except Exception:
        pass
    args = getattr(part, "args", None)
    if isinstance(args, (dict, list, str)):
        return args
    return None


def _serialize_tool_result(part: Any) -> str:
    """Best-effort string serialization of a tool result part (ToolReturnPart / RetryPromptPart)."""
    serialized = getattr(part, "serialized", None)
    if isinstance(serialized, str) and serialized:
        return serialized
    content = getattr(part, "content", None)
    if isinstance(content, str):
        return content
    try:
        return json.dumps(content, default=str)
    except Exception:
        return str(content)


async def execute_agent_turn(
    messages: list[dict],
    system_prompt: str | None = None,
    provider_id: str | None = None,
    model_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Execute a complete agent turn with PydanticAI.

    Yields SSE-formatted events for the frontend:
      data: {"type":"text","content":"chunk"}
      data: {"type":"tool_call","name":"fn","args":{}}
      data: {"type":"tool_result","name":"fn","result":"..."}
      data: {"type":"done"}
    """
    # Resolve credentials from the database
    def _get_creds() -> tuple[str, str, str]:
        db = SessionLocal()
        try:
            return _resolve_llm_credentials(db, target_provider_id=provider_id, target_model_id=model_id)
        finally:
            db.close()

    try:
        api_key, resolved_model_id, provider_type = await run_in_threadpool(_get_creds)
    except ValueError as e:
        yield _sse_event({"type": "text", "content": str(e)})
        yield _sse_event({"type": "done"})
        return

    # Build PydanticAI model
    try:
        model = _build_model(api_key, resolved_model_id, provider_type)
    except Exception as e:
        logger.error(f"[Agent] Failed to build model: {e}")
        yield _sse_event({"type": "text", "content": f"Failed to initialize model: {e}"})
        yield _sse_event({"type": "done"})
        return

    # Create agent with tools
    from pydantic_ai import Agent

    agent = Agent(
        model,
        system_prompt=system_prompt or WORKSPACE_SYSTEM_PROMPT,
    )

    # Register workspace tools
    register_workspace_tools(agent)

    # Convert message history: extract user prompt and history
    # PydanticAI expects the prompt as a separate arg, with message_history for context
    # The last user message is the prompt, everything before is history
    from pydantic_ai.messages import (
        ModelMessage,
        ModelRequest,
        ModelResponse,
        UserPromptPart,
        TextPart,
    )

    prompt = ""
    history: list[ModelMessage] = []

    if messages:
        # Last user message is the prompt
        prompt = messages[-1].get("content", "")

        # Build history from all prior messages
        for msg in messages[:-1]:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role == "user":
                history.append(ModelRequest(parts=[UserPromptPart(content=content)]))
            elif role == "assistant":
                history.append(ModelResponse(parts=[TextPart(content=content)]))

    if not prompt:
        yield _sse_event({"type": "text", "content": "No prompt provided."})
        yield _sse_event({"type": "done"})
        return

    logger.info(f"[Agent] Streaming turn with {provider_type}/{resolved_model_id} | {len(history)} history msgs")

    # Iterate the agent graph node-by-node so we can BOTH stream text deltas AND
    # surface tool calls/results as discrete SSE events (the contract the frontend
    # expects: text | tool_call | tool_result | done). The higher-level
    # run_stream()/stream_text() abstracts tool activity away, which would leave the
    # chat UI blind to tool steps — so we drop to the node stream instead.
    try:
        async with agent.iter(
            prompt,
            message_history=history if history else None,
        ) as agent_run:
            async for node in agent_run:
                if Agent.is_model_request_node(node):
                    async with node.stream(agent_run.ctx) as stream:
                        async for delta in stream.stream_text(delta=True):
                            if delta:
                                yield _sse_event({"type": "text", "content": delta})
                elif Agent.is_call_tools_node(node):
                    async with node.stream(agent_run.ctx) as tool_events:
                        async for event in tool_events:
                            kind = getattr(event, "event_kind", "")
                            if kind == "function_tool_call":
                                yield _sse_event({
                                    "type": "tool_call",
                                    "name": getattr(event.part, "tool_name", "tool"),
                                    "args": _serialize_tool_args(event.part),
                                })
                            elif kind == "function_tool_result":
                                yield _sse_event({
                                    "type": "tool_result",
                                    "name": getattr(event.part, "tool_name", "tool"),
                                    "result": _serialize_tool_result(event.part),
                                })
    except Exception as e:
        logger.error(f"[Agent] Stream error: {e}")
        yield _sse_event({"type": "text", "content": f"Agent error: {str(e)}"})

    yield _sse_event({"type": "done"})
