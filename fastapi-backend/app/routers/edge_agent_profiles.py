"""
Edge Agent Profiles router — CRUD for AI Agent Personas.
"""
import uuid
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database.config import get_db
from ..models.models import EdgeAgentProfile, EdgeEngine
from ..schemas.edge_engines import EdgeAgentProfileCreate, EdgeAgentProfileUpdate, EdgeAgentProfileResponse

router = APIRouter(prefix="/api/edge-engines/{engine_id}/agent-profiles", tags=["edge-agent-profiles"])

def _serialize(profile: EdgeAgentProfile) -> dict:
    return {
        "id": str(profile.id),
        "engine_id": str(profile.engine_id),
        "name": str(profile.name),
        "slug": str(profile.slug),
        "system_prompt": str(profile.system_prompt) if str(profile.system_prompt) else None,
        "permissions": json.loads(str(profile.permissions)) if str(profile.permissions) else None,
        "created_at": str(profile.created_at),
        "updated_at": str(profile.updated_at),
    }

@router.get("")
def list_profiles(engine_id: str, db: Session = Depends(get_db)):
    profiles = db.query(EdgeAgentProfile).filter(EdgeAgentProfile.engine_id == engine_id).all()
    result = [_serialize(p) for p in profiles]
    return {"profiles": result, "total": len(result)}

@router.post("", status_code=201)
def create_profile(engine_id: str, payload: EdgeAgentProfileCreate, db: Session = Depends(get_db)):
    engine = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id).first()
    if not engine:
        raise HTTPException(404, "Edge engine not found")

    # Check for duplicate slug
    existing = db.query(EdgeAgentProfile).filter(
        EdgeAgentProfile.engine_id == engine_id,
        EdgeAgentProfile.slug == payload.slug
    ).first()
    if existing:
        raise HTTPException(400, "Agent profile with this slug already exists on this engine")

    now = datetime.utcnow().isoformat()
    profile = EdgeAgentProfile(
        id=str(uuid.uuid4()),
        engine_id=engine_id,
        name=payload.name,  # type: ignore[assignment]
        slug=payload.slug,  # type: ignore[assignment]
        system_prompt=payload.system_prompt,  # type: ignore[assignment]
        permissions=json.dumps(payload.permissions) if payload.permissions is not None else None,  # type: ignore[assignment]
        created_at=now,  # type: ignore[assignment]
        updated_at=now,  # type: ignore[assignment]
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _serialize(profile)

@router.put("/{profile_id}")
def update_profile(engine_id: str, profile_id: str, payload: EdgeAgentProfileUpdate, db: Session = Depends(get_db)):
    profile = db.query(EdgeAgentProfile).filter(
        EdgeAgentProfile.id == profile_id,
        EdgeAgentProfile.engine_id == engine_id
    ).first()
    if not profile:
        raise HTTPException(404, "Agent profile not found")

    update_data = payload.model_dump(exclude_unset=True)
    
    if "name" in update_data and update_data["name"] is not None:
        profile.name = update_data["name"]  # type: ignore[assignment]
        
    if "slug" in update_data and update_data["slug"] is not None:
        if update_data["slug"] != str(profile.slug):
            existing = db.query(EdgeAgentProfile).filter(
                EdgeAgentProfile.engine_id == engine_id,
                EdgeAgentProfile.slug == update_data["slug"]
            ).first()
            if existing:
                raise HTTPException(400, "Agent profile with this slug already exists")
        profile.slug = update_data["slug"]  # type: ignore[assignment]
        
    if "system_prompt" in update_data:
        profile.system_prompt = update_data["system_prompt"]  # type: ignore[assignment]
        
    if "permissions" in update_data:
        profile.permissions = json.dumps(update_data["permissions"]) if update_data["permissions"] is not None else None  # type: ignore[assignment]

    profile.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
    db.commit()
    db.refresh(profile)
    return _serialize(profile)

@router.delete("/{profile_id}", status_code=204)
def delete_profile(engine_id: str, profile_id: str, db: Session = Depends(get_db)):
    profile = db.query(EdgeAgentProfile).filter(
        EdgeAgentProfile.id == profile_id,
        EdgeAgentProfile.engine_id == engine_id
    ).first()
    if not profile:
        raise HTTPException(404, "Agent profile not found")
    
    db.delete(profile)
    db.commit()
