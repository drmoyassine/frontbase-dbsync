"""
Edge Agent Profiles router — CRUD for AI Agent Personas.
"""
import uuid
import json
from datetime import datetime, UTC
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from ..database.config import get_db, SessionLocal
from ..models.models import EdgeAgentProfile, EdgeEngine
from ..schemas.edge_engines import EdgeAgentProfileCreate, EdgeAgentProfileUpdate, EdgeAgentProfileResponse
from sqlalchemy import or_
from ..middleware.tenant_context import TenantContext, get_tenant_context
from ..database.utils import get_project


router = APIRouter(prefix="/api/edge-engines/{engine_id}/agent-profiles", tags=["edge-agent-profiles"])


async def _sync_profiles_to_engines(engine_id: str) -> None:
    """Push updated FRONTBASE_AGENT_PROFILES to the engine."""
    from ..services.secrets_builder import _build_agent_profiles_config
    from ..services.engine_reconfigure import _resolve_cf_credentials, _patch_cf_settings
    from ..models.models import EdgeEngine as _EdgeEngine, EdgeProviderAccount as _EdgeProviderAccount

    db = SessionLocal()
    try:
        engine = db.query(_EdgeEngine).filter(_EdgeEngine.id == engine_id).first()
        if not engine:
            return

        provider = db.query(_EdgeProviderAccount).filter(
            _EdgeProviderAccount.id == engine.edge_provider_id
        ).first()
        provider_type = str(provider.provider) if provider else ""

        if provider_type == "cloudflare":
            cf_creds = _resolve_cf_credentials(engine, db)
            if cf_creds:
                profile_secrets = {
                    'FRONTBASE_AGENT_PROFILES': json.dumps(_build_agent_profiles_config(db, engine_id))
                }
                await _patch_cf_settings(cf_creds, profile_secrets, partial=True)
                print(f"[ProfileSync] Pushed agent profiles to CF engine '{engine.name}'")
        else:
            from ..services.engine_deploy import redeploy
            await redeploy(engine, db)
            print(f"[ProfileSync] Redeployed engine '{engine.name}' ({provider_type}) with updated agent profiles")
    except Exception as e:
        print(f"[ProfileSync] Error syncing profiles to engine '{engine_id}': {e}")
    finally:
        db.close()


def _serialize(profile: EdgeAgentProfile) -> dict:
    return {
        "id": str(profile.id),
        "engine_id": str(profile.engine_id),
        "name": str(profile.name),
        "slug": str(profile.slug),
        "system_prompt": str(profile.system_prompt) if str(profile.system_prompt) else None,
        "permissions": json.loads(str(profile.permissions)) if str(profile.permissions) else None,
        "temperature": float(profile.temperature) if profile.temperature not in (None, "") else None,
        "max_tokens": int(profile.max_tokens) if profile.max_tokens is not None else None,
        "top_p": float(profile.top_p) if profile.top_p not in (None, "") else None,
        "excluded_tools": json.loads(str(profile.excluded_tools)) if str(profile.excluded_tools) else None,
        "max_auto_tools": int(profile.max_auto_tools) if profile.max_auto_tools is not None else None,
        "mcp_enabled": bool(profile.mcp_enabled) if profile.mcp_enabled is not None else True,
        "skills_enabled": bool(profile.skills_enabled) if profile.skills_enabled is not None else True,
        "created_at": str(profile.created_at),
        "updated_at": str(profile.updated_at),
    }


@router.get("")
def list_profiles(engine_id: str, db: Session = Depends(get_db), ctx: TenantContext | None = Depends(get_tenant_context)):
    engine_query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    project_id = None
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            project_id = project.id
            engine_query = engine_query.filter(or_(EdgeEngine.project_id == project.id, EdgeEngine.is_shared == True))  # noqa: E712
        else:
            raise HTTPException(404, "Edge engine not found")
    engine = engine_query.first()
    if not engine:
        raise HTTPException(404, "Edge engine not found")

    profile_query = db.query(EdgeAgentProfile).filter(EdgeAgentProfile.engine_id == engine_id)
    if ctx and ctx.tenant_id:
        profile_query = profile_query.filter(EdgeAgentProfile.project_id == project_id)

    profiles = profile_query.all()
    result = [_serialize(p) for p in profiles]
    return {"profiles": result, "total": len(result)}


@router.post("", status_code=201)
def create_profile(
    engine_id: str,
    payload: EdgeAgentProfileCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    engine_query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    project_id = None
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            project_id = project.id
            engine_query = engine_query.filter(or_(EdgeEngine.project_id == project.id, EdgeEngine.is_shared == True))  # noqa: E712
        else:
            raise HTTPException(404, "Edge engine not found")
    engine = engine_query.first()
    if not engine:
        raise HTTPException(404, "Edge engine not found")

    # Check for duplicate slug within the same project context
    existing_query = db.query(EdgeAgentProfile).filter(
        EdgeAgentProfile.engine_id == engine_id,
        EdgeAgentProfile.slug == payload.slug
    )
    if ctx and ctx.tenant_id:
        existing_query = existing_query.filter(EdgeAgentProfile.project_id == project_id)
    
    existing = existing_query.first()
    if existing:
        raise HTTPException(400, "Agent profile with this slug already exists on this engine")

    now = datetime.now(UTC).isoformat()
    profile = EdgeAgentProfile(
        id=str(uuid.uuid4()),
        engine_id=engine_id,
        project_id=project_id,
        name=payload.name,  # type: ignore[assignment]
        slug=payload.slug,  # type: ignore[assignment]
        system_prompt=payload.system_prompt,  # type: ignore[assignment]
        permissions=json.dumps(payload.permissions) if payload.permissions is not None else None,  # type: ignore[assignment]
        temperature=str(payload.temperature) if payload.temperature is not None else None,  # type: ignore[assignment]
        max_tokens=payload.max_tokens,  # type: ignore[assignment]
        top_p=str(payload.top_p) if payload.top_p is not None else None,  # type: ignore[assignment]
        excluded_tools=json.dumps(payload.excluded_tools) if payload.excluded_tools is not None else None,  # type: ignore[assignment]
        max_auto_tools=payload.max_auto_tools,  # type: ignore[assignment]
        mcp_enabled=payload.mcp_enabled if payload.mcp_enabled is not None else True,  # type: ignore[assignment]
        skills_enabled=payload.skills_enabled if payload.skills_enabled is not None else True,  # type: ignore[assignment]
        created_at=now,  # type: ignore[assignment]
        updated_at=now,  # type: ignore[assignment]
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    background_tasks.add_task(_sync_profiles_to_engines, engine_id)
    return _serialize(profile)


@router.put("/{profile_id}")
def update_profile(
    engine_id: str,
    profile_id: str,
    payload: EdgeAgentProfileUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    engine_query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    project_id = None
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            project_id = project.id
            engine_query = engine_query.filter(or_(EdgeEngine.project_id == project.id, EdgeEngine.is_shared == True))  # noqa: E712
        else:
            raise HTTPException(404, "Edge engine not found")
    engine = engine_query.first()
    if not engine:
        raise HTTPException(404, "Edge engine not found")

    profile_query = db.query(EdgeAgentProfile).filter(
        EdgeAgentProfile.id == profile_id,
        EdgeAgentProfile.engine_id == engine_id
    )
    if ctx and ctx.tenant_id:
        profile_query = profile_query.filter(EdgeAgentProfile.project_id == project_id)

    profile = profile_query.first()
    if not profile:
        raise HTTPException(404, "Agent profile not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        profile.name = update_data["name"]  # type: ignore[assignment]

    if "slug" in update_data and update_data["slug"] is not None:
        if update_data["slug"] != str(profile.slug):
            existing_query = db.query(EdgeAgentProfile).filter(
                EdgeAgentProfile.engine_id == engine_id,
                EdgeAgentProfile.slug == update_data["slug"]
            )
            if ctx and ctx.tenant_id:
                existing_query = existing_query.filter(EdgeAgentProfile.project_id == project_id)
            existing = existing_query.first()
            if existing:
                raise HTTPException(400, "Agent profile with this slug already exists")
        profile.slug = update_data["slug"]  # type: ignore[assignment]

    if "system_prompt" in update_data:
        profile.system_prompt = update_data["system_prompt"]  # type: ignore[assignment]

    if "permissions" in update_data:
        profile.permissions = json.dumps(update_data["permissions"]) if update_data["permissions"] is not None else None  # type: ignore[assignment]

    # Feature-parity generation parameters + tool controls
    if "temperature" in update_data:
        profile.temperature = str(update_data["temperature"]) if update_data["temperature"] is not None else None  # type: ignore[assignment]
    if "max_tokens" in update_data:
        profile.max_tokens = update_data["max_tokens"]  # type: ignore[assignment]
    if "top_p" in update_data:
        profile.top_p = str(update_data["top_p"]) if update_data["top_p"] is not None else None  # type: ignore[assignment]
    if "excluded_tools" in update_data:
        profile.excluded_tools = json.dumps(update_data["excluded_tools"]) if update_data["excluded_tools"] is not None else None  # type: ignore[assignment]
    if "max_auto_tools" in update_data:
        profile.max_auto_tools = update_data["max_auto_tools"]  # type: ignore[assignment]
    if "mcp_enabled" in update_data and update_data["mcp_enabled"] is not None:
        profile.mcp_enabled = update_data["mcp_enabled"]  # type: ignore[assignment]
    if "skills_enabled" in update_data and update_data["skills_enabled"] is not None:
        profile.skills_enabled = update_data["skills_enabled"]  # type: ignore[assignment]

    profile.updated_at = datetime.now(UTC).isoformat()  # type: ignore[assignment]
    db.commit()
    db.refresh(profile)

    background_tasks.add_task(_sync_profiles_to_engines, engine_id)
    return _serialize(profile)


@router.delete("/{profile_id}", status_code=204)
def delete_profile(
    engine_id: str,
    profile_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
):
    engine_query = db.query(EdgeEngine).filter(EdgeEngine.id == engine_id)
    project_id = None
    if ctx and ctx.tenant_id:
        project = get_project(db, ctx)
        if project:
            project_id = project.id
            engine_query = engine_query.filter(or_(EdgeEngine.project_id == project.id, EdgeEngine.is_shared == True))  # noqa: E712
        else:
            raise HTTPException(404, "Edge engine not found")
    engine = engine_query.first()
    if not engine:
        raise HTTPException(404, "Edge engine not found")

    profile_query = db.query(EdgeAgentProfile).filter(
        EdgeAgentProfile.id == profile_id,
        EdgeAgentProfile.engine_id == engine_id
    )
    if ctx and ctx.tenant_id:
        profile_query = profile_query.filter(EdgeAgentProfile.project_id == project_id)

    profile = profile_query.first()
    if not profile:
        raise HTTPException(404, "Agent profile not found")

    db.delete(profile)
    db.commit()

    background_tasks.add_task(_sync_profiles_to_engines, engine_id)
