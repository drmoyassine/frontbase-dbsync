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
import logging

logger = logging.getLogger(__name__)


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

    # Enrich each project with the connection pooler URI for state DB use
    resources: list[dict] = []
    for p in projects:
        ref = p.get("id", "")
        entry: dict = {
            "id": ref,
            "ref": ref,
            "name": p.get("name", ""),
            "type": "supabase_project",
            "region": p.get("region", ""),
            "status": p.get("status", ""),
        }
        # Fetch pooler URI from Supabase management API (for PG state DB)
        if ref and token:
            try:
                pooler_uri = await _fetch_supabase_pooler_uri(token, ref)
                if pooler_uri:
                    entry["db_url"] = pooler_uri
            except Exception as e:
                logger.warning("[Supabase discover] Failed to fetch pooler URI for ref=%s: %s", ref, e)
        resources.append(entry)

    return {"success": True, "resources": resources}


async def _fetch_supabase_pooler_uri(access_token: str, project_ref: str, db_password: str | None = None) -> str | None:
    """Fetch the Supavisor connection pooler URI for a Supabase project.
    
    If db_password is provided, it replaces the [YOUR-PASSWORD] placeholder
    in the returned connection string.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"https://api.supabase.com/v1/projects/{project_ref}/config/database/pooler",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        logger.warning("[Supabase pooler] API returned %d for ref=%s: %s", resp.status_code, project_ref, resp.text[:300])
        return None
    data = resp.json()
    logger.debug("[Supabase pooler] Response for ref=%s: %s", project_ref, str(data)[:500])
    
    uri: str | None = None
    # Supabase returns an array of pooler configs; prefer transaction mode
    if isinstance(data, list):
        for entry in data:
            if entry.get("pool_mode") == "transaction" or entry.get("mode") == "transaction":
                uri = entry.get("connection_string") or entry.get("connectionString") or entry.get("uri")
                if uri:
                    break
        # Fallback: first available
        if not uri and data:
            first = data[0]
            uri = first.get("connection_string") or first.get("connectionString") or first.get("uri")
    elif isinstance(data, dict):
        uri = data.get("connection_string") or data.get("connectionString") or data.get("uri")
    
    if not uri:
        return None
    
    # Replace password placeholder
    if db_password and "[YOUR-PASSWORD]" in uri:
        uri = uri.replace("[YOUR-PASSWORD]", db_password)
    
    return uri


async def _cf_api_get(client: httpx.AsyncClient, token: str, path: str) -> list:
    """DRY helper for Cloudflare API v4 paginated GET requests."""
    resp = await client.get(
        f"https://api.cloudflare.com/client/v4{path}",
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code != 200:
        return []
    data = resp.json()
    return data.get("result", []) if isinstance(data.get("result"), list) else []


async def _discover_cloudflare(creds: dict) -> dict:
    """Discover all Cloudflare sub-resources: D1, KV, R2, Queues, Vectorize."""
    token = creds.get("api_token", "")
    resources: list[dict] = []

    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1. Get accounts
        accounts = await _cf_api_get(client, token, "/accounts")
        if not accounts:
            return {"success": False, "detail": "No Cloudflare accounts found or invalid token"}

        for acct in accounts:
            acct_id = acct.get("id", "")
            acct_name = acct.get("name", "")

            # 2. D1 databases
            for d in await _cf_api_get(client, token, f"/accounts/{acct_id}/d1/database"):
                resources.append({
                    "id": d.get("uuid", ""), "name": d.get("name", ""),
                    "type": "d1", "account_id": acct_id, "account_name": acct_name,
                    "db_url": f"d1://{d.get('uuid', '')}",  # Synthetic URL for display
                })

            # 3. KV namespaces
            for ns in await _cf_api_get(client, token, f"/accounts/{acct_id}/storage/kv/namespaces"):
                ns_id = ns.get("id", "")
                resources.append({
                    "id": ns_id, "name": ns.get("title", ""),
                    "type": "kv", "account_id": acct_id, "account_name": acct_name,
                    "cache_url": f"kv://{ns_id}",  # Synthetic URL for provider-agnostic storage
                })

            # 4. R2 buckets
            for b in await _cf_api_get(client, token, f"/accounts/{acct_id}/r2/buckets"):
                resources.append({
                    "id": b.get("name", ""), "name": b.get("name", ""),
                    "type": "r2", "account_id": acct_id, "account_name": acct_name,
                })

            # 5. Queues
            for q in await _cf_api_get(client, token, f"/accounts/{acct_id}/queues"):
                q_id = q.get("queue_id", "")
                resources.append({
                    "id": q_id, "name": q.get("queue_name", ""),
                    "type": "queue", "account_id": acct_id, "account_name": acct_name,
                    "queue_url": f"cfq://{q_id}",  # Synthetic URL for provider-agnostic queue
                })

            # 6. Vectorize indexes
            for v in await _cf_api_get(client, token, f"/accounts/{acct_id}/vectorize/v2/indexes"):
                resources.append({
                    "id": v.get("name", ""), "name": v.get("name", ""),
                    "type": "vectorize", "account_id": acct_id, "account_name": acct_name,
                    "dimensions": v.get("config", {}).get("dimensions"),
                    "metric": v.get("config", {}).get("metric"),
                })

    return {"success": True, "resources": resources}


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


async def _upstash_get(auth: str, url: str) -> list | dict:
    """DRY helper for Upstash Management API GET requests."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers={"Authorization": f"Basic {auth}"})
    if resp.status_code != 200:
        return []
    return resp.json()


async def _discover_upstash(creds: dict) -> dict:
    """Discover all Upstash resources: Redis, QStash, Vector, Search."""
    token = creds.get("api_token", "")
    email = creds.get("email", "")
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    resources: list[dict] = []

    # 1. Redis databases
    redis_dbs = await _upstash_get(auth, "https://api.upstash.com/v2/redis/databases")
    for d in (redis_dbs if isinstance(redis_dbs, list) else []):
        resources.append({
            "id": d.get("database_id"), "name": d.get("database_name"), "type": "redis",
            "endpoint": d.get("endpoint"), "rest_url": d.get("rest_url"),
            "rest_token": d.get("rest_token"), "region": d.get("region"),
        })

    # 2. QStash — get real QStash token from Developer API
    try:
        qstash_user = await _upstash_get(auth, "https://api.upstash.com/v2/qstash/user")
        qstash_token = qstash_user.get("token", "") if isinstance(qstash_user, dict) else ""
        if qstash_token:
            qstash_keys_data: dict = {}
            async with httpx.AsyncClient(timeout=10.0) as client:
                keys_resp = await client.get(
                    "https://qstash.upstash.io/v2/keys",
                    headers={"Authorization": f"Bearer {qstash_token}"},
                )
                if keys_resp.status_code == 200:
                    qstash_keys_data = keys_resp.json()
            resources.append({
                "id": "qstash", "name": "QStash", "type": "qstash",
                "endpoint": "https://qstash.upstash.io",
                "token": qstash_token,
                "signing_key": qstash_keys_data.get("current", ""),
                "next_signing_key": qstash_keys_data.get("next", ""),
            })
    except Exception:
        pass  # QStash discovery is best-effort

    # 3. Vector indexes
    try:
        vector_indexes = await _upstash_get(auth, "https://api.upstash.com/v2/vector/indexes")
        for v in (vector_indexes if isinstance(vector_indexes, list) else []):
            resources.append({
                "id": v.get("id", ""), "name": v.get("name", ""), "type": "vector",
                "endpoint": v.get("endpoint", ""), "region": v.get("region", ""),
                "dimensions": v.get("dimension_count"),
                "similarity_function": v.get("similarity_function", ""),
            })
    except Exception:
        pass

    # 4. Search indexes (best-effort)
    try:
        search_indexes = await _upstash_get(auth, "https://api.upstash.com/v2/search/indexes")
        for s in (search_indexes if isinstance(search_indexes, list) else []):
            resources.append({
                "id": s.get("id", ""), "name": s.get("name", ""), "type": "search",
                "endpoint": s.get("endpoint", ""), "region": s.get("region", ""),
            })
    except Exception:
        pass

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
        except Exception as e:
            logger.warning("[Neon discover] Failed to fetch connection_uri for project=%s: %s", project_id, e)
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
# Additional Discoverers — Vercel & Deno
# =============================================================================

async def _discover_vercel(creds: dict) -> dict:
    """Discover Vercel resources: projects, blob stores, edge configs."""
    token = creds.get("api_token", "")
    headers = {"Authorization": f"Bearer {token}"}
    resources: list[dict] = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. Projects
        proj_resp = await client.get("https://api.vercel.com/v9/projects", headers=headers)
        if proj_resp.status_code == 200:
            for p in proj_resp.json().get("projects", []):
                resources.append({
                    "id": p.get("id", ""), "name": p.get("name", ""),
                    "type": "vercel_project",
                    "framework": p.get("framework", ""),
                })

        # 2. Edge Configs (cache-like) — fetch connection strings for runtime use
        ec_resp = await client.get("https://api.vercel.com/v1/edge-config", headers=headers)
        if ec_resp.status_code == 200:
            for ec in (ec_resp.json() if isinstance(ec_resp.json(), list) else []):
                ec_id = ec.get("id", "")
                entry: dict = {
                    "id": ec_id, "name": ec.get("slug", ec_id),
                    "type": "edge_config",
                    "item_count": ec.get("itemCount"),
                }
                # Fetch connection string (required for runtime access)
                if ec_id:
                    try:
                        tok_resp = await client.get(
                            f"https://api.vercel.com/v1/edge-config/{ec_id}/tokens",
                            headers=headers,
                        )
                        if tok_resp.status_code == 200:
                            tokens = tok_resp.json()
                            if isinstance(tokens, list) and tokens:
                                conn_str = tokens[0].get("connectionString", "")
                                if conn_str:
                                    entry["cache_url"] = conn_str
                    except Exception:
                        pass  # Best-effort
                resources.append(entry)

        # 3. Blob stores (storage)
        try:
            blob_resp = await client.get(
                "https://api.vercel.com/v1/blob", headers=headers,
                params={"limit": 50},
            )
            if blob_resp.status_code == 200:
                for store in blob_resp.json().get("stores", []):
                    resources.append({
                        "id": store.get("id", ""), "name": store.get("name", ""),
                        "type": "blob_store",
                    })
        except Exception:
            pass  # Blob discovery is best-effort

    return {"success": True, "resources": resources}


async def _discover_deno(creds: dict) -> dict:
    """Discover Deno Deploy resources: organizations, projects."""
    token = creds.get("access_token", "")
    headers = {"Authorization": f"Bearer {token}"}
    resources: list[dict] = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. Get organizations
        org_resp = await client.get(
            "https://api.deno.com/v1/organizations", headers=headers,
        )
        if org_resp.status_code != 200:
            return {"success": False, "detail": f"Deno API error: {org_resp.status_code}"}

        orgs = org_resp.json()
        for org in (orgs if isinstance(orgs, list) else []):
            org_id = org.get("id", "")

            # 2. Projects per org (each project gets its own KV)
            proj_resp = await client.get(
                f"https://api.deno.com/v1/organizations/{org_id}/projects",
                headers=headers,
            )
            if proj_resp.status_code == 200:
                projects = proj_resp.json()
                for p in (projects if isinstance(projects, list) else []):
                    resources.append({
                        "id": p.get("id", ""), "name": p.get("name", ""),
                        "type": "deno_project",
                        "org_id": org_id,
                        "has_kv": True,  # Every Deno project gets KV
                    })

    return {"success": True, "resources": resources}


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
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
            json={"database_name": name, "platform": "aws", "primary_region": region, "read_regions": [], "tls": True},
        )
    if resp.status_code in (200, 201):
        data = resp.json()
        return {
            "success": True,
            "resource": {
                "id": data.get("database_id"), "name": data.get("database_name", name),
                "type": "redis", "endpoint": data.get("endpoint", ""),
                "rest_url": data.get("rest_url", ""), "rest_token": data.get("rest_token", ""),
                "region": data.get("region", region),
            },
        }
    return {"success": False, "detail": f"Upstash API error {resp.status_code}: {resp.text[:300]}"}


async def _create_turso_db(creds: dict, *, name: str = "", group: str = "default") -> dict:
    """Create a new Turso database via Management API."""
    token = creds.get("api_token", "")
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get first org
        org_resp = await client.get(
            "https://api.turso.tech/v1/organizations",
            headers={"Authorization": f"Bearer {token}"},
        )
        if org_resp.status_code != 200:
            return {"success": False, "detail": f"Turso API error: {org_resp.status_code}"}
        orgs = org_resp.json()
        if not orgs:
            return {"success": False, "detail": "No Turso organizations found"}
        org_slug = orgs[0].get("slug", "")

        resp = await client.post(
            f"https://api.turso.tech/v1/organizations/{org_slug}/databases",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"name": name, "group": group},
        )
    if resp.status_code in (200, 201):
        data = resp.json()
        db = data.get("database", data)
        hostname = db.get("hostname", "")
        return {
            "success": True,
            "resource": {
                "id": db.get("name", name), "name": db.get("name", name),
                "type": "turso_db", "hostname": hostname,
                "db_url": f"libsql://{hostname}" if hostname else "",
            },
        }
    return {"success": False, "detail": f"Turso create error {resp.status_code}: {resp.text[:300]}"}


async def _create_cf_d1(creds: dict, *, name: str = "", **_: object) -> dict:
    """Create a new Cloudflare D1 database."""
    token = creds.get("api_token", "")
    async with httpx.AsyncClient(timeout=30.0) as client:
        accounts = await _cf_api_get(client, token, "/accounts")
        if not accounts:
            return {"success": False, "detail": "No Cloudflare accounts found"}
        acct_id = accounts[0].get("id", "")

        resp = await client.post(
            f"https://api.cloudflare.com/client/v4/accounts/{acct_id}/d1/database",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"name": name},
        )
    data = resp.json()
    if data.get("success"):
        result = data.get("result", {})
        return {
            "success": True,
            "resource": {
                "id": result.get("uuid", ""), "name": result.get("name", name),
                "type": "d1", "db_url": f"d1://{result.get('uuid', '')}",
            },
        }
    errors = data.get("errors", [{}])
    return {"success": False, "detail": errors[0].get("message", "D1 create failed")}


async def _create_cf_kv(creds: dict, *, name: str = "", **_: object) -> dict:
    """Create a new Cloudflare KV namespace."""
    token = creds.get("api_token", "")
    async with httpx.AsyncClient(timeout=30.0) as client:
        accounts = await _cf_api_get(client, token, "/accounts")
        if not accounts:
            return {"success": False, "detail": "No Cloudflare accounts found"}
        acct_id = accounts[0].get("id", "")

        resp = await client.post(
            f"https://api.cloudflare.com/client/v4/accounts/{acct_id}/storage/kv/namespaces",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"title": name},
        )
    data = resp.json()
    if data.get("success"):
        result = data.get("result", {})
        return {
            "success": True,
            "resource": {
                "id": result.get("id", ""), "name": result.get("title", name), "type": "kv",
            },
        }
    errors = data.get("errors", [{}])
    return {"success": False, "detail": errors[0].get("message", "KV create failed")}

async def _create_cf_queue(creds: dict, *, name: str = "", **_: object) -> dict:
    """Create a new Cloudflare Queue."""
    token = creds.get("api_token", "")
    async with httpx.AsyncClient(timeout=30.0) as client:
        accounts = await _cf_api_get(client, token, "/accounts")
        if not accounts:
            return {"success": False, "detail": "No Cloudflare accounts found"}
        acct_id = accounts[0].get("id", "")

        resp = await client.post(
            f"https://api.cloudflare.com/client/v4/accounts/{acct_id}/queues",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"queue_name": name},
        )
    data = resp.json()
    if data.get("success"):
        result = data.get("result", {})
        return {
            "success": True,
            "resource": {
                "id": result.get("queue_id", ""), "name": result.get("queue_name", name),
                "type": "queue",
            },
        }
    errors = data.get("errors", [{}])
    return {"success": False, "detail": errors[0].get("message", "Queue create failed")}


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
    "vercel":         _discover_vercel,
    "deno":           _discover_deno,
    "wordpress":      _discover_wordpress,
    "wordpress_rest": _discover_wordpress,
    "postgres":       _discover_postgres,
    "mysql":          _discover_mysql,
}

_CREATORS: dict[str, dict[str, object]] = {
    "upstash":    {"redis": _create_upstash_redis},
    "turso":      {"turso_db": _create_turso_db},
    "cloudflare": {"d1": _create_cf_d1, "kv": _create_cf_kv, "queue": _create_cf_queue},
}
