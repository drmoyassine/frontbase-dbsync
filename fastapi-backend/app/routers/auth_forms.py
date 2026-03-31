"""
Auth Forms router - CRUD operations for authentication forms.

Flags like is_primary and is_embeddable are stored inside the config JSON blob.
This avoids schema migrations for new boolean flags.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime
import uuid
import json
import os
import httpx

from app.database.utils import get_db
from app.database.config import SessionLocal

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
    """Convert a database row to a dict.
    is_primary and is_embeddable are extracted from config JSON.
    Returns both snake_case and camelCase keys for frontend compatibility.
    """
    config = parse_json_field(row.config, {})
    is_primary = bool(config.get("is_primary", False))
    is_embeddable = bool(config.get("is_embeddable", False))
    is_active = bool(row.is_active)
    return {
        "id": row.id,
        "name": row.name,
        "type": row.type,
        "config": config,
        "target_contact_type": row.target_contact_type,
        "targetContactType": row.target_contact_type,
        "allowed_contact_types": parse_json_field(row.allowed_contact_types, []),
        "allowedContactTypes": parse_json_field(row.allowed_contact_types, []),
        "redirect_url": row.redirect_url,
        "redirectUrl": row.redirect_url,
        "is_active": is_active,
        "isActive": is_active,
        "is_primary": is_primary,
        "isPrimary": is_primary,
        "is_embeddable": is_embeddable,
        "isEmbeddable": is_embeddable,
        "created_at": row.created_at,
        "createdAt": row.created_at,
        "updated_at": row.updated_at,
        "updatedAt": row.updated_at,
    }


# =============================================================================
# Edge Sync Helper
# =============================================================================

async def _sync_embeddable_forms_to_edge():
    """Sync all embeddable auth forms to active edge engines via /api/import/settings.
    Non-fatal: failures are logged but don't block the CRUD response.
    """
    db = SessionLocal()
    try:
        # Fetch all active auth forms
        rows = db.execute(text("SELECT * FROM auth_forms WHERE is_active = 1")).fetchall()
        forms_map = {}
        for row in rows:
            config = parse_json_field(row.config, {})
            if config.get("is_embeddable"):
                forms_map[row.id] = {
                    "type": row.type,
                    "title": row.name,
                    "description": config.get("description", ""),
                    "logoUrl": config.get("logoUrl", ""),
                    "primaryColor": config.get("primaryColor", "#18181b"),
                    "providers": config.get("providers", []),
                    "magicLink": config.get("magicLink", False),
                    "showLinks": config.get("showLinks", True),
                    "redirectUrl": row.redirect_url or config.get("redirectUrl", ""),
                    "defaultView": config.get("defaultView", "sign_in"),
                }

        auth_forms_json = json.dumps(forms_map) if forms_map else None

        # Fetch all active edge engines
        from app.models.models import EdgeEngine
        from app.services.edge_client import get_edge_headers
        engines = db.query(EdgeEngine).filter(EdgeEngine.url.isnot(None)).all()

        if not engines:
            return

        # Detach engines data before closing DB
        engine_data = []
        for eng in engines:
            _ = eng.engine_config  # Force load before detach
            engine_data.append({
                "url": str(eng.url),
                "headers": get_edge_headers(eng),
            })
    finally:
        db.close()

    # Fan out to all engines (no DB held)
    async with httpx.AsyncClient(timeout=5.0) as client:
        for eng in engine_data:
            try:
                await client.post(
                    f"{eng['url'].rstrip('/')}/api/import/settings",
                    json={"authForms": auth_forms_json},
                    headers={"Content-Type": "application/json", **eng["headers"]},
                )
            except Exception as e:
                print(f"[AuthForms] Edge sync failed for {eng['url']}: {e}")

    print(f"[AuthForms] Synced {len(forms_map)} embeddable forms to {len(engine_data)} engines")


# =============================================================================
# CRUD Endpoints
# =============================================================================

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
        
        # Config already contains is_primary and is_embeddable from frontend
        config_data = form.config or {}
        
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
                "config": json.dumps(config_data),
                "target_contact_type": form.target_contact_type,
                "allowed_contact_types": json.dumps(form.allowed_contact_types) if form.allowed_contact_types else "[]",
                "redirect_url": form.redirect_url,
                "is_active": 1 if form.is_active else 0,
                "created_at": now,
                "updated_at": now
            }
        )
        db.commit()
        
        is_primary_val = bool(config_data.get("is_primary", False))
        is_embeddable_val = bool(config_data.get("is_embeddable", False))
        response_data = {
            "id": form_id,
            "name": form.name,
            "type": form.type,
            "config": config_data,
            "target_contact_type": form.target_contact_type,
            "targetContactType": form.target_contact_type,
            "allowed_contact_types": form.allowed_contact_types or [],
            "allowedContactTypes": form.allowed_contact_types or [],
            "redirect_url": form.redirect_url,
            "redirectUrl": form.redirect_url,
            "is_active": form.is_active,
            "isActive": form.is_active,
            "is_primary": is_primary_val,
            "isPrimary": is_primary_val,
            "is_embeddable": is_embeddable_val,
            "isEmbeddable": is_embeddable_val,
            "created_at": now,
            "createdAt": now,
            "updated_at": now,
            "updatedAt": now,
        }

        # Sync to edge if embeddable
        if config_data.get("is_embeddable"):
            try:
                await _sync_embeddable_forms_to_edge()
            except Exception as e:
                print(f"[AuthForms] Edge sync failed (non-fatal): {e}")
        
        return {"success": True, "data": response_data}
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
            params["is_active"] = str(1 if form.is_active else 0)
        
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
        updated_data = row_to_dict(row)

        # Sync to edge (form might have toggled is_embeddable)
        try:
            await _sync_embeddable_forms_to_edge()
        except Exception as e:
            print(f"[AuthForms] Edge sync failed (non-fatal): {e}")
        
        return {"success": True, "data": updated_data}
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}


@router.delete("/{form_id}/")
async def delete_auth_form(form_id: str, db: Session = Depends(get_db)):
    """Delete an auth form"""
    try:
        result = db.execute(
            text("SELECT id, config FROM auth_forms WHERE id = :id"),
            {"id": form_id}
        )
        row = result.fetchone()
        if not row:
            return {"success": False, "error": "Auth form not found"}
        
        was_embeddable = parse_json_field(row.config, {}).get("is_embeddable", False)
        
        db.execute(
            text("DELETE FROM auth_forms WHERE id = :id"),
            {"id": form_id}
        )
        db.commit()

        # Sync to edge if deleted form was embeddable
        if was_embeddable:
            try:
                await _sync_embeddable_forms_to_edge()
            except Exception as e:
                print(f"[AuthForms] Edge sync failed (non-fatal): {e}")
        
        return {"success": True, "data": None}
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}


@router.get("/primary/")
async def get_primary_auth_form(db: Session = Depends(get_db)):
    """Get the primary auth form (used for private page gating).
    Reads is_primary from config JSON with Python filtering.
    """
    try:
        result = db.execute(
            text("SELECT * FROM auth_forms WHERE is_active = 1")
        )
        rows = result.fetchall()

        # Python filter: find form with is_primary in config
        primary = None
        first_active = None
        for row in rows:
            config = parse_json_field(row.config, {})
            if first_active is None:
                first_active = row
            if config.get("is_primary"):
                primary = row
                break

        target = primary or first_active

        if not target:
            return {"success": False, "error": "No auth forms configured"}

        return {"success": True, "data": row_to_dict(target)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.put("/{form_id}/set-primary/")
async def set_primary_auth_form(form_id: str, db: Session = Depends(get_db)):
    """Set a form as primary (clears primary from all others).
    Updates is_primary flag inside config JSON for each form.
    """
    try:
        # Verify form exists
        result = db.execute(
            text("SELECT id FROM auth_forms WHERE id = :id"),
            {"id": form_id}
        )
        if not result.fetchone():
            return {"success": False, "error": "Auth form not found"}

        # Fetch all forms, update config JSON
        all_rows = db.execute(text("SELECT id, config FROM auth_forms")).fetchall()
        for row in all_rows:
            config = parse_json_field(row.config, {})
            new_is_primary = (row.id == form_id)
            if config.get("is_primary") != new_is_primary:
                config["is_primary"] = new_is_primary
                db.execute(
                    text("UPDATE auth_forms SET config = :config, updated_at = :now WHERE id = :id"),
                    {"config": json.dumps(config), "now": datetime.utcnow().isoformat(), "id": row.id}
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
