"""
Cloudflare Workers Deploy Router

One-click deployment of the Edge Engine to Cloudflare Workers via API v4.
This is a control plane operation — lives in the main app, not the sync sub-app.

Endpoints:
    POST /api/cloudflare/connect  — Validate token, detect account, list workers
    POST /api/cloudflare/deploy   — Build + upload Worker + set secrets + register engine
    POST /api/cloudflare/status   — Check deployment status
    POST /api/cloudflare/teardown — Remove Worker + deactivate engine
"""

import os
import subprocess
import uuid
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from ..database.config import SessionLocal
from ..models.models import EdgeEngine, EdgeDatabase, EdgeProviderAccount

router = APIRouter(prefix="/api/cloudflare", tags=["Cloudflare Deploy"])

CF_API = "https://api.cloudflare.com/client/v4"

# Path to the edge service
EDGE_DIR = Path(os.getcwd()).parent / "services" / "edge"
if not EDGE_DIR.exists():
    EDGE_DIR = Path(__file__).parent.parent.parent.parent / "services" / "edge"


# =============================================================================
# Pydantic Schemas
# =============================================================================

class ConnectRequest(BaseModel):
    """List existing workers for a provider account."""
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")


class DeployRequest(BaseModel):
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")
    worker_name: str = Field(default="frontbase-edge", description="Worker script name")
    edge_db_id: Optional[str] = Field(None, description="EdgeDatabase ID to attach (uses default if omitted)")
    upstash_url: Optional[str] = Field(None, description="Upstash REST URL")
    upstash_token: Optional[str] = Field(None, description="Upstash REST token")


class StatusRequest(BaseModel):
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")
    worker_name: str = "frontbase-edge"


class TeardownRequest(BaseModel):
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")
    worker_name: str = "frontbase-edge"


# =============================================================================
# Helpers
# =============================================================================

def _get_provider_credentials(provider_id: str):
    """Retrieve Cloudflare credentials from the EdgeProviderAccount."""
    db = SessionLocal()
    try:
        provider = db.query(EdgeProviderAccount).filter(
            EdgeProviderAccount.id == provider_id,
            EdgeProviderAccount.provider == "cloudflare"
        ).first()
        if not provider:
            raise HTTPException(404, "Cloudflare provider account not found")
            
        creds = json.loads(str(provider.provider_credentials or "{}"))
        if "api_token" not in creds:
            raise HTTPException(400, "Provider account missing api_token")
            
        return creds["api_token"], creds.get("account_id")
    finally:
        db.close()


def _headers(api_token: str) -> dict:
    return {"Authorization": f"Bearer {api_token}"}


def _list_workers(api_token: str, account_id: str) -> list:
    """List all Workers scripts for an account (uses requests for Windows compat)."""
    import requests as req
    hdrs = _headers(api_token)
    
    resp = req.get(
        f"{CF_API}/accounts/{account_id}/workers/scripts",
        headers=hdrs,
        timeout=15.0,
    )
    if resp.status_code != 200:
        return []  # Non-fatal — just return empty list
    data = resp.json()
    scripts = data.get("result", [])

    # Get the subdomain for URL construction
    subdomain_resp = req.get(
        f"{CF_API}/accounts/{account_id}/workers/subdomain",
        headers=hdrs,
        timeout=10.0,
    )
    subdomain = "workers.dev"
    if subdomain_resp.status_code == 200:
        sub_data = subdomain_resp.json()
        subdomain_name = sub_data.get("result", {}).get("subdomain", "")
        if subdomain_name:
            subdomain = f"{subdomain_name}.workers.dev"

    workers = []
    for s in scripts:
        name = s.get("id", "")
        workers.append({
            "name": name,
            "url": f"https://{name}.{subdomain}",
            "modified_on": s.get("modified_on", ""),
            "created_on": s.get("created_on", ""),
        })
    return workers


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

    metadata = {
        "main_module": "cloudflare-lite.js",
        "compatibility_date": "2024-12-01",
        "compatibility_flags": ["nodejs_compat"],
    }

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
            shell=True,
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

@router.post("/connect")
async def connect_cloudflare(payload: ConnectRequest):
    """
    List existing workers using saved credentials from EdgeProviderAccount.
    
    Uses run_in_executor to run sync httpx calls in a thread,
    avoiding Windows ProactorEventLoop Errno 22 with HTTPS.
    """
    import asyncio
    
    api_token, account_id = _get_provider_credentials(payload.provider_id)
    
    def _do_connect():
        import requests as req
        hdrs = _headers(api_token)
        
        nonlocal account_id
        account_name = ""
        
        # Detect account ID if missing
        if not account_id:
            print("[Cloudflare] Auto-detecting account ID...")
            resp = req.get(
                f"{CF_API}/accounts",
                headers=hdrs,
                params={"per_page": 5},
                timeout=10.0,
            )
            if resp.status_code != 200:
                raise HTTPException(400, f"Failed to list accounts: {resp.text[:300]}")
            accounts = resp.json().get("result", [])
            if not accounts:
                raise HTTPException(400, "No Cloudflare accounts found for this API token")
            account_id = accounts[0]["id"]
            account_name = accounts[0].get("name", "")
            
            # Save detected account ID back to DB
            db = SessionLocal()
            try:
                provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == payload.provider_id).first()
                if provider:
                    creds = json.loads(str(provider.provider_credentials or "{}"))
                    creds["account_id"] = account_id
                    provider.provider_credentials = json.dumps(creds)  # type: ignore[assignment]
                    db.commit()
            except Exception:
                db.rollback()
            finally:
                db.close()
                

        # Fetch workers
        print("[Cloudflare] Fetching existing workers...")
        workers = _list_workers(api_token, account_id)
        print(f"[Cloudflare] ✅ Found {len(workers)} worker(s)")

        return {
            "success": True,
            "account_id": account_id,
            "account_name": account_name,
            "workers": workers,
        }
    
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _do_connect)
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Connection failed: {str(e)}")


@router.post("/deploy")
async def deploy_to_cloudflare(payload: DeployRequest):
    """One-click deploy the Edge Engine to Cloudflare Workers."""
    try:
        api_token, account_id = _get_provider_credentials(payload.provider_id)

        if not account_id:
            print("[Cloudflare] Auto-detecting account ID...")
            account_id = await _detect_account_id(api_token)
            
            # Save it explicitly in the db 
            db = SessionLocal()
            try:
                provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == payload.provider_id).first()
                if provider:
                    creds = json.loads(str(provider.provider_credentials or "{}"))
                    creds["account_id"] = account_id
                    provider.provider_credentials = json.dumps(creds)  # type: ignore[assignment]
                    db.commit()
            finally:
                db.close()


        # Build & upload Worker
        script_content = _build_worker()
        print(f"[Cloudflare] Uploading Worker '{payload.worker_name}'...")
        await _upload_worker(api_token, account_id, payload.worker_name, script_content)
        
        worker_url = await _enable_workers_dev(api_token, account_id, payload.worker_name)
        
        # Set secrets
        secrets = {}
        edge_db_id_to_attach = None

        db_session = SessionLocal()
        try:
            edge_db = None
            if payload.edge_db_id:
                edge_db = db_session.query(EdgeDatabase).filter(EdgeDatabase.id == payload.edge_db_id).first()
            else:
                edge_db = db_session.query(EdgeDatabase).filter(EdgeDatabase.is_default == True).first()

            if edge_db:
                secrets["FRONTBASE_STATE_DB_URL"] = str(edge_db.db_url)
                if edge_db.db_token:  # type: ignore[truthy-bool]
                    secrets["FRONTBASE_STATE_DB_TOKEN"] = str(edge_db.db_token)
                edge_db_id_to_attach = str(edge_db.id)
        finally:
            db_session.close()

        # Upstash Secrets
        if payload.upstash_url:
            secrets["UPSTASH_REDIS_REST_URL"] = payload.upstash_url
        if payload.upstash_token:
            secrets["UPSTASH_REDIS_REST_TOKEN"] = payload.upstash_token

        if secrets:
            await _set_secrets(api_token, account_id, payload.worker_name, secrets)

        # Register as Edge Engine
        engine_id = None
        db = SessionLocal()
        try:
            existing = db.query(EdgeEngine).filter(EdgeEngine.url == worker_url).first()
            now = datetime.utcnow().isoformat()
            
            engine_cfg = json.dumps({
                "worker_name": payload.worker_name,
                "secret_names": list(secrets.keys()),
            })

            if existing:
                existing.is_active = True  # type: ignore[assignment]
                existing.edge_provider_id = payload.provider_id  # type: ignore[assignment]
                existing.edge_db_id = edge_db_id_to_attach  # type: ignore[assignment]
                existing.engine_config = engine_cfg  # type: ignore[assignment]
                existing.updated_at = now  # type: ignore[assignment]
                engine_id = str(existing.id)
                db.commit()
            else:
                engine = EdgeEngine(
                    id=str(uuid.uuid4()),
                    name=f"Cloudflare: {payload.worker_name}",
                    edge_provider_id=payload.provider_id,
                    adapter_type="edge",
                    url=worker_url,
                    edge_db_id=edge_db_id_to_attach,
                    engine_config=engine_cfg,
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
                db.add(engine)
                db.commit()
                engine_id = str(engine.id)
        except Exception as e:
            db.rollback()
            print(f"[Cloudflare] Warning: engine registration failed: {e}")
        finally:
            db.close()

        return {
            "success": True,
            "url": worker_url,
            "worker_name": payload.worker_name,
            "account_id": account_id,
            "engine_id": engine_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Deploy failed: {str(e) or 'Unknown error'}")


@router.post("/status")
async def cloudflare_status(payload: StatusRequest):
    """Check if a Worker is deployed and get its details."""
    try:
        api_token, account_id = _get_provider_credentials(payload.provider_id)

        if not account_id:
            account_id = await _detect_account_id(api_token)

        url = f"{CF_API}/accounts/{account_id}/workers/scripts/{payload.worker_name}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                headers=_headers(api_token),
                timeout=10.0,
            )

        if resp.status_code == 404:
            return {"deployed": False, "worker_name": payload.worker_name}

        if resp.status_code != 200:
            raise HTTPException(400, f"Status check failed: {resp.text[:300]}")

        worker_url = await _enable_workers_dev(api_token, account_id, payload.worker_name)

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
    """Remove a Worker and deactivate its edge engine target."""
    try:
        api_token, account_id = _get_provider_credentials(payload.provider_id)
        if not account_id:
            account_id = await _detect_account_id(api_token)

        # Delete Worker
        url = f"{CF_API}/accounts/{account_id}/workers/scripts/{payload.worker_name}"
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                url,
                headers=_headers(api_token),
                timeout=15.0,
            )

        if resp.status_code not in (200, 204):
            raise HTTPException(400, f"Teardown failed: {resp.text[:300]}")

        # Deactivate Edge Engine
        db = SessionLocal()
        try:
            engines = db.query(EdgeEngine).filter(
                EdgeEngine.name.contains(payload.worker_name),
            ).all()
            for t in engines:
                t.is_active = False  # type: ignore[assignment]
                t.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
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
