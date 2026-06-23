"""
Audit logging integration for WordPress router.

This module provides helper functions to integrate audit logging
into the WordPress import endpoints with minimal code changes.
"""

from fastapi import Request

from app.middleware.tenant_context import TenantContext
from app.services.wordpress.audit import get_audit_logger, extract_client_info


def log_import_start(
    request: Request,
    ctx: TenantContext | None,
    datasource_id: str,
    import_id: str,
    options: dict,
) -> None:
    """Log import start event."""
    ip_address, user_agent = extract_client_info(request)
    audit_logger = get_audit_logger()
    audit_logger.log_import_started(
        tenant_id=ctx.tenant_id if ctx else None,
        user_id=ctx.user_id if ctx else None,
        datasource_id=datasource_id,
        import_id=import_id,
        options=options,
        ip_address=ip_address,
        user_agent=user_agent,
    )


def log_import_complete(
    request: Request,
    ctx: TenantContext | None,
    datasource_id: str,
    import_id: str,
    result: dict,
    duration_seconds: float,
) -> None:
    """Log import completion event."""
    ip_address, _ = extract_client_info(request)
    audit_logger = get_audit_logger()
    audit_logger.log_import_completed(
        tenant_id=ctx.tenant_id if ctx else None,
        user_id=ctx.user_id if ctx else None,
        datasource_id=datasource_id,
        import_id=import_id,
        result=result,
        duration_seconds=duration_seconds,
        ip_address=ip_address,
    )


def log_import_failure(
    request: Request,
    ctx: TenantContext | None,
    datasource_id: str,
    import_id: str,
    error_message: str,
    details: dict | None = None,
) -> None:
    """Log import failure event."""
    ip_address, _ = extract_client_info(request)
    audit_logger = get_audit_logger()
    audit_logger.log_import_failed(
        tenant_id=ctx.tenant_id if ctx else None,
        user_id=ctx.user_id if ctx else None,
        datasource_id=datasource_id,
        import_id=import_id,
        error_message=error_message,
        details=details,
        ip_address=ip_address,
    )


def log_discovery_access(
    request: Request,
    ctx: TenantContext | None,
    datasource_id: str,
) -> None:
    """Log discovery endpoint access."""
    ip_address, _ = extract_client_info(request)
    audit_logger = get_audit_logger()
    audit_logger.log_discovery_called(
        tenant_id=ctx.tenant_id if ctx else None,
        user_id=ctx.user_id if ctx else None,
        datasource_id=datasource_id,
        ip_address=ip_address,
    )
