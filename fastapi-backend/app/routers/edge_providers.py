from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import uuid
import datetime

from ..models.models import EdgeProviderAccount, EdgeEngine, EdgeDatabase, EdgeCache, EdgeQueue
from ..database.config import get_db
from ..schemas.edge_providers import (
    EdgeProviderAccountCreate, EdgeProviderAccountUpdate, EdgeProviderAccountResponse,
    TestConnectionRequest, DiscoverRequest,
    CreateResourceRequest, TursoDatabaseEntry,
)
from ..services.provider_tester import test_provider_connection
from ..services.provider_discovery import discover_resources as _discover_resources, create_resource

router = APIRouter(prefix="/api/edge-providers", tags=["edge-providers"])


# =============================================================================
# Helpers
# =============================================================================

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


# =============================================================================
# CRUD Endpoints
# =============================================================================

@router.get("/", response_model=List[EdgeProviderAccountResponse])
async def list_providers(db: Session = Depends(get_db)):
    """List all connected edge provider accounts."""
    providers = db.query(EdgeProviderAccount).order_by(EdgeProviderAccount.created_at.desc()).all()
    return [_provider_response(p) for p in providers]


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
            same_provider_accounts = db.query(EdgeProviderAccount).filter(
                EdgeProviderAccount.provider == payload.provider,
            ).all()

            for acct in same_provider_accounts:
                if not acct.provider_credentials:
                    continue
                try:
                    stored_creds = decrypt_credentials(acct.provider_credentials)
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
    if payload.provider == "supabase" and payload.provider_credentials:
        access_token = payload.provider_credentials.get("access_token", "")
        project_ref = payload.provider_credentials.get("project_ref", "")
        if access_token and project_ref:
            try:
                from ..services.supabase_management import get_api_keys
                api_keys = await get_api_keys(access_token, project_ref)
                fetched_secrets, fetched_meta = split_credentials("supabase", api_keys)
                existing_meta = {}
                if metadata_str:
                    try:
                        existing_meta = json.loads(metadata_str)
                    except (json.JSONDecodeError, TypeError):
                        pass
                existing_meta.update(fetched_meta)
                provider.provider_metadata = json.dumps(existing_meta)  # type: ignore[assignment]
                existing_secrets = {}
                if credentials_str:
                    existing_secrets = decrypt_credentials(credentials_str)
                existing_secrets.update(fetched_secrets)
                provider.provider_credentials = encrypt_credentials(existing_secrets)  # type: ignore[assignment]
                db.commit()
                db.refresh(provider)
            except Exception as e:
                print(f"Warning: Could not auto-fetch Supabase API keys: {e}")

    # ── Plan tier detection ──────────────────────────────────────────────
    # Detect the user's plan tier at connect time and persist in metadata.
    # Used by log persistence to determine retention limits.
    await _detect_and_store_plan_tier(provider, payload, db)

    return _provider_response(provider)


async def _detect_and_store_plan_tier(
    provider: EdgeProviderAccount,
    payload: EdgeProviderAccountCreate,
    db: Session,
) -> None:
    """Detect provider plan tier and store in provider_metadata.plan_tier."""
    import json
    import httpx

    provider_type = payload.provider
    creds = payload.provider_credentials or {}
    plan_tier: str | None = None

    try:
        if provider_type == "supabase":
            plan_tier = await _detect_supabase_plan(creds)
        elif provider_type == "cloudflare":
            plan_tier = await _detect_cf_plan(creds)
        elif provider_type == "deno":
            plan_tier = "free"  # No plan API — default to free
    except Exception as e:
        print(f"[Plan Detection] Warning: {provider_type} plan detection failed: {e}")

    if plan_tier:
        existing_meta = {}
        if provider.provider_metadata:
            try:
                existing_meta = json.loads(str(provider.provider_metadata))
            except (json.JSONDecodeError, TypeError):
                pass
        existing_meta["plan_tier"] = plan_tier
        provider.provider_metadata = json.dumps(existing_meta)  # type: ignore[assignment]
        db.commit()
        print(f"[Plan Detection] {provider_type}: detected plan_tier={plan_tier}")


async def _detect_supabase_plan(creds: dict) -> str | None:
    """Detect Supabase plan via GET /v1/organizations/{org_id}.

    Returns: 'free', 'pro', 'team', or 'enterprise'.
    """
    import httpx

    access_token = creds.get("access_token", "")
    if not access_token:
        return None

    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        # List orgs to find org_id
        resp = await client.get(
            "https://api.supabase.com/v1/organizations",
            headers=headers,
        )
        if resp.status_code != 200:
            return None
        orgs = resp.json()
        if not orgs:
            return None

        # Get the first org's details (includes plan field)
        org_id = orgs[0].get("id", "")
        if not org_id:
            return None

        resp2 = await client.get(
            f"https://api.supabase.com/v1/organizations/{org_id}",
            headers=headers,
        )
        if resp2.status_code != 200:
            return None
        return resp2.json().get("plan", "free")


async def _detect_cf_plan(creds: dict) -> str | None:
    """Detect Cloudflare Workers plan via account-settings.

    Returns: 'free' or 'paid' (based on default_usage_model).
    """
    import httpx

    api_token = creds.get("api_token", "")
    if not api_token:
        return None

    headers = {"Authorization": f"Bearer {api_token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Get account ID first
        resp = await client.get(
            "https://api.cloudflare.com/client/v4/accounts",
            headers=headers,
        )
        if resp.status_code != 200:
            return None
        accounts = resp.json().get("result", [])
        if not accounts:
            return None
        account_id = accounts[0].get("id", "")

        # Get Workers account settings (usage model = plan indicator)
        resp2 = await client.get(
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/account-settings",
            headers=headers,
        )
        if resp2.status_code != 200:
            return None
        usage_model = resp2.json().get("result", {}).get("default_usage_model", "")
        # "standard" or "bundled" = paid, otherwise free
        if usage_model in ("standard", "bundled"):
            return "paid"
        return "free"


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

    return await test_provider_connection(str(provider.provider), creds)


# =============================================================================
# Credentials — internal endpoint for cross-service credential resolution
# =============================================================================

@router.get("/{provider_id}/credentials")
def get_credentials(provider_id: str, db: Session = Depends(get_db)):
    """Return decrypted credentials for a provider account.

    Internal endpoint used by the db-synchronizer credential bridge to resolve
    datasource credentials from connected accounts. Avoids duplicating
    encryption/decryption logic across services.
    """
    from ..core.security import get_provider_creds

    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")

    creds = get_provider_creds(provider_id, db)
    if not creds:
        raise HTTPException(status_code=404, detail="No credentials stored for this provider")

    return creds


# =============================================================================
# Test Connection — validate credentials against provider API before saving
# =============================================================================

@router.post("/test-connection")
async def test_connection(payload: TestConnectionRequest):
    """Validate provider credentials by making a lightweight API call.

    Does NOT create a record — just verifies the credentials work.
    Called before saving to prevent storing invalid tokens.
    """
    return await test_provider_connection(payload.provider, payload.credentials)


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

    # All other providers: delegate to discovery service
    return await _discover_resources(str(provider_row.provider), creds)


@router.post("/discover")
async def discover_resources_endpoint(payload: DiscoverRequest):
    """Discover resources (projects, databases, sites) available with the given credentials.

    Used during the connect flow to let users pick which project/resource to bind.
    """
    return await _discover_resources(payload.provider, payload.credentials)


# =============================================================================
# Create Resource — create a new resource via provider management API
# =============================================================================

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

    return await create_resource(
        str(provider_row.provider), payload.resource_type, creds,
        name=payload.name, region=payload.region,
    )


# =============================================================================
# Turso — Manual Database Registry (CRUD within a Turso provider account)
# =============================================================================

@router.post("/{account_id}/turso-databases")
async def add_turso_database(
    account_id: str,
    payload: TursoDatabaseEntry,
    db: Session = Depends(get_db),
):
    """Add a database to a Turso provider account (manual registry)."""
    from ..core.security import decrypt_credentials, encrypt_credentials

    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == account_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
    if str(provider.provider) != "turso":
        raise HTTPException(status_code=400, detail="Only Turso accounts support database registry")

    # Decrypt existing credentials
    creds: dict = {}
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
    from ..core.security import decrypt_credentials, encrypt_credentials

    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == account_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
    if str(provider.provider) != "turso":
        raise HTTPException(status_code=400, detail="Only Turso accounts support database registry")

    creds: dict = {}
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

    creds: dict = {}
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


# =============================================================================
# Table Discovery — list database tables from a connected account
# =============================================================================

@router.get("/accounts/{account_id}/tables")
async def list_account_tables(account_id: str, db: Session = Depends(get_db)):
    """List database tables from a connected account's credentials.

    Resolves credentials directly from EdgeProviderAccount — no sync datasource needed.
    Used by the Users panel (Auth Provider → Contacts Database → Table selector).
    
    Supported providers:
    - supabase: calls /rest/v1/rpc/frontbase_get_schema_info
    - neon: discovers projects then uses SQL via Neon serverless driver
    - postgres/mysql: direct connection via info schema (future)
    """
    import httpx
    from ..core.credential_resolver import get_provider_context_by_id

    try:
        ctx = get_provider_context_by_id(db, account_id)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Provider account not found")

    provider_type = ctx.get("provider_type", "")
    tables: list = []

    if provider_type == "supabase":
        tables = await _list_supabase_tables(ctx)
    elif provider_type in ("neon", "postgres"):
        tables = await _list_postgres_tables(ctx, provider_type)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider_type}' does not support table listing"
        )

    return tables


async def _list_supabase_tables(ctx: dict) -> list:
    """List tables from Supabase via frontbase_get_schema_info RPC."""
    import httpx

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
    import httpx

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


# =============================================================================
# List Engines — generic multi-provider engine listing
# =============================================================================

async def _list_cf_engines(creds: dict) -> list[dict]:
    """List Cloudflare Workers using existing cloudflare_api helper."""
    from ..services import cloudflare_api
    token = creds.get("api_token", "")
    account_id = creds.get("account_id", "")
    if not token or not account_id:
        return []
    workers = cloudflare_api.list_workers(token, account_id)
    return [
        {
            "name": w["name"],
            "url": w.get("url", ""),
            "provider": "cloudflare",
            "deployed_at": w.get("modified_on", ""),
            "created_at": w.get("created_on", ""),
        }
        for w in workers
    ]


async def _list_supabase_engines(creds: dict) -> list[dict]:
    """List Supabase Edge Functions via Management API."""
    import httpx
    token = creds.get("access_token", "")
    project_ref = creds.get("project_ref", "")
    if not token or not project_ref:
        return []
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"https://api.supabase.com/v1/projects/{project_ref}/functions",
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code != 200:
        return []
    functions = resp.json()
    if not isinstance(functions, list):
        return []
    return [
        {
            "name": f.get("name", f.get("slug", "")),
            "url": f"https://{project_ref}.supabase.co/functions/v1/{f.get('slug', '')}",
            "provider": "supabase",
            "deployed_at": _epoch_to_iso(f.get("updated_at")),
            "created_at": _epoch_to_iso(f.get("created_at")),
        }
        for f in functions
    ]


async def _list_deno_engines(creds: dict) -> list[dict]:
    """List Deno Deploy apps via v2 API."""
    import httpx
    token = creds.get("access_token", "")
    if not token:
        return []
    apps: list[dict] = []
    cursor: str | None = None
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Paginate up to 5 pages (150 apps max)
        for _ in range(5):
            params: dict[str, Any] = {"limit": 30}
            if cursor:
                params["cursor"] = cursor
            resp = await client.get(
                "https://api.deno.com/v2/apps",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            if resp.status_code != 200:
                break
            page = resp.json()
            if not isinstance(page, list) or len(page) == 0:
                break
            for a in page:
                slug = a.get("slug", "")
                apps.append({
                    "name": slug,
                    "url": f"https://{slug}.deno.dev",
                    "provider": "deno",
                    "deployed_at": a.get("updated_at", ""),
                    "created_at": a.get("created_at", ""),
                })
            # Check Link header for next cursor
            link = resp.headers.get("link", "")
            if 'rel="next"' not in link:
                break
            import re
            m = re.search(r'cursor=([^&>]+)', link)
            cursor = m.group(1) if m else None
            if not cursor:
                break
    return apps


def _epoch_to_iso(val: Any) -> str:
    """Convert Supabase epoch (seconds, millis, or micros) to ISO string, or pass through strings."""
    if val is None:
        return ""
    if isinstance(val, (int, float)):
        ts = float(val)
        # Supabase may return seconds, milliseconds, or microseconds
        if ts > 1e15:       # microseconds
            ts = ts / 1e6
        elif ts > 1e12:     # milliseconds
            ts = ts / 1e3
        try:
            return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()
        except (OSError, OverflowError, ValueError):
            return str(val)
    return str(val)


async def _list_vercel_engines(creds: dict) -> list[dict]:
    """List Vercel projects via REST API."""
    from ..services import vercel_deploy_api
    token = creds.get("api_token", "")
    team_id = creds.get("team_id")
    if not token:
        return []
    projects = await vercel_deploy_api.list_projects(token, team_id)
    return [
        {
            "name": p.get("name", ""),
            "url": f"https://{p.get('name', '')}.vercel.app",
            "provider": "vercel",
            "deployed_at": _epoch_to_iso(p.get("updatedAt")),
            "created_at": _epoch_to_iso(p.get("createdAt")),
        }
        for p in projects
    ]


_ENGINE_LISTERS: dict[str, Any] = {
    "cloudflare": _list_cf_engines,
    "supabase": _list_supabase_engines,
    "deno": _list_deno_engines,
    "vercel": _list_vercel_engines,
}


@router.post("/{account_id}/list-engines")
async def list_engines_for_provider(account_id: str, db: Session = Depends(get_db)):
    """List engines/functions/apps from a connected edge provider.

    Dispatches to provider-specific listing API and returns unified shape.
    """
    from ..core.security import get_provider_creds

    provider_row = db.query(EdgeProviderAccount).filter(
        EdgeProviderAccount.id == account_id
    ).first()
    if not provider_row:
        raise HTTPException(status_code=404, detail="Provider account not found")

    provider_type = str(provider_row.provider)
    lister = _ENGINE_LISTERS.get(provider_type)
    if not lister:
        return {"success": False, "detail": f"Engine listing not supported for {provider_type}", "engines": []}

    creds = get_provider_creds(account_id, db)
    if not creds:
        return {"success": False, "detail": "No credentials stored for this account", "engines": []}

    try:
        engines = await lister(creds)
        return {"success": True, "engines": engines}
    except Exception as e:
        return {"success": False, "detail": f"Failed to list engines: {str(e)[:300]}", "engines": []}
