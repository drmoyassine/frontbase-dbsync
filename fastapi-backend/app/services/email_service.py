"""
Email Sending Service — Resend & Mailgun.

Two modes:
1. Platform-level: Uses env vars (RESEND_API_KEY or MAILGUN_API_KEY + MAILGUN_DOMAIN)
2. Tenant-level: Uses decrypted Connected Account credentials (api_key, domain, etc.)
"""

import os
import httpx
import logging
from typing import Optional, Union, List
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.middleware.tenant_context import TenantContext

logger = logging.getLogger(__name__)

class EmailSendResult(BaseModel):
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None

def _resolve_platform_config() -> dict:
    """Resolve platform-level transactional email configuration from env vars."""
    resend_api_key = os.getenv("RESEND_API_KEY")
    if resend_api_key:
        return {
            "provider": "resend",
            "api_key": resend_api_key,
        }
    
    mailgun_api_key = os.getenv("MAILGUN_API_KEY")
    mailgun_domain = os.getenv("MAILGUN_DOMAIN")
    if mailgun_api_key and mailgun_domain:
        return {
            "provider": "mailgun",
            "api_key": mailgun_api_key,
            "domain": mailgun_domain,
            "region": os.getenv("MAILGUN_REGION", "us"),
        }
    
    return {}

async def send_email(
    to: Union[str, List[str]],
    subject: str,
    html: str,
    from_email: Optional[str] = None,
    from_name: Optional[str] = None,
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    domain: Optional[str] = None,
    region: Optional[str] = None,
    project_id: Optional[str] = None,
    provider_account_id: Optional[str] = None,
    db: Optional[Session] = None,
    ctx: Optional[TenantContext] = None,
) -> EmailSendResult:
    """Send email.
    
    Auto-detects credentials in order of priority:
    1. Direct credentials passed to this function (api_key, domain, etc.)
    2. Decrypted credentials from provider_account_id (if db session is provided)
    3. Decrypted credentials from the active email provider for project_id (if db session is provided)
    4. Platform-level config from environment variables (RESEND_API_KEY or MAILGUN_API_KEY)
    """
    to_list = [to] if isinstance(to, str) else list(to)
    
    # 1. Direct credentials
    active_provider = provider
    active_api_key = api_key
    active_domain = domain
    active_region = region or "us"
    
    # 2. Fetch via provider_account_id
    if not active_api_key and provider_account_id and db:
        from app.core.security import get_provider_creds
        from app.models.models import EdgeProviderAccount
        from app.middleware.tenant_filter import _scoped_provider_query
        
        # Scope the query using TenantContext to prevent cross-tenant access in cloud mode
        query = _scoped_provider_query(db, ctx) if ctx else db.query(EdgeProviderAccount)
        query = query.filter(EdgeProviderAccount.id == provider_account_id)
        if project_id:
            query = query.filter(EdgeProviderAccount.project_id == project_id)
            
        provider_account = query.first()
        if provider_account:
            active_provider = str(provider_account.provider)
            creds = get_provider_creds(str(provider_account.id), db)
            active_api_key = creds.get("api_key")
            active_domain = creds.get("domain")
            active_region = creds.get("region") or "us"
            
    # 3. Fetch via project_id
    if not active_api_key and project_id and db:
        from app.core.security import get_provider_creds
        from app.models.models import EdgeProviderAccount
        from app.middleware.tenant_filter import _scoped_provider_query
        
        # Scope the query using TenantContext to prevent cross-tenant access in cloud mode
        query = _scoped_provider_query(db, ctx) if ctx else db.query(EdgeProviderAccount)
        provider_account = query.filter(
            EdgeProviderAccount.project_id == project_id,
            EdgeProviderAccount.provider.in_(["resend", "mailgun"]),
            EdgeProviderAccount.is_active == True
        ).first()
        if provider_account:
            active_provider = str(provider_account.provider)
            creds = get_provider_creds(str(provider_account.id), db)
            active_api_key = creds.get("api_key")
            active_domain = creds.get("domain")
            active_region = creds.get("region") or "us"
            
    # 4. Fallback to platform-level configuration
    if not active_api_key:
        platform_config = _resolve_platform_config()
        active_provider = platform_config.get("provider")
        active_api_key = platform_config.get("api_key")
        active_domain = platform_config.get("domain")
        active_region = platform_config.get("region") or "us"
        
    if not active_api_key or not active_provider:
        return EmailSendResult(
            success=False,
            error="No email provider configured. Please configure a platform-level provider or connect an account."
        )
        
    # Resolve from_email and from_name fallbacks
    if not from_email:
        if active_domain and active_provider == "mailgun":
            from_email = f"noreply@{active_domain}"
        else:
            from_email = os.getenv("EMAIL_FROM", "noreply@frontbase.dev")
            
    if not from_name:
        from_name = os.getenv("EMAIL_FROM_NAME", "Frontbase")
        
    if active_provider == "resend":
        return await _send_resend(
            to=to_list,
            subject=subject,
            html=html,
            from_email=from_email,
            from_name=from_name,
            api_key=active_api_key,
        )
    elif active_provider == "mailgun":
        if not active_domain:
            return EmailSendResult(
                success=False,
                error="Mailgun domain is required to send emails."
            )
        return await _send_mailgun(
            to=to_list,
            subject=subject,
            html=html,
            from_email=from_email,
            from_name=from_name,
            api_key=active_api_key,
            domain=active_domain,
            region=active_region,
        )
    else:
        return EmailSendResult(
            success=False,
            error=f"Unsupported email provider: {active_provider}"
        )

async def _send_resend(
    to: List[str],
    subject: str,
    html: str,
    from_email: str,
    from_name: Optional[str],
    api_key: str,
) -> EmailSendResult:
    url = "https://api.resend.com/emails"
    from_header = f"{from_name} <{from_email}>" if from_name else from_email
    payload = {
        "from": from_header,
        "to": to,
        "subject": subject,
        "html": html,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code >= 400:
            return EmailSendResult(
                success=False,
                error=f"Resend error: {resp.status_code} - {resp.text}"
            )
        data = resp.json()
        return EmailSendResult(
            success=True,
            message_id=data.get("id")
        )
    except Exception as e:
        logger.error(f"Failed to send email via Resend: {e}", exc_info=True)
        return EmailSendResult(success=False, error=str(e))

async def _send_mailgun(
    to: List[str],
    subject: str,
    html: str,
    from_email: str,
    from_name: Optional[str],
    api_key: str,
    domain: str,
    region: str = "us",
) -> EmailSendResult:
    base_url = "https://api.eu.mailgun.net" if region == "eu" else "https://api.mailgun.net"
    url = f"{base_url}/v3/{domain}/messages"
    
    from_header = f"{from_name} <{from_email}>" if from_name else from_email
    to_str = ", ".join(to)
    
    data = {
        "from": from_header,
        "to": to_str,
        "subject": subject,
        "html": html,
    }
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                data=data,
                auth=("api", api_key),
            )
        if resp.status_code >= 400:
            return EmailSendResult(
                success=False,
                error=f"Mailgun error: {resp.status_code} - {resp.text}"
            )
        res_json = resp.json()
        return EmailSendResult(
            success=True,
            message_id=res_json.get("id")
        )
    except Exception as e:
        logger.error(f"Failed to send email via Mailgun: {e}", exc_info=True)
        return EmailSendResult(success=False, error=str(e))
