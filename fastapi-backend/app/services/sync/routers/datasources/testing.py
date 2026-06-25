"""
Connection testing endpoints for datasources.
"""

import json
import logging
from datetime import datetime
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
from app.services.sync.routers.datasources.dependencies import get_scoped_datasource

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


@router.post("/{datasource_id}/test/", response_model=DatasourceTestResult)
async def test_datasource(
    datasource: Datasource = Depends(get_scoped_datasource),
    db: AsyncSession = Depends(get_db)
):
    """Test a datasource connection."""
    logger.info(f"Testing connection for saved datasource: {datasource.id}")
    try:
        adapter = get_adapter(datasource, db)
        await adapter.connect()
        tables = await adapter.get_tables()
        await adapter.disconnect()
        
        datasource.last_tested_at = datetime.utcnow()  # naive UTC — column is TIMESTAMP WITHOUT TIME ZONE (asyncpg rejects aware datetimes: BACKEND-F)
        datasource.last_test_success = True
        await db.commit()
        
        return DatasourceTestResult(
            success=True,
            message="Connection successful",
            tables=tables
        )
    except Exception as e:
        logger.error(f"Error testing datasource {datasource.id}: {str(e)}", exc_info=True)
        datasource.last_tested_at = datetime.utcnow()  # naive UTC — column is TIMESTAMP WITHOUT TIME ZONE (asyncpg rejects aware datetimes: BACKEND-F)
        datasource.last_test_success = False
        await db.commit()
        
        return DatasourceTestResult(
            success=False,
            message="Connection failed",
            error=str(e),
            suggestion=_get_error_suggestion(e)
        )


@router.post("/test-raw/", response_model=DatasourceTestResult)
async def test_new_datasource(data: DatasourceTestRequest, db: AsyncSession = Depends(get_db)):
    """Test a new datasource connection with raw credentials without saving."""
    logger.info(f"Testing raw connection for new datasource: {data.name or 'Unnamed'} (Type: {data.type})")
    try:
        api_url = data.api_url
        api_key = data.api_key

        # For Supabase without explicit keys: resolve from Connected Account
        if data.type.value == "supabase" and not api_key:
            logger.info(f"[SUPABASE-RESOLVE] No api_key in request, resolving from Connected Account...")
            try:
                from app.database.config import SessionLocal
                from app.core.credential_resolver import get_supabase_context
                sync_db = SessionLocal()
                try:
                    ctx = get_supabase_context(sync_db, mode="builder")
                    logger.info(f"[SUPABASE-RESOLVE] ctx source={ctx.get('source')}, url={bool(ctx.get('url'))}, auth_key={bool(ctx.get('auth_key'))}")
                    api_url = api_url or ctx.get("url", "")
                    api_key = ctx.get("auth_key", "")
                finally:
                    sync_db.close()
            except Exception as e:
                logger.warning(f"Could not resolve Supabase credentials from Connected Account: {e}")

        datasource = Datasource(
            name=data.name,
            type=data.type,
            host=data.host,
            port=data.port,
            database=data.database,
            username=data.username,
            password_encrypted=data.password,
            api_url=api_url,
            api_key_encrypted=api_key,
            table_prefix=data.table_prefix,
            extra_config=json.dumps(data.extra_config) if data.extra_config else None,
        )
        # Bind the Connected Account so WordPress/Sheets adapters resolve creds from it
        # (column-existence guard: older DBs may not have the column yet).
        if data.provider_account_id:
            try:
                datasource.provider_account_id = data.provider_account_id
            except Exception:
                pass

        # If direct DB URI provided, set it
        if data.connection_uri:
            setattr(datasource, 'connection_uri', data.connection_uri)  # Dynamic attr for test-raw only

        adapter = get_adapter(datasource, db)
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


@router.post("/{datasource_id}/test-update/", response_model=DatasourceTestResult)
async def test_datasource_update(
    data: DatasourceUpdate = None,  # Make body optional to handle regression cases
    datasource: Datasource = Depends(get_scoped_datasource),
    db: AsyncSession = Depends(get_db)
):
    """Test a datasource connection with proposed updates merged into existing config."""
    logger.info(f"Testing connection update for datasource: {datasource.id}")

    # Handle missing body (regression fix: treat as no-op test of existing config)
    if data is None:
        data = DatasourceUpdate()

    # Merge extra_config: use new data if provided, otherwise preserve existing
    existing_extra = datasource.extra_config
    if data.extra_config is not None:
        # New extra_config provided (dict from Pydantic) — serialize to JSON
        merged_extra = json.dumps(data.extra_config) if data.extra_config else None
    else:
        # No new extra_config — preserve existing
        merged_extra = existing_extra

    # Merge provider_account_id similarly
    merged_provider_account_id = data.provider_account_id if data.provider_account_id is not None else datasource.provider_account_id

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
        extra_config=merged_extra,
        provider_account_id=merged_provider_account_id,
    )
    
    try:
        adapter = get_adapter(test_ds, db)
        await adapter.connect()
        tables = await adapter.get_tables()
        await adapter.disconnect()

        logger.info(f"[test-update] Got {len(tables)} tables for datasource {datasource.id}: {tables}")

        return DatasourceTestResult(
            success=True,
            message="Connection successful (updates validated)",
            tables=tables
        )
    except Exception as e:
        logger.error(f"Error testing update for datasource {datasource.id}: {str(e)}", exc_info=True)
        return DatasourceTestResult(
            success=False,
            message="Connection failed with these settings",
            error=str(e),
            suggestion=_get_error_suggestion(e)
        )
