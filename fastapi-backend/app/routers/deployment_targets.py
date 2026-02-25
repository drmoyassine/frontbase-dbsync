"""
Deployment Targets API Router

CRUD endpoints for managing edge deployment targets.
Each target represents an Edge Engine deployment on a specific provider
(Cloudflare Workers, Vercel Edge, Docker, etc.).

The publish pipeline uses active targets to push pages to each endpoint.
"""

from fastapi import APIRouter, HTTPException, Query
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
    edge_db_id: Optional[str] = None
    is_active: bool
    is_system: bool = False
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class TestConnectionResult(BaseModel):
    """Result of testing a deployment target connection."""
    success: bool
    message: str
    latency_ms: Optional[float] = None


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
        target.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]

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
async def delete_deployment_target(
    target_id: str,
    delete_remote: bool = Query(False, description="Also delete the remote resource (e.g. CF Worker)")
):
    """Delete a deployment target. Optionally delete the remote resource too."""
    db = SessionLocal()
    try:
        target = db.query(DeploymentTarget).filter(DeploymentTarget.id == target_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Deployment target not found")

        if target.is_system:  # type: ignore[truthy-bool]
            raise HTTPException(status_code=403, detail="Cannot delete a system deployment target")

        # Remote Cloudflare Worker deletion
        if delete_remote and str(target.provider) == "cloudflare":
            await _delete_cloudflare_worker(target)

        db.delete(target)
        db.commit()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# =============================================================================
# Test Connection
# =============================================================================

@router.post("/{target_id}/test", response_model=TestConnectionResult)
async def test_deployment_target(target_id: str):
    """Test connectivity to a deployment target by hitting its /api/health endpoint."""
    db = SessionLocal()
    try:
        target = db.query(DeploymentTarget).filter(DeploymentTarget.id == target_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Deployment target not found")
        url = target.url
        provider = target.provider
    finally:
        db.close()

    return await _test_target_connection(str(url), str(provider))


async def _test_target_connection(url: str, provider: str) -> TestConnectionResult:
    """Test connectivity to a deployment target."""
    import httpx
    import time

    health_url = f"{url.rstrip('/')}/api/health"

    try:
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(health_url)
        latency_ms = round((time.monotonic() - start) * 1000, 1)

        if response.is_success:
            return TestConnectionResult(
                success=True,
                message=f"{provider.title()} target is reachable",
                latency_ms=latency_ms,
            )
        else:
            return TestConnectionResult(
                success=False,
                message=f"Target returned HTTP {response.status_code}",
                latency_ms=latency_ms,
            )
    except httpx.ConnectError:
        return TestConnectionResult(
            success=False,
            message="Connection refused — is the target running?",
        )
    except httpx.TimeoutException:
        return TestConnectionResult(
            success=False,
            message="Connection timed out after 5s",
        )
    except Exception as e:
        return TestConnectionResult(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


# =============================================================================
# Remote Delete Helpers
# =============================================================================

async def _delete_cloudflare_worker(target: DeploymentTarget):
    """Delete a Cloudflare Worker using the stored API token."""
    import httpx
    import json

    # Try to get stored CF credentials from the project settings
    try:
        from ..models.models import Project
        db = SessionLocal()
        try:
            project = db.query(Project).first()
            if not project or not project.settings:
                raise HTTPException(400, "No project settings found — cannot retrieve CF API token")

            settings = project.settings if isinstance(project.settings, dict) else json.loads(project.settings)
            cf_settings = settings.get("cloudflare", {})
            api_token = cf_settings.get("api_token")
            account_id = cf_settings.get("account_id")

            if not api_token:
                raise HTTPException(400, "No Cloudflare API token stored — deploy a worker first")
        finally:
            db.close()

        # Extract worker name from URL (e.g. "frontbase-edge.account.workers.dev" → "frontbase-edge")
        worker_name = str(target.name)  # Fallback to target name
        target_url = str(target.url or "")
        if target_url and "workers.dev" in target_url:
            # https://worker-name.subdomain.workers.dev → worker-name
            from urllib.parse import urlparse
            parsed = urlparse(target_url)
            parts = (parsed.hostname or "").split(".")
            if len(parts) >= 3:
                worker_name = parts[0]

        # Call CF API to delete the worker
        delete_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{worker_name}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.delete(
                delete_url,
                headers={"Authorization": f"Bearer {api_token}"}
            )

        if not response.is_success:
            result = response.json()
            errors = result.get("errors", [{}])
            err_msg = errors[0].get("message", response.text) if errors else response.text
            raise HTTPException(502, f"Failed to delete CF Worker: {err_msg}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Remote delete failed: {str(e)}")


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

