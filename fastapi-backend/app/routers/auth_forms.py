"""
Auth Forms router - CRUD operations for authentication forms.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime
import uuid
import json

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


class SuccessResponse(BaseModel):
    success: bool
    data: Any = None
    error: Optional[str] = None


def parse_json_field(value, default):
    """Safely parse a JSON field."""
    if not value:
        return default
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        try:
            # Try eval as fallback for Python dict strings
            return eval(value)
        except:
            return default


def row_to_dict(row):
    """Convert a database row to a dict."""
    return {
        "id": row.id,
        "name": row.name,
        "type": row.type,
        "config": parse_json_field(row.config, {}),
        "target_contact_type": row.target_contact_type,
        "allowed_contact_types": parse_json_field(row.allowed_contact_types, []),
        "redirect_url": row.redirect_url,
        "is_active": bool(row.is_active),
        "created_at": row.created_at,
        "updated_at": row.updated_at
    }


@router.get("/")
async def list_auth_forms(db: Session = Depends(get_db)):
    """List all auth forms"""
    try:
        result = db.execute(text("SELECT * FROM auth_forms ORDER BY created_at DESC"))
        rows = result.fetchall()
        
        forms = [row_to_dict(row) for row in rows]
        
        return {"success": True, "data": forms}
    except Exception as e:
        import traceback
        print(f"Error listing auth forms: {e}")
        traceback.print_exc()
        return {"success": False, "error": str(e)}


@router.get("/{form_id}/")
async def get_auth_form(form_id: str, db: Session = Depends(get_db)):
    """Get a single auth form by ID"""
    try:
        result = db.execute(
            text("SELECT * FROM auth_forms WHERE id = :id"),
            {"id": form_id}
        )
        row = result.fetchone()
        
        if not row:
            return {"success": False, "error": "Auth form not found"}
        
        return {"success": True, "data": row_to_dict(row)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/", status_code=status.HTTP_201_CREATED)
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
                "config": json.dumps(form.config) if form.config else "{}",
                "target_contact_type": form.target_contact_type,
                "allowed_contact_types": json.dumps(form.allowed_contact_types) if form.allowed_contact_types else "[]",
                "redirect_url": form.redirect_url,
                "is_active": 1 if form.is_active else 0,
                "created_at": now,
                "updated_at": now
            }
        )
        db.commit()
        
        return {
            "success": True,
            "data": {
                "id": form_id,
                "name": form.name,
                "type": form.type,
                "config": form.config or {},
                "target_contact_type": form.target_contact_type,
                "allowed_contact_types": form.allowed_contact_types or [],
                "redirect_url": form.redirect_url,
                "is_active": form.is_active,
                "created_at": now,
                "updated_at": now
            }
        }
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}


@router.put("/{form_id}/")
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
            return {"success": False, "error": "Auth form not found"}
        
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
            params["config"] = json.dumps(form.config)
        if form.target_contact_type is not None:
            updates.append("target_contact_type = :target_contact_type")
            params["target_contact_type"] = form.target_contact_type
        if form.allowed_contact_types is not None:
            updates.append("allowed_contact_types = :allowed_contact_types")
            params["allowed_contact_types"] = json.dumps(form.allowed_contact_types)
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
        result = db.execute(
            text("SELECT * FROM auth_forms WHERE id = :id"),
            {"id": form_id}
        )
        row = result.fetchone()
        
        return {"success": True, "data": row_to_dict(row)}
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}


@router.delete("/{form_id}/")
async def delete_auth_form(form_id: str, db: Session = Depends(get_db)):
    """Delete an auth form"""
    try:
        result = db.execute(
            text("SELECT id FROM auth_forms WHERE id = :id"),
            {"id": form_id}
        )
        if not result.fetchone():
            return {"success": False, "error": "Auth form not found"}
        
        db.execute(
            text("DELETE FROM auth_forms WHERE id = :id"),
            {"id": form_id}
        )
        db.commit()
        
        return {"success": True, "data": None}
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}
