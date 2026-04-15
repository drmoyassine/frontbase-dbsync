"""
Supabase State DB Lifecycle — Schema, Role, and JWT management via Management API.

Extracted from provider_discovery.py for SRP compliance.
Handles all Supabase-specific PostgreSQL lifecycle operations:
  - Schema creation (CREATE SCHEMA, tables, RLS)
  - Role management (CREATE ROLE, GRANT, REVOKE)
  - JWT minting for scoped PostgREST access
  - Schema discovery and cleanup
  - PostgREST config patching

Also includes generic PG schema discovery/creation (asyncpg-based).
"""

import re
import logging
import httpx

logger = logging.getLogger(__name__)


# =============================================================================
# Generic PG Schema Helpers (asyncpg)
# =============================================================================

async def discover_pg_schemas(db_url: str) -> dict:
    """Discover existing frontbase_edge* schemas in a PostgreSQL database.

    Used as a second-level discovery: after the user picks a Neon/Supabase
    project, this lists the PG schemas used for state isolation.
    """
    import asyncpg

    if not db_url:
        return {"success": False, "detail": "No database URL provided"}

    try:
        conn = await asyncpg.connect(db_url, timeout=10)
        try:
            rows = await conn.fetch(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name LIKE 'frontbase_edge%' ORDER BY schema_name"
            )
            schemas = [
                {"id": row["schema_name"], "name": row["schema_name"], "type": "pg_schema"}
                for row in rows
            ]
            return {"success": True, "schemas": schemas}
        finally:
            await conn.close()
    except Exception as e:
        return {"success": False, "detail": f"Schema discovery failed: {str(e)}"}


async def create_pg_schema(db_url: str, suffix: str) -> dict:
    """Create a new frontbase_edge_<suffix> schema in a PostgreSQL database.

    Returns the full schema name on success.
    Suffix is validated: alphanumeric + underscores only.
    """
    import asyncpg

    if not db_url:
        return {"success": False, "detail": "No database URL provided"}
    if not suffix:
        return {"success": False, "detail": "Suffix is required"}

    # Validate suffix format
    if not re.match(r'^[a-z0-9_]+$', suffix):
        return {"success": False, "detail": "Suffix must be lowercase alphanumeric + underscores only"}

    schema_name = f"frontbase_edge_{suffix}"

    try:
        conn = await asyncpg.connect(db_url, timeout=10)
        try:
            # Use quoted identifier to safely create the schema
            await conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"')
            return {"success": True, "schema_name": schema_name}
        finally:
            await conn.close()
    except Exception as e:
        return {"success": False, "detail": f"Schema creation failed: {str(e)}"}


# =============================================================================
# Supabase Management API SQL Helper
# =============================================================================

async def _supabase_run_sql(token: str, project_ref: str, query: str) -> dict:
    """Run a SQL query via the Supabase Management API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"query": query},
        )
        if resp.status_code in (200, 201):
            return {"success": True, "data": resp.json()}
        return {"success": False, "detail": f"Supabase SQL API {resp.status_code}: {resp.text}"}


# =============================================================================
# Supabase Schema Discovery & Creation (via Management API)
# =============================================================================

async def discover_pg_schemas_supabase(token: str, project_ref: str) -> dict:
    """Discover existing frontbase_edge* schemas via Supabase Management API.

    Also checks whether the matching scoped role exists for each schema.
    """
    result = await _supabase_run_sql(
        token, project_ref,
        "SELECT s.schema_name, "
        "  EXISTS(SELECT 1 FROM pg_roles WHERE rolname = s.schema_name || '_role') AS has_role "
        "FROM information_schema.schemata s "
        "WHERE s.schema_name LIKE 'frontbase_edge%' ORDER BY s.schema_name"
    )
    if not result["success"]:
        return result
    rows = result.get("data", [])
    schemas = [
        {
            "id": row["schema_name"],
            "name": row["schema_name"],
            "type": "pg_schema",
            "has_role": row.get("has_role", False),
        }
        for row in rows
        if isinstance(row, dict)
    ]
    return {"success": True, "schemas": schemas}


async def create_pg_schema_supabase(token: str, project_ref: str, suffix: str) -> dict:
    """Create a new frontbase_edge_<suffix> schema + scoped role via Supabase Management API.

    Returns {success, schema_name, role_name, role_password}.
    """
    import secrets as _secrets

    if not suffix:
        return {"success": False, "detail": "Suffix is required"}
    if not re.match(r'^[a-z0-9_]+$', suffix):
        return {"success": False, "detail": "Suffix must be lowercase alphanumeric + underscores only"}

    schema_name = f"frontbase_edge_{suffix}"
    role_name = f"frontbase_edge_{suffix}_role"
    role_password = _secrets.token_urlsafe(32)

    sql = (
        f'CREATE SCHEMA IF NOT EXISTS "{schema_name}";\n'
        f"DO $$ BEGIN\n"
        f"  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role_name}') THEN\n"
        f"    CREATE ROLE {role_name} LOGIN PASSWORD '{role_password}';\n"
        f"  ELSE\n"
        f"    ALTER ROLE {role_name} PASSWORD '{role_password}';\n"
        f"  END IF;\n"
        f"END $$;\n"
        f'GRANT USAGE ON SCHEMA "{schema_name}" TO {role_name};\n'
        f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "{schema_name}" TO {role_name};\n'
        f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{schema_name}" GRANT ALL ON TABLES TO {role_name};'
    )
    result = await _supabase_run_sql(token, project_ref, sql)
    if not result["success"]:
        return result
    return {
        "success": True,
        "schema_name": schema_name,
        "role_name": role_name,
        "role_password": role_password,
    }


# =============================================================================
# State DB Initialization (Full Schema + Tables + RLS + PostgREST)
# =============================================================================

async def init_supabase_state_db(
    token: str,
    project_ref: str,
    schema_name: str = "frontbase_edge",
) -> dict:
    """Initialize the full state DB (schema + tables + role + RLS) via Management API.

    Creates:
      - PG schema with all state tables
      - A NOLOGIN role ({schema_name}_role) for PostgREST scoped JWT access
      - PostgREST grants (anon gets SELECT on pages, edge role gets ALL)
      - RLS policies on all tables

    Called at provisioning time. The edge engine uses PostgREST (HTTP), not PG wire.
    """
    s = schema_name  # shorter alias

    migrations = [
        f'CREATE SCHEMA IF NOT EXISTS "{s}"',

        f'''CREATE TABLE IF NOT EXISTS "{s}".published_pages (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            title TEXT,
            description TEXT,
            layout_data TEXT NOT NULL,
            seo_data TEXT,
            datasources TEXT,
            css_bundle TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            published_at TEXT NOT NULL,
            is_public BOOLEAN NOT NULL DEFAULT TRUE,
            is_homepage BOOLEAN NOT NULL DEFAULT FALSE,
            content_hash TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )''',

        f'''CREATE TABLE IF NOT EXISTS "{s}".project_settings (
            id TEXT PRIMARY KEY DEFAULT 'default',
            favicon_url TEXT,
            logo_url TEXT,
            site_name TEXT,
            site_description TEXT,
            app_url TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )''',

        f'''CREATE TABLE IF NOT EXISTS "{s}".workflows (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            trigger_type TEXT NOT NULL,
            trigger_config TEXT,
            nodes TEXT NOT NULL,
            edges TEXT NOT NULL,
            settings TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            published_by TEXT
        )''',

        f'''CREATE TABLE IF NOT EXISTS "{s}".executions (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            status TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            trigger_payload TEXT,
            node_executions TEXT,
            result TEXT,
            error TEXT,
            usage REAL DEFAULT 0,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ended_at TIMESTAMPTZ
        )''',

        f'''CREATE TABLE IF NOT EXISTS "{s}".edge_logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            source TEXT DEFAULT 'runtime',
            metadata TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )''',

        f'''CREATE TABLE IF NOT EXISTS "{s}".dead_letters (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            execution_id TEXT NOT NULL,
            error TEXT,
            payload TEXT,
            retry_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )''',
    ]

    # PostgREST grants: expose schema + create edge role for scoped JWT access.
    # The role is NOLOGIN — auth happens via JWT through PostgREST, not PG wire.
    role_name = f'{s}_role'

    # Create role (idempotent)
    migrations.append(
        f"DO $$ BEGIN\n"
        f"  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role_name}') THEN\n"
        f"    CREATE ROLE {role_name} NOLOGIN;\n"
        f"  END IF;\n"
        f"END $$"
    )

    # Grant schema access to PostgREST-relevant roles
    # CRITICAL: authenticator must be able to SET ROLE to the custom role,
    # otherwise PostgREST returns 403 "permission denied to set role"
    migrations.append(f'GRANT {role_name} TO authenticator')
    migrations.append(f'GRANT USAGE ON SCHEMA "{s}" TO anon, authenticated, service_role, {role_name}')
    migrations.append(f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "{s}" TO {role_name}')
    migrations.append(f'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "{s}" TO {role_name}')
    migrations.append(f'GRANT SELECT ON ALL TABLES IN SCHEMA "{s}" TO anon')
    migrations.append(f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{s}" GRANT ALL ON TABLES TO {role_name}')
    migrations.append(f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{s}" GRANT ALL ON SEQUENCES TO {role_name}')
    migrations.append(f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{s}" GRANT SELECT ON TABLES TO anon')

    # Enable RLS on all tables + create policies (idempotent)
    for table in ['published_pages', 'project_settings', 'workflows', 'executions', 'edge_logs', 'dead_letters']:
        migrations.append(f'ALTER TABLE IF EXISTS "{s}".{table} ENABLE ROW LEVEL SECURITY')
        migrations.append(
            f"DO $$ BEGIN\n"
            f"  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = '{s}' AND tablename = '{table}' AND policyname = 'edge_all_{table}') THEN\n"
            f"    CREATE POLICY edge_all_{table} ON \"{s}\".{table} FOR ALL TO {role_name} USING (true) WITH CHECK (true);\n"
            f"  END IF;\n"
            f"END $$"
        )
        if table == 'published_pages':
            migrations.append(
                f"DO $$ BEGIN\n"
                f"  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = '{s}' AND tablename = '{table}' AND policyname = 'anon_read_{table}') THEN\n"
                f"    CREATE POLICY anon_read_{table} ON \"{s}\".{table} FOR SELECT TO anon USING (true);\n"
                f"  END IF;\n"
                f"END $$"
            )

    combined_sql = ";\n".join(migrations)
    result = await _supabase_run_sql(token, project_ref, combined_sql)

    if result["success"]:
        logger.info("[Supabase init] Schema '%s' + tables + RLS created for project %s", s, project_ref)

        # Expose schema in PostgREST config via Management API PATCH /postgrest
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f'https://api.supabase.com/v1/projects/{project_ref}/postgrest',
                    headers={'Authorization': f'Bearer {token}'},
                )
                if resp.status_code == 200:
                    config = resp.json()
                    current_schemas = config.get('db_schema', 'public,graphql_public')
                    schema_list = [x.strip() for x in current_schemas.split(',')]
                    if s not in schema_list:
                        schema_list.append(s)
                        new_schemas = ','.join(schema_list)
                        patch_resp = await client.patch(
                            f'https://api.supabase.com/v1/projects/{project_ref}/postgrest',
                            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                            json={'db_schema': new_schemas},
                        )
                        if patch_resp.status_code == 200:
                            logger.info("[Supabase init] ✅ Exposed schema '%s' in PostgREST config", s)
                        else:
                            logger.warning("[Supabase init] ⚠️ PATCH /postgrest failed: %s", patch_resp.text[:200])
                    else:
                        logger.info("[Supabase init] Schema '%s' already in PostgREST config", s)
                else:
                    logger.warning("[Supabase init] ⚠️ GET /postgrest failed: HTTP %d", resp.status_code)

            # CRITICAL: Reset any role-level pgrst.db_schemas override on authenticator.
            # ALTER ROLE SET takes precedence over Dashboard/API config and blocks updates.
            # Then NOTIFY PostgREST to reload so the new config takes effect immediately.
            await _supabase_run_sql(token, project_ref, "ALTER ROLE authenticator RESET pgrst.db_schemas;")
            await _supabase_run_sql(token, project_ref, "NOTIFY pgrst, 'reload config';")
            logger.info("[Supabase init] ✅ Reset authenticator role override + sent NOTIFY pgrst reload")
        except Exception as e:
            logger.warning("[Supabase init] ⚠️ PostgREST config update failed: %s", str(e)[:200])
    else:
        logger.error("[Supabase init] Failed for project %s: %s", project_ref, result.get("detail"))

    return result


# =============================================================================
# State DB Cleanup (Drop Schema + Role + PostgREST)
# =============================================================================

async def cleanup_supabase_state_db(
    token: str,
    project_ref: str,
    schema_name: str,
) -> dict:
    """Clean up a Supabase state DB: drop schema, drop role, remove from PostgREST config.

    Called when an edge database using Supabase is deleted with delete_remote=True.
    """
    role_name = f'{schema_name}_role'
    errors: list[str] = []

    # 1. Drop schema (CASCADE removes tables, policies, etc.)
    r1 = await _supabase_run_sql(
        token, project_ref, f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE;'
    )
    if r1["success"]:
        logger.info("[Supabase cleanup] Dropped schema '%s'", schema_name)
    else:
        errors.append(f"DROP SCHEMA: {r1.get('detail', 'unknown error')}")

    # 2. Revoke all privileges from role, then drop it
    # Must revoke ALL (including database-level) before DROP works
    await _supabase_run_sql(token, project_ref, f'REVOKE ALL PRIVILEGES ON DATABASE postgres FROM {role_name};')
    await _supabase_run_sql(token, project_ref, f'REVOKE {role_name} FROM authenticator;')
    await _supabase_run_sql(
        token, project_ref,
        f'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "{schema_name}" FROM {role_name};'
    )
    await _supabase_run_sql(
        token, project_ref,
        f'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "{schema_name}" FROM {role_name};'
    )
    await _supabase_run_sql(
        token, project_ref,
        f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{schema_name}" REVOKE ALL ON TABLES FROM {role_name};'
    )
    await _supabase_run_sql(
        token, project_ref,
        f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{schema_name}" REVOKE ALL ON SEQUENCES FROM {role_name};'
    )
    await _supabase_run_sql(
        token, project_ref,
        f'REVOKE USAGE ON SCHEMA "{schema_name}" FROM {role_name};'
    )
    r2 = await _supabase_run_sql(
        token, project_ref,
        f"DO $$ BEGIN\n"
        f"  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role_name}') THEN\n"
        f"    DROP ROLE {role_name};\n"
        f"  END IF;\n"
        f"END $$"
    )
    if r2["success"]:
        logger.info("[Supabase cleanup] Dropped role '%s'", role_name)
    else:
        errors.append(f"DROP ROLE: {r2.get('detail', 'unknown error')}")

    # 3. Remove schema from PostgREST config via Management API
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f'https://api.supabase.com/v1/projects/{project_ref}/postgrest',
                headers={'Authorization': f'Bearer {token}'},
            )
            if resp.status_code == 200:
                config = resp.json()
                current_schemas = config.get('db_schema', 'public,graphql_public')
                schema_list = [x.strip() for x in current_schemas.split(',')]
                if schema_name in schema_list:
                    schema_list.remove(schema_name)
                    new_schemas = ','.join(schema_list)
                    patch_resp = await client.patch(
                        f'https://api.supabase.com/v1/projects/{project_ref}/postgrest',
                        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                        json={'db_schema': new_schemas},
                    )
                    if patch_resp.status_code == 200:
                        logger.info("[Supabase cleanup] Removed '%s' from PostgREST config", schema_name)
                    else:
                        errors.append(f"PATCH /postgrest: HTTP {patch_resp.status_code}")

            # Always RESET + NOTIFY
            await _supabase_run_sql(token, project_ref, "ALTER ROLE authenticator RESET pgrst.db_schemas;")
            await _supabase_run_sql(token, project_ref, "NOTIFY pgrst, 'reload config';")
    except Exception as e:
        errors.append(f"PostgREST cleanup: {str(e)[:100]}")

    return {"success": len(errors) == 0, "errors": errors}


# =============================================================================
# JWT Minting for Scoped PostgREST Access
# =============================================================================

async def mint_supabase_scoped_jwt(
    token: str,
    project_ref: str,
    role_name: str,
) -> dict:
    """Mint a scoped JWT for a custom PG role using the project's JWT secret.

    The JWT is used with PostgREST so the edge engine authenticates as the
    custom role (not service_role). This keeps secrets scoped — the edge
    never sees the service_role_key.

    Returns {success, jwt} or {success: False, detail}.
    """
    import time as _time

    # 1. Get the project's JWT secret from Management API GET /postgrest
    jwt_secret = ''
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f'https://api.supabase.com/v1/projects/{project_ref}/postgrest',
                headers={'Authorization': f'Bearer {token}'},
            )
        if resp.status_code == 200:
            jwt_secret = resp.json().get('jwt_secret', '')
            if jwt_secret:
                logger.info("[JWT] Got jwt_secret from GET /postgrest")
        else:
            logger.warning("[JWT] GET /postgrest returned %d", resp.status_code)
    except Exception as e:
        logger.warning("[JWT] GET /postgrest failed: %s", str(e)[:100])

    if not jwt_secret:
        logger.error("[JWT] Could not retrieve jwt_secret for project %s", project_ref)
        return {'success': False, 'detail': 'Could not retrieve jwt_secret from Management API'}

    # 2. Mint a JWT with the custom role
    import jwt as pyjwt  # PyJWT

    now = int(_time.time())
    payload = {
        'role': role_name,
        'iss': 'supabase',
        'iat': now,
        'exp': now + (10 * 365 * 24 * 3600),  # 10 years
    }
    scoped_jwt = pyjwt.encode(payload, jwt_secret, algorithm='HS256')
    logger.info("[JWT] ✅ Minted scoped JWT for role=%s (10yr exp)", role_name)
    return {'success': True, 'jwt': scoped_jwt}


# =============================================================================
# Role Password Reset & Schema Deletion
# =============================================================================

async def reset_supabase_role_password(token: str, project_ref: str, schema_name: str) -> dict:
    """Reset the password for a scoped role (re-import case where password was lost).

    Returns {success, role_name, role_password}.
    """
    import secrets as _secrets

    role_name = f"{schema_name}_role"
    role_password = _secrets.token_urlsafe(32)

    sql = (
        f"DO $$ BEGIN\n"
        f"  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role_name}') THEN\n"
        f"    CREATE ROLE {role_name} LOGIN PASSWORD '{role_password}';\n"
        f"  ELSE\n"
        f"    ALTER ROLE {role_name} PASSWORD '{role_password}';\n"
        f"  END IF;\n"
        f"END $$;\n"
        f'GRANT CONNECT ON DATABASE postgres TO {role_name};\n'
        f'GRANT USAGE ON SCHEMA "{schema_name}" TO {role_name};\n'
        f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "{schema_name}" TO {role_name};\n'
        f'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "{schema_name}" TO {role_name};\n'
        f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{schema_name}" GRANT ALL ON TABLES TO {role_name};\n'
        f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{schema_name}" GRANT ALL ON SEQUENCES TO {role_name};'
    )
    result = await _supabase_run_sql(token, project_ref, sql)
    if not result["success"]:
        return result
    return {"success": True, "role_name": role_name, "role_password": role_password}


async def delete_supabase_schema_and_role(token: str, project_ref: str, schema_name: str) -> dict:
    """Drop a Supabase schema + its scoped role via Management API.

    Used by the resource deleter when the user deletes a Supabase state DB.
    """
    role_name = f"{schema_name}_role"
    sql = (
        f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE;\n'
        f'DROP ROLE IF EXISTS {role_name};'
    )
    return await _supabase_run_sql(token, project_ref, sql)


# =============================================================================
# Supabase Scoped Role Provisioning (Orchestrator)
# =============================================================================

async def provision_supabase_scoped_role(
    edge_db: object,
    provider_account_id: str,
    schema_name: str | None,
) -> dict:
    """Provision a Supabase edge database for PostgREST access.

    Steps:
      1. Resolve access_token + project_ref from connected account
      2. Create schema + tables + NOLOGIN role + RLS via Management API
      3. Get anon_key from connected account
      4. Mint a scoped JWT for the edge role
      5. Store supabase_url, anon_key, scoped_jwt, schema in provider_config

    Returns {success, warning?}.
    """
    import json as _json
    import re as _re

    from ..core.security import get_provider_creds  # type: ignore[import-untyped]
    from ..database.config import SessionLocal  # type: ignore[import-untyped]

    # 1. Get credentials from connected account
    db_session = SessionLocal()
    try:
        creds = get_provider_creds(provider_account_id, db_session)
    finally:
        db_session.close()

    if not creds:
        logger.warning("[Supabase provision] No creds for account %s", provider_account_id)
        return {'success': False, 'warning': 'No credentials found for connected account'}

    token = creds.get('access_token', '')
    if not token:
        logger.warning("[Supabase provision] No access_token for account %s", provider_account_id)
        return {'success': False, 'warning': 'No access_token in connected account'}

    # Extract project ref from metadata
    project_ref = creds.get('project_ref', '')
    if not project_ref:
        # Try extracting from db_url as fallback
        raw_url = str(getattr(edge_db, 'db_url', '') or '')
        ref_match = _re.search(r'postgres\.([a-z0-9]+)', raw_url) or _re.search(r'db\.([a-z0-9]+)\.supabase', raw_url)
        if ref_match:
            project_ref = ref_match.group(1)
    if not project_ref:
        logger.warning("[Supabase provision] Cannot determine project_ref")
        return {'success': False, 'warning': 'Cannot determine project_ref'}

    # 2. Create schema + tables + role + RLS
    s = schema_name or 'frontbase_edge'
    result = await init_supabase_state_db(token, project_ref, s)
    if not result.get('success'):
        detail = result.get('detail', 'unknown error')
        logger.error("[Supabase provision] Failed for project %s: %s", project_ref, detail)
        return {'success': False, 'warning': f'Schema/role creation failed: {detail}'}

    # 3. Get anon_key — try creds first, then Management API fallback
    anon_key = creds.get('anon_key', '')
    if not anon_key:
        # Fetch from Management API (always available via access_token)
        try:
            from ..services.supabase_management import get_api_keys  # type: ignore[import-untyped]
            api_keys = await get_api_keys(token, project_ref)
            anon_key = api_keys.get('anon_key', '')
            if anon_key:
                logger.info("[Supabase provision] Got anon_key from Management API")
        except Exception as e:
            logger.warning("[Supabase provision] Failed to fetch API keys: %s", str(e)[:100])
    if not anon_key:
        logger.warning("[Supabase provision] No anon_key found for project %s", project_ref)
        return {'success': False, 'warning': 'No anon_key found'}

    # 4. Mint scoped JWT
    role_name = f'{s}_role'
    jwt_result = await mint_supabase_scoped_jwt(token, project_ref, role_name)
    if not jwt_result.get('success'):
        detail = jwt_result.get('detail', 'unknown error')
        logger.error("[Supabase provision] JWT minting failed: %s", detail)
        return {'success': False, 'warning': f'JWT minting failed: {detail}'}

    scoped_jwt = jwt_result['jwt']

    # 5. Store everything in provider_config + update db_url to Supabase API URL
    supabase_url = f'https://{project_ref}.supabase.co'
    edge_db.db_url = supabase_url  # type: ignore[attr-defined]

    config: dict = {}
    if getattr(edge_db, 'provider_config', None):
        try:
            config = _json.loads(str(edge_db.provider_config))  # type: ignore[attr-defined]
        except (ValueError, TypeError):
            pass
    config['schema_name'] = s
    config['anon_key'] = anon_key
    config['scoped_jwt'] = scoped_jwt
    config['supabase_url'] = supabase_url
    config['role_name'] = role_name
    edge_db.provider_config = _json.dumps(config)  # type: ignore[attr-defined]

    logger.info(
        "[Supabase provision] ✅ PostgREST ready: url=%s schema=%s role=%s",
        supabase_url, s, role_name,
    )
    return {'success': True}
