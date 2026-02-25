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
