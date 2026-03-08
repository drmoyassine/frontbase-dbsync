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
    created_at: str
    updated_at: str
    # Omit provider_credentials from the response for security 

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

@router.get("/{provider_id}", response_model=EdgeProviderAccountResponse)
async def get_provider(provider_id: str, db: Session = Depends(get_db)):
    """Get a specific edge provider account."""
    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
    return provider

@router.post("/", response_model=EdgeProviderAccountResponse, status_code=201)
async def create_provider(payload: EdgeProviderAccountCreate, db: Session = Depends(get_db)):
    """Create and connect a new edge provider account."""
    # In a real scenario, we'd validate the token here (e.g. call Cloudflare verify API)
    now = datetime.datetime.utcnow().isoformat()
    
    # Store credentials as JSON string
    import json
    credentials_str = json.dumps(payload.provider_credentials) if payload.provider_credentials else None
    
    provider = EdgeProviderAccount(
        id=str(uuid.uuid4()),
        name=payload.name,
        provider=payload.provider,
        provider_credentials=credentials_str,
        is_active=True,
        created_at=now,
        updated_at=now
    )
    
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider

@router.put("/{provider_id}", response_model=EdgeProviderAccountResponse)
async def update_provider(provider_id: str, payload: EdgeProviderAccountUpdate, db: Session = Depends(get_db)):
    """Update a provider account."""
    provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider account not found")
        
    if payload.name is not None:
        provider.name = payload.name  # type: ignore[assignment]
    if payload.is_active is not None:
        provider.is_active = payload.is_active  # type: ignore[assignment]
    if payload.provider_credentials is not None:
        import json
        provider.provider_credentials = json.dumps(payload.provider_credentials)  # type: ignore[assignment]
        
    provider.updated_at = datetime.datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()
    db.refresh(provider)
    return provider

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
                org_id = creds.get("org_id", "")
                if not token or not org_id:
                    return {"success": False, "detail": "Both access_token and org_id are required"}
                # Validate token + org by fetching org info
                resp = await client.get(
                    f"https://api.deno.com/v1/organizations/{org_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if resp.status_code == 401:
                    return {"success": False, "detail": "Invalid Deno Deploy token"}
                if resp.status_code == 404:
                    return {"success": False, "detail": f"Organization '{org_id}' not found"}
                if resp.status_code != 200:
                    return {"success": False, "detail": f"Deno API error: {resp.status_code}"}
                data = resp.json()
                name = data.get("name", org_id)
                return {"success": True, "detail": f"Connected to {name}"}

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
