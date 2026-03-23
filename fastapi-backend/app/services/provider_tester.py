"""
Provider Connection Tester — Registry-pattern dispatch for credential validation.

Single entry point: test_provider_connection(provider, creds) → dict

Adding a new provider:
  1. Write an async _test_<provider>(creds) function
  2. Add it to the _TESTERS dict
  That's it. No if/elif chains.
"""

import httpx


# =============================================================================
# Public Entry Point
# =============================================================================

async def test_provider_connection(provider: str, creds: dict) -> dict:
    """Validate provider credentials by making a lightweight API call.

    Does NOT create a record — just verifies the credentials work.
    Called before saving to prevent storing invalid tokens.
    """
    tester = _TESTERS.get(provider)
    if not tester:
        return {"success": False, "detail": f"Unsupported provider: {provider}"}

    try:
        return await tester(creds)  # type: ignore[operator]
    except httpx.TimeoutException:
        return {"success": False, "detail": "Connection timed out — check your network"}
    except Exception as e:
        return {"success": False, "detail": f"Connection failed: {str(e)}"}


# =============================================================================
# Per-Provider Testers
# =============================================================================

async def _test_cloudflare(creds: dict) -> dict:
    token = creds.get("api_token", "")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://api.cloudflare.com/client/v4/accounts",
            headers={"Authorization": f"Bearer {token}"},
            params={"page": 1, "per_page": 1},
        )
    data = resp.json()
    if not data.get("success"):
        errors = data.get("errors", [{}])
        msg = errors[0].get("message", "Invalid API token") if errors else "Invalid API token"
        return {"success": False, "detail": msg}
    accounts = data.get("result", [])
    name = accounts[0].get("name", "Cloudflare Account") if accounts else "Cloudflare Account"
    return {"success": True, "detail": f"Connected as {name}"}


async def _test_supabase(creds: dict) -> dict:
    token = creds.get("access_token", "")
    project_ref = creds.get("project_ref", "")

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            if project_ref:
                # Re-test: validate specific project
                resp = await client.get(
                    f"https://api.supabase.com/v1/projects/{project_ref}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if resp.status_code == 401:
                    return {"success": False, "detail": "Invalid Supabase access token"}
                if resp.status_code == 404:
                    return {"success": False, "detail": f"Project '{project_ref}' not found"}
                if resp.status_code != 200:
                    return {"success": False, "detail": f"Supabase API error: {resp.status_code}"}
                data = resp.json()
                name = data.get("name", project_ref)
                return {"success": True, "detail": f"Connected to {name}"}
            else:
                # New connect: discover all projects
                from ..services.supabase_management import validate_token
                result = await validate_token(token)
                count = result.get("project_count", 0)
                return {"success": True, "detail": f"Connected — {count} project(s) found", "projects": result.get("projects", [])}
        except PermissionError:
            return {"success": False, "detail": "Invalid Supabase access token"}
        except Exception as e:
            return {"success": False, "detail": f"Supabase API error: {str(e)}"}


async def _test_vercel(creds: dict) -> dict:
    token = creds.get("api_token", "")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://api.vercel.com/v2/user",
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code != 200:
        return {"success": False, "detail": "Invalid Vercel API token"}
    data = resp.json()
    name = data.get("user", {}).get("username", "Vercel User")
    return {"success": True, "detail": f"Connected as {name}"}


async def _test_netlify(creds: dict) -> dict:
    token = creds.get("api_token", "")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://api.netlify.com/api/v1/user",
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code != 200:
        return {"success": False, "detail": "Invalid Netlify token"}
    data = resp.json()
    name = data.get("full_name", data.get("email", "Netlify User"))
    return {"success": True, "detail": f"Connected as {name}"}


async def _test_deno(creds: dict) -> dict:
    token = creds.get("access_token", "")
    if not token:
        return {"success": False, "detail": "Organization token is required"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://api.deno.com/v2/apps",
            headers={"Authorization": f"Bearer {token}"},
            params={"limit": 1},
        )
    if resp.status_code == 401:
        return {"success": False, "detail": "Invalid Deno Deploy token"}
    if resp.status_code != 200:
        return {"success": False, "detail": f"Deno API error: {resp.status_code}"}
    apps = resp.json()
    count = len(apps) if isinstance(apps, list) else 0
    return {"success": True, "detail": f"Connected — {count} app(s) found"}


async def _test_upstash(creds: dict) -> dict:
    import base64
    token = creds.get("api_token", "")
    email = creds.get("email", "")
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://api.upstash.com/v2/redis/databases",
            headers={"Authorization": f"Basic {auth}"},
        )
    if resp.status_code == 401:
        return {"success": False, "detail": "Invalid Upstash credentials — check email and API key"}
    if resp.status_code != 200:
        return {"success": False, "detail": f"Upstash API error: {resp.status_code}"}
    data = resp.json()
    count = len(data) if isinstance(data, list) else 0
    return {"success": True, "detail": f"Connected — {count} Redis database(s) found"}


async def _test_turso(creds: dict) -> dict:
    db_url = creds.get("db_url", "")
    db_token = creds.get("db_token", "")
    if not db_url:
        return {"success": False, "detail": "Database URL is required"}
    # Convert libsql:// to https:// for HTTP API
    http_url = db_url.replace("libsql://", "https://")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            http_url,
            headers={
                "Authorization": f"Bearer {db_token}",
                "Content-Type": "application/json",
            },
            json={"statements": ["SELECT 1"]},
        )
    if resp.status_code == 401:
        return {"success": False, "detail": "Invalid auth token"}
    if resp.status_code != 200:
        return {"success": False, "detail": f"Turso error: HTTP {resp.status_code}"}
    # Extract DB name from hostname
    hostname = db_url.replace("libsql://", "").split(".")[0]
    db_name = hostname.rsplit("-", 1)[0] if "-" in hostname else hostname
    return {"success": True, "detail": f"Connected — {db_name}", "db_name": db_name}


async def _test_postgres(creds: dict) -> dict:
    import asyncpg
    host = creds.get("host", "localhost")
    port = int(creds.get("port", 5432))
    database = creds.get("database", "postgres")
    username = creds.get("username", "postgres")
    password = creds.get("password", "")
    try:
        conn = await asyncpg.connect(
            host=host, port=port, database=database,
            user=username, password=password,
            timeout=10, ssl="prefer",
        )
        version = await conn.fetchval("SELECT version()")
        await conn.close()
        short = version.split(",")[0] if version else "PostgreSQL"
        return {"success": True, "detail": f"Connected — {short}"}
    except Exception as e:
        return {"success": False, "detail": f"PostgreSQL connection failed: {str(e)[:200]}"}


async def _test_mysql(creds: dict) -> dict:
    import aiomysql
    host = creds.get("host", "localhost")
    port = int(creds.get("port", 3306))
    database = creds.get("database", "")
    username = creds.get("username", "root")
    password = creds.get("password", "")
    try:
        conn = await aiomysql.connect(
            host=host, port=port, db=database,
            user=username, password=password,
        )
        cur = await conn.cursor()
        await cur.execute("SELECT VERSION()")
        row = await cur.fetchone()
        await cur.close()
        conn.close()
        version = row[0] if row else "MySQL"
        return {"success": True, "detail": f"Connected — MySQL {version}"}
    except Exception as e:
        return {"success": False, "detail": f"MySQL connection failed: {str(e)[:200]}"}


async def _test_wordpress(creds: dict) -> dict:
    import base64
    base_url = creds.get("base_url", "").rstrip("/")
    username = creds.get("username", "")
    app_password = creds.get("app_password", "")
    if not base_url:
        return {"success": False, "detail": "Base URL is required"}
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
    name = data.get("name", "WordPress User")
    return {"success": True, "detail": f"Connected as {name}"}


async def _test_neon(creds: dict) -> dict:
    api_key = creds.get("api_key", "")
    if not api_key:
        return {"success": False, "detail": "API key is required"}
    neon_headers = {"Authorization": f"Bearer {api_key}"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Fetch organizations for this key
        org_resp = await client.get(
            "https://console.neon.tech/api/v2/users/me/organizations",
            headers=neon_headers,
        )
        if org_resp.status_code == 401:
            return {"success": False, "detail": "Invalid Neon API key"}
        if org_resp.status_code != 200:
            return {"success": False, "detail": f"Neon API error: {org_resp.status_code} — {org_resp.text[:300]}"}

        orgs = org_resp.json().get("organizations", [])
        org_list = [{"id": o["id"], "name": o.get("name", o["id"])} for o in orgs]

        # If org_id provided (re-test or project discovery), fetch projects
        org_id = creds.get("org_id", "")
        if org_id:
            proj_resp = await client.get(
                "https://console.neon.tech/api/v2/projects",
                headers=neon_headers,
                params={"org_id": org_id, "limit": 50},
            )
            if proj_resp.status_code != 200:
                return {"success": False, "detail": f"Neon API error fetching projects: {proj_resp.status_code}"}
            projects = proj_resp.json().get("projects", [])
            project_list = [
                {"id": p["id"], "name": p.get("name", p["id"]), "region": p.get("region_id", "")}
                for p in projects
            ]
            return {
                "success": True,
                "detail": f"Connected — {len(projects)} project(s) in org '{org_id}'",
                "neon_orgs": org_list,
                "neon_projects": project_list,
            }

    # No org_id yet — return orgs for the picker
    if len(orgs) > 0:
        return {
            "success": True,
            "detail": f"Connected — {len(orgs)} organization(s) found",
            "neon_orgs": org_list,
        }
    return {"success": True, "detail": "Connected — no organizations found"}


# =============================================================================
# Registry — add new providers here
# =============================================================================

_TESTERS: dict[str, object] = {
    "cloudflare":     _test_cloudflare,
    "supabase":       _test_supabase,
    "vercel":         _test_vercel,
    "netlify":        _test_netlify,
    "deno":           _test_deno,
    "upstash":        _test_upstash,
    "turso":          _test_turso,
    "postgres":       _test_postgres,
    "mysql":          _test_mysql,
    "wordpress_rest": _test_wordpress,
    "neon":           _test_neon,
}
