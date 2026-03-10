from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator
import uuid
import datetime

from ..models.models import EdgeProviderAccount, EdgeEngine, EdgeDatabase, EdgeCache, EdgeQueue
from ..database.config import get_db

router = APIRouter(prefix="/api/edge-providers", tags=["edge-providers"])

# =============================================================================
# Schemas
# =============================================================================

class EdgeProviderAccountCreate(BaseModel):
    name: str = Field(..., description="Name of the provider account (e.g. 'Personal Cloudflare')")
    provider: str = Field(..., description="Provider type (cloudflare, docker, vercel, etc.)")
    provider_credentials: Optional[Dict[str, Any]] = Field(None, description="API tokens, account IDs, etc.")

class EdgeProviderAccountUpdate(BaseModel):
    name: Optional[str] = None
    provider_credentials: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class EdgeProviderAccountResponse(BaseModel):
    id: str
    name: str
    provider: str
    is_active: bool
    has_credentials: bool = False
    provider_metadata: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str

    @field_validator('provider_metadata', mode='before')
    @classmethod
    def parse_metadata(cls, v):
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v

    class Config:
        from_attributes = True

# =============================================================================
# Endpoints
# =============================================================================

@router.get("/", response_model=List[EdgeProviderAccountResponse])
async def list_providers(db: Session = Depends(get_db)):
    """List all connected edge provider accounts."""
    providers = db.query(EdgeProviderAccount).order_by(EdgeProviderAccount.created_at.desc()).all()
    return [_provider_response(p) for p in providers]


def _provider_response(provider: EdgeProviderAccount) -> dict:
    """Build a serializable response dict from an ORM provider object."""
    import json
    metadata = None
    if provider.provider_metadata:
        try:
            metadata = json.loads(str(provider.provider_metadata))
        except (json.JSONDecodeError, TypeError):
            pass
    return {
        "id": str(provider.id),
        "name": str(provider.name),
        "provider": str(provider.provider),
        "is_active": bool(provider.is_active),
        "has_credentials": bool(provider.provider_credentials),
        "provider_metadata": metadata,
        "created_at": str(provider.created_at),
        "updated_at": str(provider.updated_at),
    }

@router.get("/{provider_id}")
async def get_provider(provider_id: str, db: Session = Depends(get_db)):
    """Get a specific edge provider account."""
    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
    return _provider_response(provider)

@router.post("/", status_code=201)
async def create_provider(payload: EdgeProviderAccountCreate, db: Session = Depends(get_db)):
    """Create and connect a new edge provider account.
    
    Credentials are encrypted with Fernet AES-256 before storage.
    Non-secret metadata (account_id, project_ref) is stored separately for UI display.
    """
    import json
    from ..core.security import encrypt_credentials, split_credentials, decrypt_credentials

    # Prevent duplicate: decrypt same-provider accounts and compare credentials
    # (Skip Turso — it uses manual DB registry, duplicates checked per-database)
    if payload.provider_credentials and payload.provider == "turso":
        # Turso: merge new DB into existing container account if one exists
        existing_turso = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.provider == "turso",
            EdgeProviderAccount.is_active == True
        ).first()
        if existing_turso:
            from ..core.security import decrypt_credentials, encrypt_credentials
            existing_creds = {}
            if existing_turso.provider_credentials:
                existing_creds = decrypt_credentials(str(existing_turso.provider_credentials))
            databases = existing_creds.get("databases", [])
            # Build new DB entry from incoming credentials
            new_url = payload.provider_credentials.get("db_url", "")
            new_token = payload.provider_credentials.get("db_token", "")
            db_name = payload.provider_credentials.get("_db_name", "")
            if not db_name and new_url:
                hostname = new_url.replace("libsql://", "").split(".")[0]
                db_name = hostname.rsplit("-", 1)[0] if "-" in hostname else hostname
            # Check for duplicate URL
            if any(d.get("url") == new_url for d in databases):
                raise HTTPException(
                    status_code=409,
                    detail=f"Database '{db_name}' is already registered in this Turso account"
                )
            new_db_entry = {
                "id": str(uuid.uuid4()),
                "name": db_name,
                "url": new_url,
                "token": new_token,
            }
            databases.append(new_db_entry)
            existing_creds["databases"] = databases
            existing_turso.provider_credentials = encrypt_credentials(existing_creds)  # type: ignore[assignment]
            existing_turso.updated_at = datetime.datetime.utcnow().isoformat()  # type: ignore[assignment]
            db.commit()
            return _provider_response(existing_turso)

    if payload.provider_credentials and payload.provider != "turso":
        # Determine which credential fields identify the account uniquely
        # (typically api_token, access_token, or email — the primary secret(s))
        _PRIMARY_KEYS: dict[str, list[str]] = {
            "cloudflare": ["api_token"],
            "supabase":   ["access_token", "project_ref"],
            "vercel":     ["api_token"],
            "netlify":    ["api_token"],
            "deno":       ["access_token"],
            "upstash":    ["api_token", "email"],
        }
        identity_keys = _PRIMARY_KEYS.get(payload.provider, ["api_token"])

        # Extract the incoming identity values
        incoming_identity = {
            k: payload.provider_credentials.get(k, "")
            for k in identity_keys
            if payload.provider_credentials.get(k)
        }

        if incoming_identity:
            # Query existing accounts of the same provider type
            same_provider_accounts = db.query(EdgeProviderAccount).filter(
                EdgeProviderAccount.provider == payload.provider,
            ).all()

            for acct in same_provider_accounts:
                if not acct.provider_credentials:
                    continue
                try:
                    stored_creds = decrypt_credentials(acct.provider_credentials)
                    # Compare all identity keys
                    if all(
                        stored_creds.get(k) == incoming_identity.get(k)
                        for k in incoming_identity
                    ):
                        raise HTTPException(
                            status_code=409,
                            detail=f"This {payload.provider} account is already connected as '{acct.name}'"
                        )
                except HTTPException:
                    raise  # Re-raise the 409
                except Exception:
                    continue  # Skip accounts we can't decrypt

    now = datetime.datetime.utcnow().isoformat()
    
    credentials_str = None
    metadata_str = None
    if payload.provider_credentials:
        secrets, metadata = split_credentials(payload.provider, payload.provider_credentials)
        if secrets:
            credentials_str = encrypt_credentials(secrets)
        if metadata:
            metadata_str = json.dumps(metadata)
    
    provider = EdgeProviderAccount(
        id=str(uuid.uuid4()),
        name=payload.name,
        provider=payload.provider,
        provider_credentials=credentials_str,
        provider_metadata=metadata_str,
        is_active=True,
        created_at=now,
        updated_at=now
    )
    
    db.add(provider)
    db.commit()
    db.refresh(provider)

    # For Supabase: auto-fetch API keys from Management API
    # Secrets (anon_key, service_role_key) → merge into encrypted provider_credentials
    # Metadata (api_url) → merge into plaintext provider_metadata
    if payload.provider == "supabase" and payload.provider_credentials:
        access_token = payload.provider_credentials.get("access_token", "")
        project_ref = payload.provider_credentials.get("project_ref", "")
        if access_token and project_ref:
            try:
                from ..services.supabase_management import get_api_keys
                api_keys = await get_api_keys(access_token, project_ref)
                # Split fetched keys: secrets vs metadata
                fetched_secrets, fetched_meta = split_credentials("supabase", api_keys)
                # Merge new metadata (e.g. api_url) into existing metadata
                existing_meta = {}
                if metadata_str:
                    try:
                        existing_meta = json.loads(metadata_str)
                    except (json.JSONDecodeError, TypeError):
                        pass
                existing_meta.update(fetched_meta)
                provider.provider_metadata = json.dumps(existing_meta)  # type: ignore[assignment]
                # Merge new secrets (anon_key, service_role_key) into existing encrypted creds
                existing_secrets = {}
                if credentials_str:
                    from ..core.security import decrypt_credentials
                    existing_secrets = decrypt_credentials(credentials_str)
                existing_secrets.update(fetched_secrets)
                provider.provider_credentials = encrypt_credentials(existing_secrets)  # type: ignore[assignment]
                db.commit()
                db.refresh(provider)
            except Exception as e:
                print(f"Warning: Could not auto-fetch Supabase API keys: {e}")

    return _provider_response(provider)

@router.put("/{provider_id}")
async def update_provider(provider_id: str, payload: EdgeProviderAccountUpdate, db: Session = Depends(get_db)):
    """Update a provider account. Credentials are re-encrypted on change."""
    import json
    from ..core.security import encrypt_credentials, split_credentials
    
    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
        
    if payload.name is not None:
        provider.name = payload.name  # type: ignore[assignment]
    if payload.is_active is not None:
        provider.is_active = payload.is_active  # type: ignore[assignment]
    if payload.provider_credentials is not None:
        secrets, metadata = split_credentials(str(provider.provider), payload.provider_credentials)
        if secrets:
            provider.provider_credentials = encrypt_credentials(secrets)  # type: ignore[assignment]
        if metadata:
            provider.provider_metadata = json.dumps(metadata)  # type: ignore[assignment]
        
    provider.updated_at = datetime.datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()
    db.refresh(provider)
    
    return _provider_response(provider)

@router.delete("/{provider_id}", status_code=204)
async def delete_provider(provider_id: str, db: Session = Depends(get_db)):
    """Delete a provider account if no engines depend on it."""
    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
        
    # Unlink engines that reference this provider
    db.query(EdgeEngine).filter(EdgeEngine.edge_provider_id == provider_id).update(
        {"edge_provider_id": None}, synchronize_session="fetch"
    )

    # Null out FK references on edge infrastructure resources
    db.query(EdgeDatabase).filter(EdgeDatabase.provider_account_id == provider_id).update(
        {"provider_account_id": None}, synchronize_session="fetch"
    )
    db.query(EdgeCache).filter(EdgeCache.provider_account_id == provider_id).update(
        {"provider_account_id": None}, synchronize_session="fetch"
    )
    db.query(EdgeQueue).filter(EdgeQueue.provider_account_id == provider_id).update(
        {"provider_account_id": None}, synchronize_session="fetch"
    )

    db.delete(provider)
    db.commit()
    return None


# =============================================================================
# Re-test — validate STORED credentials by provider ID (server-side decrypt)
# =============================================================================

@router.post("/retest/{provider_id}")
async def retest_provider(provider_id: str, db: Session = Depends(get_db)):
    """Re-validate an existing provider's credentials.

    Decrypts stored secrets server-side and calls the same validation logic.
    """
    from ..core.security import get_provider_creds

    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")

    creds = get_provider_creds(provider_id, db)
    if not creds:
        return {"success": False, "detail": "No credentials stored for this provider"}

    # Delegate to the same test_connection logic
    payload = TestConnectionRequest(provider=str(provider.provider), credentials=creds)
    return await test_connection(payload)


# =============================================================================
# Test Connection — validate credentials against provider API before saving
# =============================================================================

class TestConnectionRequest(BaseModel):
    provider: str = Field(..., description="Provider type (cloudflare, supabase, vercel, netlify, deno, upstash)")
    credentials: Dict[str, Any] = Field(..., description="Provider credentials to validate")


@router.post("/test-connection")
async def test_connection(payload: TestConnectionRequest):
    """Validate provider credentials by making a lightweight API call.

    Does NOT create a record — just verifies the credentials work.
    Called before saving to prevent storing invalid tokens.
    """
    import httpx

    provider = payload.provider
    creds = payload.credentials

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:

            if provider == "cloudflare":
                token = creds.get("api_token", "")
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

            elif provider == "supabase":
                from ..services.supabase_management import validate_token
                token = creds.get("access_token", "")
                project_ref = creds.get("project_ref", "")
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
                        result = await validate_token(token)
                        count = result.get("project_count", 0)
                        return {"success": True, "detail": f"Connected — {count} project(s) found", "projects": result.get("projects", [])}
                except PermissionError:
                    return {"success": False, "detail": "Invalid Supabase access token"}
                except Exception as e:
                    return {"success": False, "detail": f"Supabase API error: {str(e)}"}

            elif provider == "vercel":
                token = creds.get("api_token", "")
                headers = {"Authorization": f"Bearer {token}"}
                resp = await client.get("https://api.vercel.com/v2/user", headers=headers)
                if resp.status_code != 200:
                    return {"success": False, "detail": "Invalid Vercel API token"}
                data = resp.json()
                name = data.get("user", {}).get("username", "Vercel User")
                return {"success": True, "detail": f"Connected as {name}"}

            elif provider == "netlify":
                token = creds.get("api_token", "")
                resp = await client.get(
                    "https://api.netlify.com/api/v1/user",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if resp.status_code != 200:
                    return {"success": False, "detail": "Invalid Netlify token"}
                data = resp.json()
                name = data.get("full_name", data.get("email", "Netlify User"))
                return {"success": True, "detail": f"Connected as {name}"}

            elif provider == "deno":
                token = creds.get("access_token", "")
                if not token:
                    return {"success": False, "detail": "Organization token is required"}
                # Use v2 API — token is org-scoped, no org_id needed
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

            elif provider == "upstash":
                token = creds.get("api_token", "")
                email = creds.get("email", "")
                # Use list-databases as the validation call (lightweight, read-only)
                resp = await client.get(
                    "https://api.upstash.com/v2/redis/databases",
                    headers={"Authorization": f"Basic {__import__('base64').b64encode(f'{email}:{token}'.encode()).decode()}"},
                )
                if resp.status_code == 401:
                    return {"success": False, "detail": "Invalid Upstash credentials — check email and API key"}
                if resp.status_code != 200:
                    return {"success": False, "detail": f"Upstash API error: {resp.status_code}"}
                data = resp.json()
                count = len(data) if isinstance(data, list) else 0
                return {"success": True, "detail": f"Connected — {count} Redis database(s) found"}

            elif provider == "turso":
                db_url = creds.get("db_url", "")
                db_token = creds.get("db_token", "")
                if not db_url:
                    return {"success": False, "detail": "Database URL is required"}
                # Convert libsql:// to https:// for HTTP API
                http_url = db_url.replace("libsql://", "https://")
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
                # Extract DB name from hostname (e.g. "newdb-drmoyassine.aws-eu-west-1.turso.io" → "newdb")
                hostname = db_url.replace("libsql://", "").split(".")[0]  # "newdb-drmoyassine"
                db_name = hostname.rsplit("-", 1)[0] if "-" in hostname else hostname
                return {"success": True, "detail": f"Connected — {db_name}", "db_name": db_name}

            elif provider == "postgres":
                # Validate by attempting a lightweight TCP/asyncpg connection
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

            elif provider == "mysql":
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

            elif provider == "wordpress_rest":
                base_url = creds.get("base_url", "").rstrip("/")
                username = creds.get("username", "")
                app_password = creds.get("app_password", "")
                if not base_url:
                    return {"success": False, "detail": "Base URL is required"}
                import base64
                auth = base64.b64encode(f"{username}:{app_password}".encode()).decode()
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

            elif provider == "neon":
                api_key = creds.get("api_key", "")
                if not api_key:
                    return {"success": False, "detail": "API key is required"}
                neon_headers = {"Authorization": f"Bearer {api_key}"}

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

            else:
                return {"success": False, "detail": f"Unsupported provider: {provider}"}

    except httpx.TimeoutException:
        return {"success": False, "detail": "Connection timed out — check your network"}
    except Exception as e:
        return {"success": False, "detail": f"Connection failed: {str(e)}"}


# =============================================================================
# Discover — list resources for a provider after token validation
# =============================================================================

@router.post("/discover-by-account/{account_id}")
async def discover_by_account(account_id: str, db: Session = Depends(get_db)):
    """Discover resources using stored credentials from a Connected Account.
    
    Decrypts saved credentials server-side and calls the same discovery logic.
    For Turso: returns manually-registered databases from stored JSON.
    Used by Edge DB/Cache/Queue forms to list available resources.
    """
    from ..core.security import get_provider_creds

    provider_row = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == account_id).first()
    if not provider_row:
        raise HTTPException(status_code=404, detail="Provider account not found")

    creds = get_provider_creds(account_id, db)
    if not creds:
        return {"success": False, "detail": "No credentials stored for this account"}

    # Turso: return manually-registered databases from stored JSON
    if str(provider_row.provider) == "turso":
        databases = creds.get("databases", [])
        return {
            "success": True,
            "resources": [
                {
                    "id": d.get("id", ""),
                    "name": d.get("name", ""),
                    "type": "turso_db",
                    "db_url": d.get("url", ""),
                    "hostname": d.get("url", "").replace("libsql://", "") if d.get("url", "").startswith("libsql://") else "",
                    "token": d.get("token", ""),
                    "last_tested": d.get("last_tested"),
                    "test_ok": d.get("test_ok"),
                }
                for d in databases
            ],
        }

    # All other providers: delegate to external API discovery
    payload = DiscoverRequest(provider=str(provider_row.provider), credentials=creds)
    return await discover_resources(payload)


class DiscoverRequest(BaseModel):
    provider: str = Field(..., description="Provider type")
    credentials: Dict[str, Any] = Field(..., description="Provider credentials")


@router.post("/discover")
async def discover_resources(payload: DiscoverRequest):
    """Discover resources (projects, databases, sites) available with the given credentials.

    Used during the connect flow to let users pick which project/resource to bind.
    """
    provider = payload.provider
    creds = payload.credentials

    try:
        if provider == "supabase":
            from ..services.supabase_management import list_projects
            token = creds.get("access_token", "")
            projects = await list_projects(token)
            return {
                "success": True,
                "resources": [
                    {
                        "ref": p.get("id", ""),
                        "name": p.get("name", ""),
                        "region": p.get("region", ""),
                        "status": p.get("status", ""),
                    }
                    for p in projects
                ],
            }

        elif provider == "cloudflare":
            import httpx
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

        elif provider == "netlify":
            import httpx
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

        elif provider == "upstash":
            import httpx, base64
            token = creds.get("api_token", "")
            email = creds.get("email", "")
            auth = base64.b64encode(f"{email}:{token}".encode()).decode()
            async with httpx.AsyncClient(timeout=15.0) as client:
                # Discover Redis databases (uses Management API Basic auth)
                redis_resp = await client.get(
                    "https://api.upstash.com/v2/redis/databases",
                    headers={"Authorization": f"Basic {auth}"},
                )
                # Discover QStash — get the real QStash token from the Developer API
                # (the management API key != QStash Bearer token)
                qstash_ok = False
                qstash_keys_data = {}
                qstash_token = ""
                try:
                    # Step 1: Get QStash user info (returns the real qstash token)
                    user_resp = await client.get(
                        "https://api.upstash.com/v2/qstash/user",
                        headers={"Authorization": f"Basic {auth}"},
                    )
                    if user_resp.status_code == 200:
                        user_data = user_resp.json()
                        qstash_token = user_data.get("token", "")
                        if qstash_token:
                            qstash_ok = True
                            # Step 2: Get signing keys using the real QStash token
                            keys_resp = await client.get(
                                "https://qstash.upstash.io/v2/keys",
                                headers={"Authorization": f"Bearer {qstash_token}"},
                            )
                            if keys_resp.status_code == 200:
                                qstash_keys_data = keys_resp.json()
                except Exception:
                    pass  # QStash discovery is best-effort

            redis_dbs = redis_resp.json() if redis_resp.status_code == 200 else []
            resources = [
                {"id": d.get("database_id"), "name": d.get("database_name"), "type": "redis",
                 "endpoint": d.get("endpoint"), "rest_url": d.get("rest_url"),
                 "rest_token": d.get("rest_token"), "region": d.get("region")}
                for d in (redis_dbs if isinstance(redis_dbs, list) else [])
            ]
            if qstash_ok:
                qstash_entry: dict = {
                    "id": "qstash", "name": "QStash", "type": "qstash",
                    "endpoint": "https://qstash.upstash.io",
                    "token": qstash_token,
                    "signing_key": qstash_keys_data.get("current", ""),
                    "next_signing_key": qstash_keys_data.get("next", ""),
                }
                resources.append(qstash_entry)
            return {"success": True, "resources": resources}

        elif provider == "turso":
            import httpx
            token = creds.get("api_token", "")
            async with httpx.AsyncClient(timeout=15.0) as client:
                # Get organizations first
                org_resp = await client.get(
                    "https://api.turso.tech/v1/organizations",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if org_resp.status_code != 200:
                    return {"success": False, "detail": f"Turso API error: {org_resp.status_code}"}
                orgs = org_resp.json()
                # Discover databases for each org
                resources = []
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

        elif provider == "neon":
            import httpx
            token = creds.get("api_key", "")
            org_id = creds.get("org_id", "")
            async with httpx.AsyncClient(timeout=15.0) as client:
                neon_headers = {"Authorization": f"Bearer {token}"}

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
                params = {"limit": 50}
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
            resources = []
            for p in projects:
                project_id = p.get("id", "")
                conn_uri = ""
                # Fetch connection URI for this project
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

        else:
            return {"success": False, "detail": f"Discovery not supported for provider: {provider}"}

    except PermissionError as e:
        return {"success": False, "detail": str(e)}
    except Exception as e:
        return {"success": False, "detail": f"Discovery failed: {str(e)}"}


# =============================================================================
# Create Resource — create a new resource via provider management API
# =============================================================================

class CreateResourceRequest(BaseModel):
    resource_type: str = Field(..., description="Type of resource to create: 'redis'")
    name: str = Field(..., description="Name for the new resource")
    region: str = Field(default="us-east-1", description="Region for the resource")

@router.post("/create-resource-by-account/{account_id}")
async def create_resource_by_account(
    account_id: str,
    payload: CreateResourceRequest,
    db: Session = Depends(get_db),
):
    """Create a new resource (Redis DB) via Connected Account's management API."""
    from ..core.security import get_provider_creds

    provider_row = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == account_id).first()
    if not provider_row:
        raise HTTPException(status_code=404, detail="Provider account not found")

    creds = get_provider_creds(account_id, db)
    if not creds:
        return {"success": False, "detail": "No credentials stored"}

    provider = str(provider_row.provider)

    try:
        if provider == "upstash" and payload.resource_type == "redis":
            import httpx, base64
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
                        "database_name": payload.name,
                        "platform": "aws",
                        "primary_region": payload.region,
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
                        "name": data.get("database_name", payload.name),
                        "type": "redis",
                        "endpoint": data.get("endpoint", ""),
                        "rest_url": data.get("rest_url", ""),
                        "rest_token": data.get("rest_token", ""),
                        "region": data.get("region", payload.region),
                    },
                }
            else:
                return {"success": False, "detail": f"Upstash API error {resp.status_code}: {resp.text[:300]}"}

        else:
            return {"success": False, "detail": f"Resource creation not supported for {provider}/{payload.resource_type}"}

    except Exception as e:
        return {"success": False, "detail": f"Create failed: {str(e)}"}


# =============================================================================
# Turso — Manual Database Registry (CRUD within a Turso provider account)
# =============================================================================

class TursoDatabaseEntry(BaseModel):
    name: str = Field(..., description="Display name for the database")
    url: str = Field(..., description="libsql:// URL for the database")
    token: str = Field(..., description="Database auth token")


@router.post("/{account_id}/turso-databases")
async def add_turso_database(
    account_id: str,
    payload: TursoDatabaseEntry,
    db: Session = Depends(get_db),
):
    """Add a database to a Turso provider account (manual registry)."""
    import json
    from ..core.security import decrypt_credentials, encrypt_credentials

    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == account_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
    if str(provider.provider) != "turso":
        raise HTTPException(status_code=400, detail="Only Turso accounts support database registry")

    # Decrypt existing credentials
    creds = {}
    if provider.provider_credentials:
        creds = decrypt_credentials(provider.provider_credentials)
    databases: list = creds.get("databases", [])

    # Duplicate check: same URL
    for existing_db in databases:
        if existing_db.get("url", "").strip() == payload.url.strip():
            raise HTTPException(
                status_code=409,
                detail=f"A database with this URL already exists ('{existing_db.get('name', '')}')"
            )

    # Add new entry
    new_entry = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "url": payload.url.strip(),
        "token": payload.token,
        "last_tested": None,
        "test_ok": None,
    }
    databases.append(new_entry)
    creds["databases"] = databases

    # Re-encrypt and save
    provider.provider_credentials = encrypt_credentials(creds)  # type: ignore[assignment]
    provider.updated_at = datetime.datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()

    return {"success": True, "database": {k: v for k, v in new_entry.items() if k != "token"}}


@router.delete("/{account_id}/turso-databases/{db_id}")
async def remove_turso_database(
    account_id: str,
    db_id: str,
    db: Session = Depends(get_db),
):
    """Remove a database from a Turso provider account."""
    import json
    from ..core.security import decrypt_credentials, encrypt_credentials

    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == account_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
    if str(provider.provider) != "turso":
        raise HTTPException(status_code=400, detail="Only Turso accounts support database registry")

    creds = {}
    if provider.provider_credentials:
        creds = decrypt_credentials(provider.provider_credentials)
    databases: list = creds.get("databases", [])

    # Find and remove
    original_len = len(databases)
    databases = [d for d in databases if d.get("id") != db_id]
    if len(databases) == original_len:
        raise HTTPException(status_code=404, detail="Database entry not found")

    creds["databases"] = databases
    provider.provider_credentials = encrypt_credentials(creds)  # type: ignore[assignment]
    provider.updated_at = datetime.datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()

    return {"success": True, "detail": "Database removed"}


@router.post("/{account_id}/turso-databases/{db_id}/test")
async def test_turso_database(
    account_id: str,
    db_id: str,
    db: Session = Depends(get_db),
):
    """Test connection to a specific Turso database within an account."""
    from ..core.security import decrypt_credentials, encrypt_credentials

    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == account_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
    if str(provider.provider) != "turso":
        raise HTTPException(status_code=400, detail="Only Turso accounts support database registry")

    creds = {}
    if provider.provider_credentials:
        creds = decrypt_credentials(provider.provider_credentials)
    databases: list = creds.get("databases", [])

    # Find the target database
    target = None
    target_idx = -1
    for i, d in enumerate(databases):
        if d.get("id") == db_id:
            target = d
            target_idx = i
            break
    if target is None:
        raise HTTPException(status_code=404, detail="Database entry not found")

    db_url = target.get("url", "")
    db_token = target.get("token", "")
    now = datetime.datetime.utcnow().isoformat() + "Z"

    # Test via HTTP endpoint (libsql URLs support HTTP)
    try:
        import httpx
        # Convert libsql:// to https:// for HTTP API
        http_url = db_url.replace("libsql://", "https://")
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                http_url,
                headers={
                    "Authorization": f"Bearer {db_token}",
                    "Content-Type": "application/json",
                },
                json={"statements": ["SELECT 1"]},
            )

        test_ok = resp.status_code == 200
        detail = "Connected successfully" if test_ok else f"HTTP {resp.status_code}: {resp.text[:200]}"

    except Exception as e:
        test_ok = False
        detail = f"Connection failed: {str(e)[:200]}"

    # Update test result in stored credentials
    databases[target_idx]["last_tested"] = now
    databases[target_idx]["test_ok"] = test_ok
    creds["databases"] = databases
    provider.provider_credentials = encrypt_credentials(creds)  # type: ignore[assignment]
    provider.updated_at = now  # type: ignore[assignment]
    db.commit()

    return {"success": test_ok, "detail": detail}
