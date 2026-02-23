"""
Deployment Targets API Router

CRUD endpoints for managing edge deployment targets.
Each target represents an Edge Engine deployment on a specific provider
(Cloudflare Workers, Vercel Edge, Docker, etc.).

The publish pipeline uses active targets to push pages to each endpoint.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime
import uuid

from ..database.config import SessionLocal
from ..models.models import DeploymentTarget

router = APIRouter(prefix="/api/deployment-targets", tags=["Deployment Targets"])


# =============================================================================
# Pydantic Schemas
# =============================================================================

class DeploymentTargetCreate(BaseModel):
    """Create a new deployment target."""
    name: str = Field(..., min_length=1, max_length=100)
    provider: Literal["cloudflare", "vercel", "netlify", "docker", "flyio"] = Field(...)
    adapter_type: Literal["pages", "automations", "full"] = Field(default="full")
    url: str = Field(..., min_length=1, max_length=500)
    is_active: bool = Field(default=True)


class DeploymentTargetUpdate(BaseModel):
    """Update an existing deployment target."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    provider: Optional[Literal["cloudflare", "vercel", "netlify", "docker", "flyio"]] = None
    adapter_type: Optional[Literal["pages", "automations", "full"]] = None
    url: Optional[str] = Field(None, min_length=1, max_length=500)
    is_active: Optional[bool] = None


class DeploymentTargetResponse(BaseModel):
    """Deployment target response."""
    id: str
    name: str
    provider: str
    adapter_type: str
    url: str
    is_active: bool
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# =============================================================================
# CRUD Endpoints
# =============================================================================

@router.get("/", response_model=List[DeploymentTargetResponse])
async def list_deployment_targets():
    """List all deployment targets."""
    db = SessionLocal()
    try:
        targets = db.query(DeploymentTarget).order_by(DeploymentTarget.created_at.desc()).all()
        return targets
    finally:
        db.close()


@router.get("/{target_id}", response_model=DeploymentTargetResponse)
async def get_deployment_target(target_id: str):
    """Get a single deployment target by ID."""
    db = SessionLocal()
    try:
        target = db.query(DeploymentTarget).filter(DeploymentTarget.id == target_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Deployment target not found")
        return target
    finally:
        db.close()


@router.post("/", response_model=DeploymentTargetResponse, status_code=201)
async def create_deployment_target(payload: DeploymentTargetCreate):
    """Create a new deployment target."""
    db = SessionLocal()
    try:
        now = datetime.utcnow().isoformat()
        target = DeploymentTarget(
            id=str(uuid.uuid4()),
            name=payload.name,
            provider=payload.provider,
            adapter_type=payload.adapter_type,
            url=payload.url,
            is_active=payload.is_active,
            created_at=now,
            updated_at=now,
        )
        db.add(target)
        db.commit()
        db.refresh(target)
        return target
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.put("/{target_id}", response_model=DeploymentTargetResponse)
async def update_deployment_target(target_id: str, payload: DeploymentTargetUpdate):
    """Update an existing deployment target."""
    db = SessionLocal()
    try:
        target = db.query(DeploymentTarget).filter(DeploymentTarget.id == target_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Deployment target not found")

        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(target, key, value)
        target.updated_at = datetime.utcnow().isoformat()

        db.commit()
        db.refresh(target)
        return target
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.delete("/{target_id}", status_code=204)
async def delete_deployment_target(target_id: str):
    """Delete a deployment target."""
    db = SessionLocal()
    try:
        target = db.query(DeploymentTarget).filter(DeploymentTarget.id == target_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Deployment target not found")

        db.delete(target)
        db.commit()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.get("/active/by-scope/{scope}", response_model=List[DeploymentTargetResponse])
async def list_active_targets_by_scope(scope: Literal["pages", "automations", "full"]):
    """List active deployment targets filtered by adapter scope.
    
    Used by the publish pipeline to determine where to push pages/automations.
    'full' scope targets match both 'pages' and 'automations' queries.
    """
    db = SessionLocal()
    try:
        query = db.query(DeploymentTarget).filter(DeploymentTarget.is_active == True)
        
        if scope == "pages":
            query = query.filter(DeploymentTarget.adapter_type.in_(["pages", "full"]))
        elif scope == "automations":
            query = query.filter(DeploymentTarget.adapter_type.in_(["automations", "full"]))
        else:
            # "full" — return all active targets
            pass

        targets = query.order_by(DeploymentTarget.created_at.desc()).all()
        return targets
    finally:
        db.close()
