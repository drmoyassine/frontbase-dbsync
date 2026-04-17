from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import uuid
import datetime

from ..models.models import EdgeProviderAccount, EdgeEngine, EdgeDatabase, EdgeCache, EdgeQueue
from ..database.config import get_db
from app.database.utils import get_project
from app.middleware.tenant_context import TenantContext, get_tenant_context
from ..schemas.edge_providers import (
    EdgeProviderAccountCreate, EdgeProviderAccountUpdate, EdgeProviderAccountResponse,
    TestConnectionRequest, DiscoverRequest,
    CreateResourceRequest, TursoDatabaseEntry,
)
from ..services.provider_tester import test_provider_connection
from ..services.provider_discovery import discover_resources as _discover_resources, create_resource

router = APIRouter(prefix="/api/edge-providers", tags=["edge-providers"])


def _scoped_provider_query(db: Session, ctx: TenantContext | None):
    q = _scoped_provider_query(db, ctx)
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            q = q.filter(EdgeProviderAccount.project_id == project.id)
        else:
            q = q.filter(EdgeProviderAccount.id == "not-found")
    return q



# =============================================================================
# Helpers
# =============================================================================

def _provider_response(provider: EdgeProviderAccount) -> dict:
    """Build a serializable response dict from an ORM provider object."""
    import json
    metadata = None
    if str(provider.provider_metadata or ""):
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
# Workspace Agent — Stateless JWT Hydration
# =============================================================================

@router.get("/workspace-agent-token")
def get_workspace_agent_token(db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Generate a stateless JWT for the Workspace Agent using the active GPU provider."""
    from jose import jwt
    import os
    from ..core.security import get_provider_creds

    # Look for a provider explicitly marked as default
    providers = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.is_active == True).all()
    default_provider = None
    fallback_provider = None

    import json
    for p in providers:
        if str(p.provider) in ("openai", "anthropic", "workers_ai", "ollama"):
            fallback_provider = p
            if p.provider_metadata:
                try:
                    meta = json.loads(str(p.provider_metadata))
                    if meta.get("is_workspace_default"):
                        default_provider = p
                        break
                except Exception:
                    pass

    target = default_provider or fallback_provider
    if not target:
        return {"token": None}

    creds = get_provider_creds(str(target.id), db)
    if not creds:
        return {"token": None}

    # Generate JWT
    secret = os.environ.get("FRONTBASE_JWT_SECRET", "supersecret")
    
    payload = {
        "provider": str(target.provider),
        "credentials": creds,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=1)
    }
    
    token = jwt.encode(payload, secret, algorithm="HS256")
    return {"token": token}


from pydantic import BaseModel

class SetWorkspaceDefaultRequest(BaseModel):
    provider_id: str

@router.post("/workspace-agent-token")
def set_workspace_agent_token(payload: SetWorkspaceDefaultRequest, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Set a specific provider as the default Workspace Agent provider and generate token."""
    import json
    
    provider = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.id == payload.provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")
        
    all_providers = _scoped_provider_query(db, ctx).all()
    for p in all_providers:
        if p.provider_metadata:
            try:
                meta = json.loads(str(p.provider_metadata))
                if meta.get("is_workspace_default"):
                    meta["is_workspace_default"] = False
                    p.provider_metadata = json.dumps(meta)  # type: ignore[assignment]
            except Exception:
                pass
                
    meta = {}
    if provider.provider_metadata:
        try:
            meta = json.loads(str(provider.provider_metadata))
        except Exception:
            pass
    meta["is_workspace_default"] = True
    provider.provider_metadata = json.dumps(meta)  # type: ignore[assignment]
    db.commit()
    
    return get_workspace_agent_token(db)


# =============================================================================
# CRUD Endpoints
# =============================================================================

@router.get("/", response_model=List[EdgeProviderAccountResponse])
async def list_providers(db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """List all connected edge provider accounts."""
    providers = _scoped_provider_query(db, ctx).order_by(EdgeProviderAccount.created_at.desc()).all()
    return [_provider_response(p) for p in providers]


@router.get("/{provider_id}")
async def get_provider(provider_id: str, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Get a specific edge provider account."""
    provider = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
    return _provider_response(provider)


@router.post("/", status_code=201)
async def create_provider(payload: EdgeProviderAccountCreate, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
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
        existing_turso = _scoped_provider_query(db, ctx).filter(
            EdgeProviderAccount.provider == "turso",
            EdgeProviderAccount.is_active == True
        ).first()
        if existing_turso:
            existing_creds = {}
            if str(existing_turso.provider_credentials or ""):
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
            same_provider_accounts = _scoped_provider_query(db, ctx).filter(
                EdgeProviderAccount.provider == payload.provider,
            ).all()

            for acct in same_provider_accounts:
                if not str(acct.provider_credentials or ""):
                    continue
                try:
                    stored_creds = decrypt_credentials(str(acct.provider_credentials))
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
    
    project_id_val = None
    if ctx and ctx.tenant_id:
        proj = get_project(db, ctx)
        if proj: project_id_val = proj.id

    provider = EdgeProviderAccount(
        id=str(uuid.uuid4()),
        name=payload.name,
        project_id=project_id_val,
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

            # Also fetch JWT secret from postgrest config
            try:
                from ..services.supabase_management import get_jwt_secret
                jwt_secret = await get_jwt_secret(access_token, project_ref)
                if jwt_secret:
                    existing_secrets = decrypt_credentials(str(provider.provider_credentials or "{}"))
                    existing_secrets["jwt_secret"] = jwt_secret
                    provider.provider_credentials = encrypt_credentials(existing_secrets)  # type: ignore[assignment]
                    db.commit()
                    db.refresh(provider)
                    print(f"[Supabase Connect] JWT secret stored in encrypted credentials")
            except Exception as e:
                print(f"Warning: Could not auto-fetch Supabase JWT secret: {e}")

    # ── Plan tier detection ──────────────────────────────────────────────
    # Detect the user's plan tier at connect time and persist in metadata.
    # Used by log persistence to determine retention limits.
    from ..services.plan_detector import detect_and_store_plan_tier
    await detect_and_store_plan_tier(
        provider, payload.provider, payload.provider_credentials or {}, db
    )

    # For Cloudflare: auto-detect account_id from API token and persist
    if payload.provider == "cloudflare" and payload.provider_credentials:
        api_token = payload.provider_credentials.get("api_token", "")
        if api_token:
            try:
                from ..services.cloudflare_api import detect_account_id
                account_id = await detect_account_id(api_token)
                existing_meta = {}
                if str(provider.provider_metadata or ""):
                    try:
                        existing_meta = json.loads(str(provider.provider_metadata))
                    except (json.JSONDecodeError, TypeError):
                        pass
                existing_meta["account_id"] = account_id
                provider.provider_metadata = json.dumps(existing_meta)  # type: ignore[assignment]
                db.commit()
                db.refresh(provider)
                print(f"[CF Connect] Auto-detected account_id: {account_id}")
            except Exception as e:
                print(f"Warning: Could not auto-detect Cloudflare account_id: {e}")

    # For Netlify: pre-install CLI in background so first deploy is fast
    if payload.provider == "netlify":
        import asyncio
        from ..services.netlify_cli import ensure_netlify_cli
        asyncio.create_task(ensure_netlify_cli())

    return _provider_response(provider)




@router.put("/{provider_id}")
async def update_provider(provider_id: str, payload: EdgeProviderAccountUpdate, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Update a provider account. Credentials are re-encrypted on change."""
    import json
    from ..core.security import encrypt_credentials, split_credentials
    
    provider = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.id == provider_id).first()
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
async def delete_provider(provider_id: str, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Delete a provider account if no engines depend on it."""
    provider = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.id == provider_id).first()
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
async def retest_provider(provider_id: str, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Re-validate an existing provider's credentials.

    Decrypts stored secrets server-side and calls the same validation logic.
    """
    from ..core.security import get_provider_creds

    provider = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.id == provider_id).first()
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
def get_credentials(provider_id: str, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Return decrypted credentials for a provider account.

    Internal endpoint used by the db-synchronizer credential bridge to resolve
    datasource credentials from connected accounts. Avoids duplicating
    encryption/decryption logic across services.
    """
    from ..core.security import get_provider_creds

    provider = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.id == provider_id).first()
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
async def discover_by_account(account_id: str, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """Discover resources using stored credentials from a Connected Account.
    
    Decrypts saved credentials server-side and calls the same discovery logic.
    For Turso: returns manually-registered databases from stored JSON.
    Used by Edge DB/Cache/Queue forms to list available resources.
    """
    from ..core.security import get_provider_creds

    provider_row = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.id == account_id).first()
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
    db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Create a new resource (Redis DB) via Connected Account's management API."""
    from ..core.security import get_provider_creds

    provider_row = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.id == account_id).first()
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
    db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Add a database to a Turso provider account (manual registry)."""
    from ..core.security import decrypt_credentials, encrypt_credentials

    provider = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.id == account_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
    if str(provider.provider) != "turso":
        raise HTTPException(status_code=400, detail="Only Turso accounts support database registry")

    # Decrypt existing credentials
    creds: dict = {}
    if str(provider.provider_credentials or ""):
        creds = decrypt_credentials(str(provider.provider_credentials))
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
    db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Remove a database from a Turso provider account."""
    from ..core.security import decrypt_credentials, encrypt_credentials

    provider = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.id == account_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
    if str(provider.provider) != "turso":
        raise HTTPException(status_code=400, detail="Only Turso accounts support database registry")

    creds: dict = {}
    if str(provider.provider_credentials or ""):
        creds = decrypt_credentials(str(provider.provider_credentials))
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
    db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context),
):
    """Test connection to a specific Turso database within an account."""
    from ..core.security import decrypt_credentials, encrypt_credentials

    provider = _scoped_provider_query(db, ctx).filter(EdgeProviderAccount.id == account_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
    if str(provider.provider) != "turso":
        raise HTTPException(status_code=400, detail="Only Turso accounts support database registry")

    creds: dict = {}
    if str(provider.provider_credentials or ""):
        creds = decrypt_credentials(str(provider.provider_credentials))
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
async def list_account_tables(account_id: str, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
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
        provider_ctx = get_provider_context_by_id(db, account_id)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Provider account not found")

    provider_type = provider_ctx.get("provider_type", "")
    from ..services.table_discovery import list_tables_for_provider
    return await list_tables_for_provider(provider_type, provider_ctx)



# =============================================================================
# List Engines — generic multi-provider engine listing
# =============================================================================

@router.post("/{account_id}/list-engines")
async def list_engines_for_provider(account_id: str, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    """List engines/functions/apps from a connected edge provider.

    Dispatches to provider-specific listing API and returns unified shape.
    """
    from ..core.security import get_provider_creds
    from ..services.engine_lister import list_engines

    provider_row = _scoped_provider_query(db, ctx).filter(
        EdgeProviderAccount.id == account_id
    ).first()
    if not provider_row:
        raise HTTPException(status_code=404, detail="Provider account not found")

    provider_type = str(provider_row.provider)
    creds = get_provider_creds(account_id, db)
    if not creds:
        return {"success": False, "detail": "No credentials stored for this account", "engines": []}

    try:
        engines = await list_engines(provider_type, creds)
        if not engines and provider_type not in ("cloudflare", "supabase", "deno", "vercel", "netlify"):
            return {"success": False, "detail": f"Engine listing not supported for {provider_type}", "engines": []}
        return {"success": True, "engines": engines}
    except Exception as e:
        return {"success": False, "detail": f"Failed to list engines: {str(e)[:300]}", "engines": []}



