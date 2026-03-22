"""
Table Discovery — List database tables from connected accounts.

Extracted from edge_providers.py router for SRP compliance.
Supports: Supabase (via RPC), Neon (via serverless driver), raw PostgreSQL.
"""

import logging
from typing import Any

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)


async def list_tables_for_provider(provider_type: str, ctx: dict) -> list:
    """List database tables from a connected account's credentials.

    Args:
        provider_type: 'supabase', 'neon', or 'postgres'
        ctx: Credential context dict from get_provider_context_by_id()

    Returns list of table name strings.
    """
    if provider_type == "supabase":
        return await _list_supabase_tables(ctx)
    elif provider_type in ("neon", "postgres"):
        return await _list_postgres_tables(ctx, provider_type)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider_type}' does not support table listing"
        )


async def _list_supabase_tables(ctx: dict) -> list:
    """List tables from Supabase via frontbase_get_schema_info RPC."""
    api_url = ctx.get("api_url", "") or ctx.get("url", "")
    # Prefer service_role_key for full schema access
    api_key = (
        ctx.get("service_role_key", "")
        or ctx.get("auth_key", "")
        or ctx.get("anon_key", "")
    )

    if not api_url or not api_key:
        raise HTTPException(
            status_code=400,
            detail="Supabase account missing api_url or API key. "
                   "Re-connect the account with proper project credentials."
        )

    async with httpx.AsyncClient(
        base_url=api_url,
        headers={
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        timeout=15.0,
    ) as client:
        resp = await client.post("/rest/v1/rpc/frontbase_get_schema_info", json={})
        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Supabase RPC failed ({resp.status_code}). "
                       f"Ensure frontbase_get_schema_info function exists."
            )
        schema_info = resp.json()

    if not schema_info or "tables" not in schema_info:
        return []

    return [
        t["table_name"]
        for t in schema_info["tables"]
        if t.get("table_name")
    ]


async def _list_postgres_tables(ctx: dict, provider_type: str) -> list:
    """List tables from Neon or raw Postgres via information_schema."""
    if provider_type == "neon":
        # Neon: use the Neon SQL API (serverless driver)
        # We need the connection string — try to get it from discovery
        api_key = ctx.get("api_key", "")
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail="Neon account missing api_key"
            )

        # First discover projects to get a connection string
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://console.neon.tech/api/v2/projects",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to list Neon projects")
            projects = resp.json().get("projects", [])

        if not projects:
            return []

        # Use the first project — get connection URI
        project_id = projects[0]["id"]
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://console.neon.tech/api/v2/projects/{project_id}/connection_uri",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"role_name": "neondb_owner", "database_name": "neondb"},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to get Neon connection URI")
            connection_uri = resp.json().get("uri", "")

        if not connection_uri:
            raise HTTPException(status_code=502, detail="Neon returned empty connection URI")

        # Query information_schema via asyncpg
        try:
            import asyncpg  # type: ignore
            conn = await asyncpg.connect(connection_uri, timeout=10)
            try:
                rows = await conn.fetch(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                    "ORDER BY table_name"
                )
                return [row["table_name"] for row in rows]
            finally:
                await conn.close()
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to query Neon database: {str(e)[:200]}"
            )

    # Raw postgres — use stored connection details
    host = ctx.get("host", "")
    database = ctx.get("database", "")
    username = ctx.get("username", "")
    password = ctx.get("password", "")
    port = int(ctx.get("port", 5432) or 5432)

    if not host or not database or not username:
        raise HTTPException(
            status_code=400,
            detail="PostgreSQL account missing host/database/username"
        )

    try:
        import asyncpg  # type: ignore
        conn = await asyncpg.connect(
            host=host, port=port, database=database,
            user=username, password=password, timeout=10,
        )
        try:
            rows = await conn.fetch(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "ORDER BY table_name"
            )
            return [row["table_name"] for row in rows]
        finally:
            await conn.close()
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to query PostgreSQL: {str(e)[:200]}"
        )
