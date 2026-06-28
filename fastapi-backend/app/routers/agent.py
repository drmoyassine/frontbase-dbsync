"""
Agent Router — Streaming chat endpoint for the Workspace Agent.

Provides a POST /api/agent/chat endpoint that:
  1. Validates the session (cookie/JWT, skipped in test mode)
  2. Accepts a messages array + ``use_type`` ('workspace' | 'support')
  3. Streams the response as SSE via PydanticAI
  4. Enforces the per-tenant credit quota (cloud mode, workspace turns) and
     streams ``quota_exceeded`` / ``credit_balance_updated`` events

This runs entirely within FastAPI using PydanticAI.
Edge Agents are NOT routed here — they run on the tenant's own providers.
"""

import json
import logging
import time
from typing import Any, Optional

from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import StreamingResponse

from app.config.edition import is_cloud
from app.database.config import SessionLocal
from app.middleware.tenant_context import TenantContext, get_tenant_context

from ..services.agent_executor import execute_agent_turn
from ..services import agent_quota

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["Agent"])

VALID_USE_TYPES = ("workspace", "support")


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


def _maybe_parse_sse(chunk: str) -> Optional[dict]:
    """Parse an SSE ``data: {...}`` chunk back to a dict (for metric counting)."""
    s = chunk.strip()
    if s.startswith("data: "):
        try:
            return json.loads(s[6:])
        except (json.JSONDecodeError, ValueError):
            return None
    return None


def _quota_event_payload(check: dict, *, blocked: bool, action: str) -> dict:
    """Build a ``quota_exceeded`` event payload from a quota check result."""
    return {
        "type": "quota_exceeded",
        "blocked": blocked,
        "action": action,
        "pool": check.get("pool"),
        "reason": check.get("reason") or "Workspace Agent credits exhausted",
        "daily_remaining": check.get("daily_remaining"),
        "monthly_remaining": check.get("monthly_remaining"),
        "daily_limit": check.get("daily_limit"),
        "monthly_limit": check.get("monthly_limit"),
        "daily_resets_at": check.get("daily_resets_at"),
        "monthly_resets_at": check.get("monthly_resets_at"),
    }


async def _agent_chat_impl(request: Request, ctx: Optional[TenantContext], profile_slug: str):
    """Shared implementation for /chat and /chat/{profile_slug}."""
    # In cloud mode the session dependency already enforced auth (401 if missing).
    # In self-host, get_tenant_context returns None, so verify via get_current_user.
    if not is_cloud():
        from ..routers.auth import get_current_user
        user = get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required. Please log in.")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    messages = body.get("messages", [])
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    valid_messages = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role in ("user", "assistant", "system") and content:
            valid_messages.append({"role": role, "content": content})
    if not valid_messages:
        raise HTTPException(status_code=400, detail="No valid messages provided")

    use_type = body.get("use_type", "workspace")
    if use_type not in VALID_USE_TYPES:
        use_type = "workspace"

    cloud = is_cloud()
    # Tenant-side quota applies only in cloud, for a real tenant, not master admin.
    track = bool(cloud and ctx is not None and not getattr(ctx, "is_master", False) and getattr(ctx, "tenant_id", None))

    # Provider selection:
    #  - cloud mode: tenants use the master-admin-configured SHARED provider
    #    (provider_id is ignored; the executor resolves the flagged default).
    #  - self-host: honor the caller-supplied provider_id.
    effective_provider_id = None if cloud else body.get("provider_id")
    model_id = body.get("model_id")

    logger.info(
        f"[Agent] Chat request ({use_type}) | {len(valid_messages)} msgs | "
        f"provider={effective_provider_id or 'shared'} | model={model_id} | track={track}"
    )

    # --- Disabled / quota gate (workspace turns only) ----------------------
    quota_warning: Optional[dict] = None
    if track and use_type == "workspace":
        db = SessionLocal()
        try:
            cfg = agent_quota.get_agent_global_config(db)
            if not cfg.get("enabled", True):
                async def _disabled_stream():
                    yield _sse({"type": "text", "content": "The Workspace Agent is currently disabled by the administrator."})
                    yield _sse({"type": "done"})
                return StreamingResponse(_disabled_stream(), media_type="text/event-stream", headers=_stream_headers())

            check = agent_quota.check_credit_available(db, ctx.tenant_id, use_type)
            if not check["allowed"]:
                action = agent_quota.get_quota_exceeded_action(db, ctx.tenant_id)
                if action == "warn":
                    # Allow the turn (overage) but surface a warning event first.
                    quota_warning = check
                else:
                    async def _quota_stream():
                        yield _sse(_quota_event_payload(check, blocked=True, action="block"))
                        yield _sse({"type": "done"})
                    return StreamingResponse(_quota_stream(), media_type="text/event-stream", headers=_stream_headers())
        finally:
            db.close()

    # --- Tracked execution stream ------------------------------------------
    tenant_id = ctx.tenant_id if ctx else None
    user_id = ctx.user_id if ctx else None
    is_master = bool(ctx and getattr(ctx, "is_master", False))

    # Resolve the active project so every tool is scoped to it (two-level isolation).
    # Master admin / self-host (no tenant) → project_id None → agent sees the single project.
    project_id = None
    if ctx is not None and tenant_id:
        from ..database.utils import get_project
        db_proj = SessionLocal()
        try:
            project = get_project(db_proj, ctx)
            project_id = str(project.id) if project else None
        finally:
            db_proj.close()

    async def tracked_stream():
        metrics: dict[str, Any] = {"tokens_input": 0, "tokens_output": 0, "tool_calls": 0, "duration_ms": 0}
        start = time.monotonic()
        text_chars = 0
        completed = False
        error_msg: Optional[str] = None

        if quota_warning:
            yield _sse(_quota_event_payload(quota_warning, blocked=False, action="warn"))

        try:
            async for chunk in execute_agent_turn(
                valid_messages,
                provider_id=effective_provider_id,
                model_id=model_id,
                use_type=use_type,
                app=request.app,
                tenant_id=tenant_id,
                project_id=project_id,
                user_id=user_id,
                is_master=is_master,
                profile_slug=profile_slug,
            ):
                parsed = _maybe_parse_sse(chunk)
                if parsed:
                    ptype = parsed.get("type")
                    if ptype == "text" and parsed.get("content"):
                        text_chars += len(str(parsed["content"]))
                    elif ptype == "tool_call":
                        metrics["tool_calls"] += 1
                    elif ptype == "done":
                        completed = True
                        continue  # suppress; we emit a final done after the balance update
                yield chunk
        except Exception as e:  # pragma: no cover - executor guards its own errors
            logger.exception("[Agent] Tracked stream error")
            error_msg = str(e)
            yield _sse({"type": "text", "content": f"Agent error: {e}"})

        metrics["duration_ms"] = int((time.monotonic() - start) * 1000)
        metrics["tokens_output"] = max(1, text_chars // 4)

        # Consume + emit balance update (cloud tenant turns only).
        if track and tenant_id and user_id:
            status = "success" if completed and error_msg is None else "error"
            db2 = SessionLocal()
            try:
                agent_quota.consume_credit(
                    db2, tenant_id, user_id, use_type,
                    provider_id=effective_provider_id,
                    model_id=model_id,
                    agent_profile=profile_slug,
                    metrics=metrics,
                    status=status,
                    error_message=error_msg,
                )
                bal = agent_quota.get_credit_balance(db2, tenant_id)
            except Exception:
                logger.exception("[Agent] credit consume/log failed")
                # Surface the error to the user so they know the turn may not have been tracked correctly
                yield _sse({"type": "text", "content": "\n\n⚠️ Credit tracking failed — your turn was not deducted from your quota. Please contact support if this persists."})
                bal = None
            finally:
                db2.close()
            if bal:
                yield _sse({
                    "type": "credit_balance_updated",
                    "daily_remaining": bal["daily_remaining"],
                    "monthly_remaining": bal["monthly_remaining"],
                    "daily_limit": bal["daily_limit"],
                    "monthly_limit": bal["monthly_limit"],
                    "daily_resets_at": bal["daily_resets_at"],
                    "monthly_resets_at": bal["monthly_resets_at"],
                })

        yield _sse({"type": "done"})

    return StreamingResponse(tracked_stream(), media_type="text/event-stream", headers=_stream_headers())


def _stream_headers() -> dict[str, str]:
    return {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # disable nginx buffering
    }


@router.post("/chat")
async def agent_chat(
    request: Request,
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Streaming chat endpoint for the Workspace Agent."""
    return await _agent_chat_impl(request, ctx, "workspace-agent")


@router.post("/chat/{profile_slug}")
async def agent_chat_with_profile(
    profile_slug: str,
    request: Request,
    ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Same as /chat but with a profile slug (forwards to the shared impl)."""
    return await _agent_chat_impl(request, ctx, profile_slug or "workspace-agent")


@router.get("/credits")
async def agent_credits(ctx: TenantContext | None = Depends(get_tenant_context)):
    """Current Workspace Agent credit balance for the caller.

    Returns ``unlimited: true`` for self-host / master admin (no quota). In cloud
    tenant mode returns the live daily + monthly remaining counts and reset times.
    """
    if not is_cloud() or ctx is None or getattr(ctx, "is_master", False) or not getattr(ctx, "tenant_id", None):
        return {"enabled": True, "unlimited": True}
    db = SessionLocal()
    try:
        cfg = agent_quota.get_agent_global_config(db)
        bal = agent_quota.get_credit_balance(db, ctx.tenant_id)
        action = agent_quota.get_quota_exceeded_action(db, ctx.tenant_id)
        return {
            "enabled": bool(cfg.get("enabled", True)),
            "unlimited": False,
            "quota_exceeded_action": action,
            **bal,
        }
    finally:
        db.close()
