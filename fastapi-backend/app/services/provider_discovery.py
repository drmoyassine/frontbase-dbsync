"""
Provider Resource Discovery & Creation — Registry-pattern dispatch.

Entry points:
  discover_resources(provider, creds) → dict   — list available resources
  create_resource(provider, resource_type, creds, **kwargs) → dict  — create a resource

Adding a new provider:
  1. Write an async _discover_<provider>(creds) function
  2. Add it to the _DISCOVERERS dict
  3. (Optional) Add creator to _CREATORS dict
  That's it. No if/elif chains.
"""

import httpx
import base64


# =============================================================================
# Public Entry Points
# =============================================================================

async def discover_resources(provider: str, creds: dict) -> dict:
    """Discover resources (projects, databases, sites) for a given provider."""
    discoverer = _DISCOVERERS.get(provider)
    if not discoverer:
        return {"success": False, "detail": f"Discovery not supported for provider: {provider}"}

    try:
        return await discoverer(creds)  # type: ignore[operator]
    except PermissionError as e:
        return {"success": False, "detail": str(e)}
    except Exception as e:
        return {"success": False, "detail": f"Discovery failed: {str(e)}"}


async def create_resource(provider: str, resource_type: str, creds: dict, **kwargs) -> dict:
    """Create a new resource via a provider's management API."""
    provider_creators = _CREATORS.get(provider, {})
    creator = provider_creators.get(resource_type)
    if not creator:
        return {"success": False, "detail": f"Resource creation not supported for {provider}/{resource_type}"}

    try:
        return await creator(creds, **kwargs)  # type: ignore[operator]
    except Exception as e:
        return {"success": False, "detail": f"Create failed: {str(e)}"}


# =============================================================================
# Per-Provider Discoverers
# =============================================================================

async def _discover_supabase(creds: dict) -> dict:
    from ..services.supabase_management import list_projects
    token = creds.get("access_token", "")
    locked_ref = creds.get("project_ref", "")
    projects = await list_projects(token)

    # If a project_ref was locked in at connection time, only return that project
    if locked_ref:
        projects = [p for p in projects if p.get("id") == locked_ref]

    return {
        "success": True,
        "resources": [
            {
                "id": p.get("id", ""),     # Standard field for AccountResourcePicker
                "ref": p.get("id", ""),     # Backward compat alias
                "name": p.get("name", ""),
                "type": "supabase_project",
                "region": p.get("region", ""),
                "status": p.get("status", ""),
            }
            for p in projects
        ],
    }


async def _discover_cloudflare(creds: dict) -> dict:
    token = creds.get("api_token", "")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://api.cloudflare.com/client/v4/accounts",
            headers={"Authorization": f"Bearer {token}"},
        )
    data = resp.json()
    return {
        "success": True,
        "resources": [
            {"id": a.get("id"), "name": a.get("name")}
            for a in data.get("result", [])
        ],
    }


async def _discover_netlify(creds: dict) -> dict:
    token = creds.get("api_token", "")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://api.netlify.com/api/v1/sites",
            headers={"Authorization": f"Bearer {token}"},
        )
    return {
        "success": True,
        "resources": [
            {"id": s.get("id"), "name": s.get("name"), "url": s.get("ssl_url", s.get("url", ""))}
            for s in resp.json()
        ],
    }


async def _discover_upstash(creds: dict) -> dict:
    token = creds.get("api_token", "")
    email = creds.get("email", "")
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Discover Redis databases
        redis_resp = await client.get(
            "https://api.upstash.com/v2/redis/databases",
            headers={"Authorization": f"Basic {auth}"},
        )
        # Discover QStash — get the real QStash token from the Developer API
        qstash_ok = False
        qstash_keys_data: dict = {}
        qstash_token = ""
        try:
            user_resp = await client.get(
                "https://api.upstash.com/v2/qstash/user",
                headers={"Authorization": f"Basic {auth}"},
            )
            if user_resp.status_code == 200:
                user_data = user_resp.json()
                qstash_token = user_data.get("token", "")
                if qstash_token:
                    qstash_ok = True
                    keys_resp = await client.get(
                        "https://qstash.upstash.io/v2/keys",
                        headers={"Authorization": f"Bearer {qstash_token}"},
                    )
                    if keys_resp.status_code == 200:
                        qstash_keys_data = keys_resp.json()
        except Exception:
            pass  # QStash discovery is best-effort

    redis_dbs = redis_resp.json() if redis_resp.status_code == 200 else []
    resources: list[dict] = [
        {"id": d.get("database_id"), "name": d.get("database_name"), "type": "redis",
         "endpoint": d.get("endpoint"), "rest_url": d.get("rest_url"),
         "rest_token": d.get("rest_token"), "region": d.get("region")}
        for d in (redis_dbs if isinstance(redis_dbs, list) else [])
    ]
    if qstash_ok:
        resources.append({
            "id": "qstash", "name": "QStash", "type": "qstash",
            "endpoint": "https://qstash.upstash.io",
            "token": qstash_token,
            "signing_key": qstash_keys_data.get("current", ""),
            "next_signing_key": qstash_keys_data.get("next", ""),
        })
    return {"success": True, "resources": resources}


async def _discover_turso(creds: dict) -> dict:
    token = creds.get("api_token", "")
    async with httpx.AsyncClient(timeout=15.0) as client:
        org_resp = await client.get(
            "https://api.turso.tech/v1/organizations",
            headers={"Authorization": f"Bearer {token}"},
        )
        if org_resp.status_code != 200:
            return {"success": False, "detail": f"Turso API error: {org_resp.status_code}"}
        orgs = org_resp.json()
        resources: list[dict] = []
        for org in (orgs if isinstance(orgs, list) else []):
            org_slug = org.get("slug") or org.get("name", "")
            db_resp = await client.get(
                f"https://api.turso.tech/v1/organizations/{org_slug}/databases",
                headers={"Authorization": f"Bearer {token}"},
            )
            if db_resp.status_code == 200:
                dbs = db_resp.json()
                db_list = dbs.get("databases", dbs) if isinstance(dbs, dict) else dbs
                for d in (db_list if isinstance(db_list, list) else []):
                    hostname = d.get("hostname", "")
                    db_name = d.get("name", d.get("Name", ""))
                    resources.append({
                        "id": db_name,
                        "name": db_name,
                        "type": "turso_db",
                        "hostname": hostname,
                        "db_url": f"libsql://{hostname}" if hostname else "",
                        "org": org_slug,
                        "group": d.get("group", ""),
                        "regions": d.get("regions", []),
                    })
    return {"success": True, "resources": resources}


async def _discover_neon(creds: dict) -> dict:
    token = creds.get("api_key", "")
    org_id = creds.get("org_id", "")
    neon_headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        # If no org_id stored, fetch it from the API
        if not org_id:
            org_resp = await client.get(
                "https://console.neon.tech/api/v2/users/me/organizations",
                headers=neon_headers,
            )
            if org_resp.status_code == 200:
                orgs = org_resp.json().get("organizations", [])
                if orgs:
                    org_id = orgs[0]["id"]

        # Fetch projects (with org_id if available)
        params: dict = {"limit": 50}
        if org_id:
            params["org_id"] = org_id
        resp = await client.get(
            "https://console.neon.tech/api/v2/projects",
            headers=neon_headers,
            params=params,
        )

    if resp.status_code != 200:
        return {"success": False, "detail": f"Neon API error: {resp.status_code} — {resp.text[:200]}"}
    data = resp.json()
    projects = data.get("projects", []) if isinstance(data, dict) else []
    resources: list[dict] = []

    for p in projects:
        project_id = p.get("id", "")
        conn_uri = ""
        try:
            async with httpx.AsyncClient(timeout=10.0) as conn_client:
                conn_resp = await conn_client.get(
                    f"https://console.neon.tech/api/v2/projects/{project_id}/connection_uri",
                    headers=neon_headers,
                    params={"role_name": "neondb_owner", "database_name": "neondb"},
                )
                if conn_resp.status_code == 200:
                    conn_uri = conn_resp.json().get("uri", "")
        except Exception:
            pass  # non-fatal, URI will be empty
        resources.append({
            "id": project_id,
            "name": p.get("name", ""),
            "type": "neon_project",
            "region": p.get("region_id", ""),
            "pg_version": p.get("pg_version", ""),
            "connection_uri": conn_uri,
        })
    return {"success": True, "resources": resources}


async def _discover_wordpress(creds: dict) -> dict:
    """Validate WordPress site credentials and return a synthetic resource."""
    base_url = creds.get("base_url", "").rstrip("/")
    username = creds.get("username", "")
    app_password = creds.get("app_password", "")
    if not base_url:
        return {"success": False, "detail": "Site URL is required"}
    auth = base64.b64encode(f"{username}:{app_password}".encode()).decode()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{base_url}/wp-json/wp/v2/users/me",
            headers={"Authorization": f"Basic {auth}"},
        )
    if resp.status_code == 401:
        return {"success": False, "detail": "Invalid WordPress credentials"}
    if resp.status_code != 200:
        return {"success": False, "detail": f"WordPress API error: {resp.status_code}"}
    data = resp.json()
    site_name = data.get("name", "WordPress User")
    return {
        "success": True,
        "resources": [{
            "id": "site",
            "name": f"{site_name} — {base_url}",
            "type": "wordpress_site",
            "base_url": base_url,
            "username": username,
            "app_password": app_password,
        }],
    }


async def _discover_postgres(creds: dict) -> dict:
    """Validate Postgres connection and return a synthetic resource."""
    import asyncpg
    host = creds.get("host", "localhost")
    port = int(creds.get("port", 5432))
    database = creds.get("database", "")
    user = creds.get("username", "")
    password = creds.get("password", "")
    if not database:
        return {"success": False, "detail": "Database name is required"}
    try:
        conn = await asyncpg.connect(
            host=host, port=port, database=database,
            user=user, password=password, timeout=10,
        )
        version = await conn.fetchval("SELECT version()")
        await conn.close()
    except Exception as e:
        return {"success": False, "detail": f"Connection failed: {str(e)}"}
    return {
        "success": True,
        "resources": [{
            "id": "server",
            "name": f"{host}:{port}/{database}",
            "type": "pg_server",
            "host": host,
            "port": str(port),
            "database": database,
            "username": user,
            "version": str(version or ""),
        }],
    }


async def _discover_mysql(creds: dict) -> dict:
    """Validate MySQL connection and return a synthetic resource."""
    import aiomysql
    host = creds.get("host", "localhost")
    port = int(creds.get("port", 3306))
    database = creds.get("database", "")
    user = creds.get("username", "")
    password = creds.get("password", "")
    if not database:
        return {"success": False, "detail": "Database name is required"}
    try:
        conn = await aiomysql.connect(
            host=host, port=port, db=database,
            user=user, password=password,
            connect_timeout=10,
        )
        async with conn.cursor() as cur:
            await cur.execute("SELECT VERSION()")
            row = await cur.fetchone()
            version = row[0] if row else ""
        conn.close()
    except Exception as e:
        return {"success": False, "detail": f"Connection failed: {str(e)}"}
    return {
        "success": True,
        "resources": [{
            "id": "server",
            "name": f"{host}:{port}/{database}",
            "type": "mysql_server",
            "host": host,
            "port": str(port),
            "database": database,
            "username": user,
            "version": str(version or ""),
        }],
    }


# =============================================================================
# Per-Provider Creators
# =============================================================================

async def _create_upstash_redis(creds: dict, *, name: str = "", region: str = "us-east-1") -> dict:
    token = creds.get("api_token", "")
    email = creds.get("email", "")
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.upstash.com/v2/redis/database",
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/json",
            },
            json={
                "database_name": name,
                "platform": "aws",
                "primary_region": region,
                "read_regions": [],
                "tls": True,
            },
        )

    if resp.status_code in (200, 201):
        data = resp.json()
        return {
            "success": True,
            "resource": {
                "id": data.get("database_id"),
                "name": data.get("database_name", name),
                "type": "redis",
                "endpoint": data.get("endpoint", ""),
                "rest_url": data.get("rest_url", ""),
                "rest_token": data.get("rest_token", ""),
                "region": data.get("region", region),
            },
        }
    else:
        return {"success": False, "detail": f"Upstash API error {resp.status_code}: {resp.text[:300]}"}


# =============================================================================
# Registries — add new providers here
# =============================================================================

_DISCOVERERS: dict[str, object] = {
    "supabase":       _discover_supabase,
    "cloudflare":     _discover_cloudflare,
    "netlify":        _discover_netlify,
    "upstash":        _discover_upstash,
    "turso":          _discover_turso,
    "neon":           _discover_neon,
    "wordpress":      _discover_wordpress,
    "wordpress_rest": _discover_wordpress,
    "postgres":       _discover_postgres,
    "mysql":          _discover_mysql,
}

_CREATORS: dict[str, dict[str, object]] = {
    "upstash": {"redis": _create_upstash_redis},
}
