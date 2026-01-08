"""
Auth Forms router - CRUD operations for authentication forms.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid

from app.database.utils import get_db

router = APIRouter()


class AuthFormBase(BaseModel):
    name: str
    type: str  # 'login', 'signup', 'both'
    config: Optional[dict] = {}
    target_contact_type: Optional[str] = None
    allowed_contact_types: Optional[List[str]] = []
    redirect_url: Optional[str] = None
    is_active: bool = True


class AuthFormCreate(AuthFormBase):
    pass


class AuthFormUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    config: Optional[dict] = None
    target_contact_type: Optional[str] = None
    allowed_contact_types: Optional[List[str]] = None
    redirect_url: Optional[str] = None
    is_active: Optional[bool] = None


class AuthFormResponse(AuthFormBase):
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/", response_model=List[AuthFormResponse])
async def list_auth_forms(db: Session = Depends(get_db)):
    """List all auth forms"""
    try:
        result = db.execute(text("SELECT * FROM auth_forms ORDER BY created_at DESC"))
        rows = result.fetchall()
        
        forms = []
        for row in rows:
            forms.append({
                "id": row.id,
                "name": row.name,
                "type": row.type,
                "config": eval(row.config) if row.config else {},
                "target_contact_type": row.target_contact_type,
                "allowed_contact_types": eval(row.allowed_contact_types) if row.allowed_contact_types else [],
                "redirect_url": row.redirect_url,
                "is_active": bool(row.is_active),
                "created_at": row.created_at,
                "updated_at": row.updated_at
            })
        
        return forms
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{form_id}/", response_model=AuthFormResponse)
async def get_auth_form(form_id: str, db: Session = Depends(get_db)):
    """Get a single auth form by ID"""
    try:
        result = db.execute(
            text("SELECT * FROM auth_forms WHERE id = :id"),
            {"id": form_id}
        )
        row = result.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Auth form not found")
        
        return {
            "id": row.id,
            "name": row.name,
            "type": row.type,
            "config": eval(row.config) if row.config else {},
            "target_contact_type": row.target_contact_type,
            "allowed_contact_types": eval(row.allowed_contact_types) if row.allowed_contact_types else [],
            "redirect_url": row.redirect_url,
            "is_active": bool(row.is_active),
            "created_at": row.created_at,
            "updated_at": row.updated_at
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=AuthFormResponse, status_code=status.HTTP_201_CREATED)
async def create_auth_form(form: AuthFormCreate, db: Session = Depends(get_db)):
    """Create a new auth form"""
    try:
        form_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        db.execute(
            text("""
                INSERT INTO auth_forms (id, name, type, config, target_contact_type, 
                                        allowed_contact_types, redirect_url, is_active, 
                                        created_at, updated_at)
                VALUES (:id, :name, :type, :config, :target_contact_type, 
                        :allowed_contact_types, :redirect_url, :is_active, 
                        :created_at, :updated_at)
            """),
            {
                "id": form_id,
                "name": form.name,
                "type": form.type,
                "config": str(form.config) if form.config else "{}",
                "target_contact_type": form.target_contact_type,
                "allowed_contact_types": str(form.allowed_contact_types) if form.allowed_contact_types else "[]",
                "redirect_url": form.redirect_url,
                "is_active": 1 if form.is_active else 0,
                "created_at": now,
                "updated_at": now
            }
        )
        db.commit()
        
        return {
            "id": form_id,
            "name": form.name,
            "type": form.type,
            "config": form.config,
            "target_contact_type": form.target_contact_type,
            "allowed_contact_types": form.allowed_contact_types,
            "redirect_url": form.redirect_url,
            "is_active": form.is_active,
            "created_at": now,
            "updated_at": now
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{form_id}/", response_model=AuthFormResponse)
async def update_auth_form(form_id: str, form: AuthFormUpdate, db: Session = Depends(get_db)):
    """Update an existing auth form"""
    try:
        # Check if exists
        result = db.execute(
            text("SELECT * FROM auth_forms WHERE id = :id"),
            {"id": form_id}
        )
        existing = result.fetchone()
        
        if not existing:
            raise HTTPException(status_code=404, detail="Auth form not found")
        
        # Build update
        updates = []
        params = {"id": form_id, "updated_at": datetime.utcnow().isoformat()}
        
        if form.name is not None:
            updates.append("name = :name")
            params["name"] = form.name
        if form.type is not None:
            updates.append("type = :type")
            params["type"] = form.type
        if form.config is not None:
            updates.append("config = :config")
            params["config"] = str(form.config)
        if form.target_contact_type is not None:
            updates.append("target_contact_type = :target_contact_type")
            params["target_contact_type"] = form.target_contact_type
        if form.allowed_contact_types is not None:
            updates.append("allowed_contact_types = :allowed_contact_types")
            params["allowed_contact_types"] = str(form.allowed_contact_types)
        if form.redirect_url is not None:
            updates.append("redirect_url = :redirect_url")
            params["redirect_url"] = form.redirect_url
        if form.is_active is not None:
            updates.append("is_active = :is_active")
            params["is_active"] = 1 if form.is_active else 0
        
        updates.append("updated_at = :updated_at")
        
        if updates:
            db.execute(
                text(f"UPDATE auth_forms SET {', '.join(updates)} WHERE id = :id"),
                params
            )
            db.commit()
        
        # Return updated form
        return await get_auth_form(form_id, db)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{form_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_auth_form(form_id: str, db: Session = Depends(get_db)):
    """Delete an auth form"""
    try:
        result = db.execute(
            text("SELECT id FROM auth_forms WHERE id = :id"),
            {"id": form_id}
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Auth form not found")
        
        db.execute(
            text("DELETE FROM auth_forms WHERE id = :id"),
            {"id": form_id}
        )
        db.commit()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
