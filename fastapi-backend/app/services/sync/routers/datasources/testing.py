"""
Connection testing endpoints for datasources.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.services.sync.schemas.datasource import (
    DatasourceUpdate,
    DatasourceTestResult,
    DatasourceTestRequest,
)
from app.services.sync.adapters import get_adapter

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.testing")


def _get_error_suggestion(e: Exception) -> Optional[str]:
    """Helper to provide diagnostic suggestions for common connection errors."""
    msg = str(e).lower()
    if "2003" in msg or "can't connect to mysql server" in msg:
        return "This usually means the MySQL port (typically 3306) is blocked or the host is incorrect. Ensure Remote MySQL access is enabled in your hosting panel and your IP is whitelisted."
    if "getaddrinfo failed" in msg:
        return "The hostname could not be resolved. Ensure you aren't including 'http://' in the host field and check for typos."
    if "access denied" in msg or "password" in msg:
        return "Authentication failed. Verify your username and password are correct for remote access."
    if "timeout" in msg:
        return "The connection timed out. Check your firewall settings and ensure the server is listening on the correct port."
    if "'nonetype' object has no attribute 'group'" in msg or "authentication" in msg:
        return "This is a known issue with asyncpg during the authentication handshake. If using Supabase/Neon, ensure you are using the DIRECT port (5432) instead of the pooled port (6543), as the pooler sometimes interferes with the SASL handshake."
    return None


@router.post("/{datasource_id}/test", response_model=DatasourceTestResult)
async def test_datasource(
    datasource_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Test a datasource connection."""
    logger.info(f"Testing connection for saved datasource: {datasource_id}")
    result = await db.execute(
        select(Datasource).where(Datasource.id == datasource_id)
    )
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Datasource not found"
        )
    
    try:
        adapter = get_adapter(datasource)
        await adapter.connect()
        tables = await adapter.get_tables()
        await adapter.disconnect()
        
        datasource.last_tested_at = datetime.now(timezone.utc)
        datasource.last_test_success = True
        await db.commit()
        
        return DatasourceTestResult(
            success=True,
            message="Connection successful",
            tables=tables
        )
    except Exception as e:
        logger.error(f"Error testing datasource {datasource_id}: {str(e)}", exc_info=True)
        datasource.last_tested_at = datetime.now(timezone.utc)
        datasource.last_test_success = False
        await db.commit()
        
        return DatasourceTestResult(
            success=False,
            message="Connection failed",
            error=str(e),
            suggestion=_get_error_suggestion(e)
        )


@router.post("/test-raw", response_model=DatasourceTestResult)
async def test_new_datasource(data: DatasourceTestRequest):
    """Test a new datasource connection with raw credentials without saving."""
    logger.info(f"Testing raw connection for new datasource: {data.name or 'Unnamed'} (Type: {data.type})")
    try:
        datasource = Datasource(
            name=data.name,
            type=data.type,
            host=data.host,
            port=data.port,
            database=data.database,
            username=data.username,
            password_encrypted=data.password,
            api_url=data.api_url,
            api_key_encrypted=data.api_key,
            table_prefix=data.table_prefix,
            extra_config=str(data.extra_config) if data.extra_config else None,
        )
        
        adapter = get_adapter(datasource)
        await adapter.connect()
        tables = await adapter.get_tables()
        await adapter.disconnect()
        
        return DatasourceTestResult(
            success=True,
            message="Connection successful",
            tables=tables
        )
    except Exception as e:
        logger.error(f"Error testing raw datasource {data.name}: {str(e)}", exc_info=True)
        return DatasourceTestResult(
            success=False,
            message="Connection failed",
            error=str(e),
            suggestion=_get_error_suggestion(e)
        )


@router.post("/{datasource_id}/test-update", response_model=DatasourceTestResult)
async def test_datasource_update(
    datasource_id: str,
    data: DatasourceUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Test a datasource connection with proposed updates merged into existing config."""
    logger.info(f"Testing connection update for datasource: {datasource_id}")
    result = await db.execute(
        select(Datasource).where(Datasource.id == datasource_id)
    )
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Datasource not found"
        )
    
    test_ds = Datasource(
        name=data.name or datasource.name,
        type=datasource.type,
        host=data.host or datasource.host,
        port=data.port or datasource.port,
        database=data.database or datasource.database,
        username=data.username or datasource.username,
        password_encrypted=data.password or datasource.password_encrypted,
        api_url=data.api_url or datasource.api_url,
        api_key_encrypted=data.api_key or datasource.api_key_encrypted,
        table_prefix=data.table_prefix or datasource.table_prefix,
    )
    
    try:
        adapter = get_adapter(test_ds)
        await adapter.connect()
        tables = await adapter.get_tables()
        await adapter.disconnect()
        
        return DatasourceTestResult(
            success=True,
            message="Connection successful (updates validated)",
            tables=tables
        )
    except Exception as e:
        logger.error(f"Error testing update for datasource {datasource_id}: {str(e)}", exc_info=True)
        return DatasourceTestResult(
            success=False,
            message="Connection failed with these settings",
            error=str(e),
            suggestion=_get_error_suggestion(e)
        )
