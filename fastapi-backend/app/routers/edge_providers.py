from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
import uuid
import datetime

from ..models.models import EdgeProviderAccount, EdgeEngine
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

    class Config:
        from_attributes = True

# =============================================================================
# Endpoints
# =============================================================================

@router.get("/", response_model=List[EdgeProviderAccountResponse])
async def list_providers(db: Session = Depends(get_db)):
    """List all connected edge provider accounts."""
    providers = db.query(EdgeProviderAccount).order_by(EdgeProviderAccount.created_at.desc()).all()
    return providers

@router.get("/{provider_id}")
async def get_provider(provider_id: str, db: Session = Depends(get_db)):
    """Get a specific edge provider account."""
    import json
    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
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

@router.post("/", status_code=201)
async def create_provider(payload: EdgeProviderAccountCreate, db: Session = Depends(get_db)):
    """Create and connect a new edge provider account.
    
    Credentials are encrypted with Fernet AES-256 before storage.
    Non-secret metadata (account_id, project_ref) is stored separately for UI display.
    """
    import json
    from ..core.security import encrypt_credentials, split_credentials
    
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
    
    resp_metadata = None
    if metadata_str:
        try:
            resp_metadata = json.loads(metadata_str)
        except (json.JSONDecodeError, TypeError):
            pass
    return {
        "id": str(provider.id),
        "name": str(provider.name),
        "provider": str(provider.provider),
        "is_active": bool(provider.is_active),
        "has_credentials": bool(provider.provider_credentials),
        "provider_metadata": resp_metadata,
        "created_at": str(provider.created_at),
        "updated_at": str(provider.updated_at),
    }

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
    
    resp_metadata = None
    if provider.provider_metadata:
        try:
            resp_metadata = json.loads(str(provider.provider_metadata))
        except (json.JSONDecodeError, TypeError):
            pass
    return {
        "id": str(provider.id),
        "name": str(provider.name),
        "provider": str(provider.provider),
        "is_active": bool(provider.is_active),
        "has_credentials": bool(provider.provider_credentials),
        "provider_metadata": resp_metadata,
        "created_at": str(provider.created_at),
        "updated_at": str(provider.updated_at),
    }

@router.delete("/{provider_id}", status_code=204)
async def delete_provider(provider_id: str, db: Session = Depends(get_db)):
    """Delete a provider account if no engines depend on it."""
    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
        
    # Check if engines are using this provider
    engine_count = db.query(EdgeEngine).filter(EdgeEngine.edge_provider_id == provider_id).count()
    if engine_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete provider: {engine_count} edge engine(s) are actively using it."
        )
        
    db.delete(provider)
    db.commit()
    return None


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
                token = creds.get("access_token", "")
                project_ref = creds.get("project_ref", "")
                if not token or not project_ref:
                    return {"success": False, "detail": "Both access_token and project_ref are required"}
                resp = await client.get(
                    f"https://api.supabase.com/v1/projects/{project_ref}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if resp.status_code == 401:
                    return {"success": False, "detail": "Invalid access token"}
                if resp.status_code == 404:
                    return {"success": False, "detail": f"Project '{project_ref}' not found"}
                if resp.status_code != 200:
                    return {"success": False, "detail": f"Supabase API error: {resp.status_code}"}
                data = resp.json()
                name = data.get("name", project_ref)
                return {"success": True, "detail": f"Connected to project: {name}"}

            elif provider == "vercel":
                token = creds.get("api_token", "")
                team_id = creds.get("team_id", "")
                headers = {"Authorization": f"Bearer {token}"}
                url = "https://api.vercel.com/v2/user"
                resp = await client.get(url, headers=headers)
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
                resp = await client.get(
                    "https://api.upstash.com/v2/team",
                    headers={"Authorization": f"Basic {__import__('base64').b64encode(f'{email}:{token}'.encode()).decode()}"},
                )
                if resp.status_code != 200:
                    return {"success": False, "detail": "Invalid Upstash credentials"}
                data = resp.json()
                name = data.get("team_name", "Upstash Account") if isinstance(data, dict) else "Upstash Account"
                return {"success": True, "detail": f"Connected as {name}"}

            else:
                return {"success": False, "detail": f"Unsupported provider: {provider}"}

    except httpx.TimeoutException:
        return {"success": False, "detail": "Connection timed out — check your network"}
    except Exception as e:
        return {"success": False, "detail": f"Connection failed: {str(e)}"}
