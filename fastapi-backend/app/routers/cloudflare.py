"""
Cloudflare Workers Deploy Router

One-click deployment of the Edge Engine to Cloudflare Workers via API v4.
This is a control plane operation — lives in the main app, not the sync sub-app.

Endpoints:
    POST /api/cloudflare/deploy   — Build + upload Worker + set secrets + register target
    GET  /api/cloudflare/status   — Check deployment status
    DELETE /api/cloudflare/teardown — Remove Worker + deactivate target
"""

import os
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..database.config import SessionLocal
from ..models.models import DeploymentTarget

router = APIRouter(prefix="/api/cloudflare", tags=["Cloudflare Deploy"])

CF_API = "https://api.cloudflare.com/client/v4"

# Path to the edge service (relative to fastapi-backend/)
EDGE_DIR = Path(__file__).parent.parent.parent.parent / "services" / "edge"


# =============================================================================
# Pydantic Schemas
# =============================================================================

class DeployRequest(BaseModel):
    api_token: str = Field(..., description="Cloudflare API token with Workers Scripts: Edit")
    account_id: Optional[str] = Field(None, description="Cloudflare account ID (auto-detected if omitted)")
    worker_name: str = Field(default="frontbase-edge", description="Worker script name")
    # Turso credentials (passed as Worker secrets)
    turso_url: Optional[str] = Field(None, description="Turso libsql:// URL")
    turso_token: Optional[str] = Field(None, description="Turso auth token")
    # Upstash credentials (passed as Worker secrets)
    upstash_url: Optional[str] = Field(None, description="Upstash REST URL")
    upstash_token: Optional[str] = Field(None, description="Upstash REST token")


class StatusRequest(BaseModel):
    api_token: str
    account_id: Optional[str] = None
    worker_name: str = "frontbase-edge"


class TeardownRequest(BaseModel):
    api_token: str
    account_id: Optional[str] = None
    worker_name: str = "frontbase-edge"


# =============================================================================
# Helpers
# =============================================================================

def _headers(api_token: str) -> dict:
    return {"Authorization": f"Bearer {api_token}"}


async def _detect_account_id(api_token: str) -> str:
    """Auto-detect the first Cloudflare account ID from the API token."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{CF_API}/accounts",
            headers=_headers(api_token),
            params={"per_page": 1},
            timeout=10.0,
        )
        if resp.status_code != 200:
            raise HTTPException(400, f"Failed to list accounts: {resp.text[:300]}")
        data = resp.json()
        accounts = data.get("result", [])
        if not accounts:
            raise HTTPException(400, "No Cloudflare accounts found for this API token")
        return accounts[0]["id"]


async def _upload_worker(api_token: str, account_id: str, worker_name: str, script_content: str) -> dict:
    """Upload a Worker script via Cloudflare API v4 (ES module format)."""
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}"

    # Metadata for ES module worker
    metadata = {
        "main_module": "cloudflare-lite.js",
        "compatibility_date": "2024-12-01",
        "compatibility_flags": ["nodejs_compat"],
    }

    import json
    # Multipart upload: metadata + script file
    files = {
        "metadata": (None, json.dumps(metadata), "application/json"),
        "cloudflare-lite.js": ("cloudflare-lite.js", script_content, "application/javascript+module"),
    }

    async with httpx.AsyncClient() as client:
        resp = await client.put(
            url,
            headers=_headers(api_token),
            files=files,
            timeout=30.0,
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(400, f"Worker upload failed: {resp.text[:500]}")
        return resp.json()


async def _enable_workers_dev(api_token: str, account_id: str, worker_name: str) -> str:
    """Enable the workers.dev subdomain for the worker."""
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/subdomain"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers={**_headers(api_token), "Content-Type": "application/json"},
            json={"enabled": True},
            timeout=10.0,
        )
        # Get the subdomain
        subdomain_resp = await client.get(
            f"{CF_API}/accounts/{account_id}/workers/subdomain",
            headers=_headers(api_token),
            timeout=10.0,
        )
        subdomain = "workers.dev"
        if subdomain_resp.status_code == 200:
            sub_data = subdomain_resp.json()
            subdomain_name = sub_data.get("result", {}).get("subdomain", "")
            if subdomain_name:
                subdomain = f"{subdomain_name}.workers.dev"

        return f"https://{worker_name}.{subdomain}"


async def _set_secrets(api_token: str, account_id: str, worker_name: str, secrets: dict) -> None:
    """Set Worker secrets (environment variables that are encrypted)."""
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/secrets"

    async with httpx.AsyncClient() as client:
        for name, value in secrets.items():
            if value:
                resp = await client.put(
                    url,
                    headers={**_headers(api_token), "Content-Type": "application/json"},
                    json={"name": name, "text": value, "type": "secret_text"},
                    timeout=10.0,
                )
                if resp.status_code not in (200, 201):
                    print(f"[Cloudflare] Warning: Failed to set secret {name}: {resp.status_code}")


def _build_worker() -> str:
    """Build the lightweight Cloudflare Worker bundle and return the script content."""
    dist_file = EDGE_DIR / "dist" / "cloudflare-lite.js"

    # Always rebuild to ensure fresh bundle
    if dist_file.exists():
        dist_file.unlink()

    print(f"[Cloudflare] Building lightweight Worker bundle in {EDGE_DIR}...")
    try:
        result = subprocess.run(
            ["npx", "tsup", "--config", "tsup.cloudflare-lite.ts"],
            cwd=str(EDGE_DIR),
            capture_output=True,
            text=True,
            timeout=60,
            shell=True,  # Required on Windows
        )

        if result.returncode != 0:
            err = result.stderr.strip() or result.stdout.strip() or "Unknown build error"
            raise HTTPException(500, f"Build failed: {err[:500]}")
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Build timed out after 60 seconds")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Build process failed: {str(e)}")

    if not dist_file.exists():
        raise HTTPException(500, f"Build output not found at {dist_file}")

    content = dist_file.read_text(encoding="utf-8")
    print(f"[Cloudflare] Lite bundle built: {len(content)} bytes ({len(content)//1024} KB)")
    return content


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/deploy")
async def deploy_to_cloudflare(payload: DeployRequest):
    """
    One-click deploy the Edge Engine to Cloudflare Workers.
    
    1. Auto-detect account ID if not provided
    2. Build the cloudflare.js bundle
    3. Upload Worker script via API
    4. Enable workers.dev subdomain
    5. Set secrets (Turso, Upstash)
    6. Auto-register as deployment target
    """
    try:
        # 1. Detect account ID
        account_id = payload.account_id
        if not account_id:
            print("[Cloudflare] Auto-detecting account ID...")
            account_id = await _detect_account_id(payload.api_token)
            print(f"[Cloudflare] Account ID: {account_id}")

        # 2. Build the bundle
        script_content = _build_worker()

        # 3. Upload Worker
        print(f"[Cloudflare] Uploading Worker '{payload.worker_name}'...")
        upload_result = await _upload_worker(
            payload.api_token, account_id, payload.worker_name, script_content
        )
        print(f"[Cloudflare] ✅ Worker uploaded")

        # 4. Enable workers.dev subdomain
        worker_url = await _enable_workers_dev(
            payload.api_token, account_id, payload.worker_name
        )
        print(f"[Cloudflare] ✅ Workers.dev URL: {worker_url}")

        # 5. Set secrets
        secrets = {}
        if payload.turso_url:
            secrets["FRONTBASE_STATE_DB_URL"] = payload.turso_url
        if payload.turso_token:
            secrets["FRONTBASE_STATE_DB_TOKEN"] = payload.turso_token
        if payload.upstash_url:
            secrets["UPSTASH_REDIS_REST_URL"] = payload.upstash_url
        if payload.upstash_token:
            secrets["UPSTASH_REDIS_REST_TOKEN"] = payload.upstash_token

        # Also try to pull Turso/Upstash from existing settings
        if not payload.turso_url:
            try:
                from ..routers.settings import load_settings
                settings = load_settings()
                turso_cfg = settings.get("turso", {})
                if turso_cfg.get("turso_enabled") and turso_cfg.get("turso_url"):
                    secrets["FRONTBASE_STATE_DB_URL"] = turso_cfg["turso_url"]
                    secrets["FRONTBASE_STATE_DB_TOKEN"] = turso_cfg.get("turso_token", "")
                redis_cfg = settings.get("redis", {})
                if redis_cfg.get("redis_type") == "upstash" and redis_cfg.get("redis_url"):
                    secrets["UPSTASH_REDIS_REST_URL"] = redis_cfg["redis_url"]
                    secrets["UPSTASH_REDIS_REST_TOKEN"] = redis_cfg.get("redis_token", "")
            except Exception:
                pass

        if secrets:
            print(f"[Cloudflare] Setting {len(secrets)} secret(s)...")
            await _set_secrets(payload.api_token, account_id, payload.worker_name, secrets)
            print(f"[Cloudflare] ✅ Secrets configured")

        # 6. Auto-register as deployment target
        target_id = None
        db = SessionLocal()
        try:
            # Check if target already exists for this URL
            existing = db.query(DeploymentTarget).filter(
                DeploymentTarget.url == worker_url
            ).first()

            now = datetime.utcnow().isoformat()
            if existing:
                existing.is_active = True
                existing.updated_at = now
                target_id = existing.id
                db.commit()
                print(f"[Cloudflare] Re-activated existing target: {existing.name}")
            else:
                target = DeploymentTarget(
                    id=str(uuid.uuid4()),
                    name=f"Cloudflare: {payload.worker_name}",
                    provider="cloudflare",
                    adapter_type="edge",
                    url=worker_url,
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
                db.add(target)
                db.commit()
                target_id = target.id
                print(f"[Cloudflare] ✅ Registered deployment target: {worker_url}")
        except Exception as e:
            db.rollback()
            print(f"[Cloudflare] Warning: target registration failed: {e}")
        finally:
            db.close()

        return {
            "success": True,
            "url": worker_url,
            "worker_name": payload.worker_name,
            "account_id": account_id,
            "target_id": target_id,
            "secrets_set": list(secrets.keys()),
        }

    except HTTPException as he:
        print(f"[Cloudflare] ❌ Deploy failed: {he.detail}")
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Deploy failed: {str(e) or 'Unknown error — check backend logs'}")


@router.post("/status")
async def cloudflare_status(payload: StatusRequest):
    """Check if a Worker is deployed and get its details."""
    try:
        account_id = payload.account_id
        if not account_id:
            account_id = await _detect_account_id(payload.api_token)

        url = f"{CF_API}/accounts/{account_id}/workers/scripts/{payload.worker_name}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                headers=_headers(payload.api_token),
                timeout=10.0,
            )

        if resp.status_code == 404:
            return {"deployed": False, "worker_name": payload.worker_name}

        if resp.status_code != 200:
            raise HTTPException(400, f"Status check failed: {resp.text[:300]}")

        # Get the workers.dev URL
        worker_url = await _enable_workers_dev(
            payload.api_token, account_id, payload.worker_name
        )

        return {
            "deployed": True,
            "worker_name": payload.worker_name,
            "account_id": account_id,
            "url": worker_url,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/teardown")
async def teardown_cloudflare(payload: TeardownRequest):
    """Remove a Worker and deactivate its deployment target."""
    try:
        account_id = payload.account_id
        if not account_id:
            account_id = await _detect_account_id(payload.api_token)

        # Delete the Worker
        url = f"{CF_API}/accounts/{account_id}/workers/scripts/{payload.worker_name}"
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                url,
                headers=_headers(payload.api_token),
                timeout=15.0,
            )

        if resp.status_code not in (200, 204):
            raise HTTPException(400, f"Teardown failed: {resp.text[:300]}")

        # Deactivate deployment target
        db = SessionLocal()
        try:
            targets = db.query(DeploymentTarget).filter(
                DeploymentTarget.provider == "cloudflare",
                DeploymentTarget.name.contains(payload.worker_name),
            ).all()
            for t in targets:
                t.is_active = False
                t.updated_at = datetime.utcnow().isoformat()
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

        return {
            "success": True,
            "message": f"Worker '{payload.worker_name}' deleted",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
