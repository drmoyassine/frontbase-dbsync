"""
Workflow Automation Email Endpoint.

Called by the Edge Engine's email node (Automations A3) to send transactional
email from within a workflow run. Credentials are resolved by
``app.services.email_service.send_email`` in priority order:

  1. explicit ``provider_account_id`` / ``project_id`` (tenant connected account)
  2. the tenant's active email provider for the project
  3. platform-level env vars (``RESEND_API_KEY`` / ``MAILGUN_*``)

All endpoints are tenant-gated (``require_tenant_context``).

Routes (mounted under /api/workflows in main.py):
  POST /api/workflows/send-email   send an email on behalf of a workflow run
"""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.database.config import get_db
from app.middleware.tenant_context import TenantContext, require_tenant_context
from app.services.email_service import send_email

logger = logging.getLogger(__name__)
router = APIRouter()


class WorkflowEmailRequest(BaseModel):
    to: List[str]
    subject: str
    html: str
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    reply_to: Optional[str] = None


@router.post("/send-email")
async def send_workflow_email(
    request: WorkflowEmailRequest,
    provider_account_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    db=Depends(get_db),
    ctx: TenantContext = Depends(require_tenant_context),
):
    """Send an email on behalf of a workflow automation run."""
    if not request.to:
        raise HTTPException(status_code=400, detail="At least one recipient is required")
    if not request.subject:
        raise HTTPException(status_code=400, detail="Subject is required")

    try:
        result = await send_email(
            to=request.to,
            subject=request.subject,
            html=request.html,
            from_email=request.from_email,
            from_name=request.from_name,
            provider_account_id=provider_account_id,
            project_id=project_id,
            db=db,
            ctx=ctx,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("send_workflow_email failed")
        raise HTTPException(status_code=502, detail=f"Email provider error: {exc}") from exc

    if not result.success:
        # Surface provider errors as 502 so the workflow node records the failure.
        raise HTTPException(status_code=502, detail=result.error or "Email send failed")

    return {
        "success": True,
        "message_id": result.message_id,
    }
