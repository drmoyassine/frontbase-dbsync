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
import asyncio
import subprocess
import hashlib
import uuid
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from ..database.config import SessionLocal
from ..models.models import EdgeEngine, EdgeDatabase, EdgeCache, EdgeQueue, EdgeProviderAccount

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
    adapter_type: str = Field(default="automations", description="Engine type: 'automations' (Lite) or 'full'")
    edge_db_id: Optional[str] = Field(None, description="EdgeDatabase ID to attach (uses default if omitted)")
    edge_cache_id: Optional[str] = Field(None, description="EdgeCache ID to attach")
    edge_queue_id: Optional[str] = Field(None, description="EdgeQueue ID to attach")
    cache_url: Optional[str] = Field(None, description="Cache REST URL (Upstash, SRH, etc.)")
    cache_token: Optional[str] = Field(None, description="Cache REST auth token")


class StatusRequest(BaseModel):
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")
    worker_name: str = "frontbase-edge"


class TeardownRequest(BaseModel):
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")
    worker_name: str = "frontbase-edge"


class InspectRequest(BaseModel):
    """Inspect a deployed worker's content, settings, or secrets."""
    provider_id: str = Field(..., description="ID of the EdgeProviderAccount")
    worker_name: str = Field(..., description="Worker script name to inspect")


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


async def _upload_worker(api_token: str, account_id: str, worker_name: str, script_content: str, script_filename: str = "cloudflare-lite.js") -> dict:
    """Upload a Worker script via Cloudflare API v4 (ES module format)."""
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}"

    metadata = {
        "main_module": script_filename,
        "compatibility_date": "2024-12-01",
        "compatibility_flags": ["nodejs_compat"],
    }

    files = {
        "metadata": (None, json.dumps(metadata), "application/json"),
        script_filename: (script_filename, script_content, "application/javascript+module"),
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
            if value is not None:
                try:
                    resp = await client.put(
                        url,
                        headers={**_headers(api_token), "Content-Type": "application/json"},
                        json={"name": name, "text": value, "type": "secret_text"},
                        timeout=30.0,
                    )
                    if resp.status_code not in (200, 201):
                        print(f"[Cloudflare] Warning: Failed to set secret {name}: {resp.status_code}")
                except httpx.TimeoutException:
                    raise HTTPException(
                        status_code=504,
                        detail=f"Cloudflare API timed out while setting secret '{name}'. "
                               f"The Worker was uploaded but secrets may be incomplete. Try again."
                    )
                except httpx.HTTPError as e:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Cloudflare API error while setting secret '{name}': {e}"
                    )


def _compute_bundle_hash(content: str) -> str:
    """Compute a 12-char SHA-256 hash of a bundle."""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()[:12]


def _get_current_bundle_hash(adapter_type: str = "automations") -> str | None:
    """Read the current dist bundle and return its hash WITHOUT rebuilding.
    
    Returns None if the dist file doesn't exist (hasn't been built yet).
    """
    is_full = adapter_type == "full"
    output_file = "cloudflare.js" if is_full else "cloudflare-lite.js"
    dist_file = EDGE_DIR / "dist" / output_file
    if dist_file.exists():
        content = dist_file.read_text(encoding="utf-8")
        return _compute_bundle_hash(content)
    return None


def _build_worker(adapter_type: str = "automations") -> tuple[str, str]:
    """Build the Cloudflare Worker bundle and return (script_content, bundle_hash).
    
    In Docker/VPS: delegates to the edge container's /api/build-bundle endpoint.
    In local dev: runs npx tsup directly (edge source is available locally).
    """
    is_full = adapter_type == "full"
    label = "Full" if is_full else "Lite"

    # --- Strategy 1: Delegate to edge container (Docker/VPS) ---
    edge_url = os.environ.get("EDGE_URL", os.environ.get("EDGE_SSR_URL", ""))
    if edge_url:
        import requests as req
        build_url = f"{edge_url}/api/build-bundle"
        print(f"[Cloudflare] Delegating {label} bundle build to edge container ({build_url})...")
        try:
            resp = req.post(
                build_url,
                json={"adapter_type": adapter_type},
                timeout=120 if is_full else 60,
            )
            data = resp.json()
            if resp.status_code != 200 or not data.get("success"):
                err = data.get("error", "Unknown build error")
                raise HTTPException(500, f"Edge build failed: {err[:500]}")
            
            content = data["script_content"]
            bundle_hash = _compute_bundle_hash(content)
            print(f"[Cloudflare] {label} bundle received: {len(content)} bytes ({len(content)//1024} KB) hash={bundle_hash}")
            return content, bundle_hash
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Cloudflare] Edge build delegation failed: {e}, trying local fallback...")

    # --- Strategy 2: Local build (development) ---
    if not EDGE_DIR.exists():
        raise HTTPException(500, f"Edge service not available for building. EDGE_DIR={EDGE_DIR} does not exist and EDGE_URL is not set.")

    config_file = "tsup.cloudflare.ts" if is_full else "tsup.cloudflare-lite.ts"
    output_file = "cloudflare.js" if is_full else "cloudflare-lite.js"
    dist_file = EDGE_DIR / "dist" / output_file

    if dist_file.exists():
        dist_file.unlink()

    print(f"[Cloudflare] Building {label} Worker bundle locally in {EDGE_DIR}...")
    try:
        result = subprocess.run(
            ["npx", "tsup", "--config", config_file],
            cwd=str(EDGE_DIR),
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=120 if is_full else 60,
            shell=True,
        )

        if result.returncode != 0:
            err = result.stderr.strip() or result.stdout.strip() or "Unknown build error"
            raise HTTPException(500, f"Build failed: {err[:500]}")
    except subprocess.TimeoutExpired:
        raise HTTPException(500, f"Build timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Build process failed: {str(e)}")

    if not dist_file.exists():
        raise HTTPException(500, f"Build output not found at {dist_file}")

    content = dist_file.read_text(encoding="utf-8")
    bundle_hash = _compute_bundle_hash(content)
    print(f"[Cloudflare] {label} bundle built: {len(content)} bytes ({len(content)//1024} KB) hash={bundle_hash}")
    return content, bundle_hash


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
        script_content, bundle_hash = _build_worker(payload.adapter_type)
        print(f"[Cloudflare] Uploading Worker '{payload.worker_name}' (hash={bundle_hash})...")

        # Pick the correct output filename for upload metadata
        script_filename = "cloudflare.js" if payload.adapter_type == "full" else "cloudflare-lite.js"
        await _upload_worker(api_token, account_id, payload.worker_name, script_content, script_filename)
        
        worker_url = await _enable_workers_dev(api_token, account_id, payload.worker_name)
        
        # Set secrets
        secrets = {}
        edge_db_id_to_attach = None
        edge_cache_id_to_attach = payload.edge_cache_id
        # '__none__' sentinel means user explicitly chose "No Database/Cache"
        if edge_cache_id_to_attach == "__none__":
            edge_cache_id_to_attach = None

        db_session = SessionLocal()
        try:
            edge_db = None
            if payload.edge_db_id == "__none__":
                # User explicitly chose "None (No Database)" — skip DB entirely
                edge_db = None
            elif payload.edge_db_id:
                edge_db = db_session.query(EdgeDatabase).filter(EdgeDatabase.id == payload.edge_db_id).first()
            else:
                # No DB specified — use system default
                edge_db = db_session.query(EdgeDatabase).filter(EdgeDatabase.is_default == True).first()

            if edge_db:
                secrets["FRONTBASE_STATE_DB_URL"] = str(edge_db.db_url)
                if edge_db.db_token:  # type: ignore[truthy-bool]
                    secrets["FRONTBASE_STATE_DB_TOKEN"] = str(edge_db.db_token)
                edge_db_id_to_attach = str(edge_db.id)
        finally:
            db_session.close()

        # Cache Secrets — resolve from EdgeCache table or direct payload
        if payload.cache_url:
            secrets["FRONTBASE_CACHE_URL"] = payload.cache_url
        if payload.cache_token:
            secrets["FRONTBASE_CACHE_TOKEN"] = payload.cache_token

        # If no direct cache URL but edge_cache_id was provided, look up from EdgeCache table
        if not payload.cache_url and edge_cache_id_to_attach:
            cache_session = SessionLocal()
            try:
                edge_cache = cache_session.query(EdgeCache).filter(EdgeCache.id == edge_cache_id_to_attach).first()
                if edge_cache:
                    secrets["FRONTBASE_CACHE_URL"] = str(edge_cache.cache_url)
                    if edge_cache.cache_token:  # type: ignore[truthy-bool]
                        secrets["FRONTBASE_CACHE_TOKEN"] = str(edge_cache.cache_token)
            finally:
                cache_session.close()

        # Queue secrets — provider-agnostic FRONTBASE_QUEUE_* vars from EdgeQueue
        edge_queue_id_to_attach = payload.edge_queue_id
        if edge_queue_id_to_attach == "__none__":
            edge_queue_id_to_attach = None
        if edge_queue_id_to_attach:
            queue_session = SessionLocal()
            try:
                edge_queue = queue_session.query(EdgeQueue).filter(EdgeQueue.id == edge_queue_id_to_attach).first()
                if edge_queue:
                    secrets["FRONTBASE_QUEUE_PROVIDER"] = str(edge_queue.provider)
                    secrets["FRONTBASE_QUEUE_URL"] = str(edge_queue.queue_url)
                    if edge_queue.queue_token:  # type: ignore[truthy-bool]
                        secrets["FRONTBASE_QUEUE_TOKEN"] = str(edge_queue.queue_token)
                    if edge_queue.signing_key:  # type: ignore[truthy-bool]
                        secrets["FRONTBASE_QUEUE_SIGNING_KEY"] = str(edge_queue.signing_key)
                    if edge_queue.next_signing_key:  # type: ignore[truthy-bool]
                        secrets["FRONTBASE_QUEUE_NEXT_SIGNING_KEY"] = str(edge_queue.next_signing_key)
            finally:
                queue_session.close()

        if secrets:
            try:
                await _set_secrets(api_token, account_id, payload.worker_name, secrets)
            except HTTPException:
                raise  # Re-raise clear error messages from _set_secrets
            except Exception as e:
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to push secrets to Cloudflare: {e}"
                )

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
            deployed_at = datetime.utcnow().isoformat() + "Z"

            if existing:
                existing.is_active = True  # type: ignore[assignment]
                existing.edge_provider_id = payload.provider_id  # type: ignore[assignment]
                existing.edge_db_id = edge_db_id_to_attach  # type: ignore[assignment]
                existing.edge_cache_id = edge_cache_id_to_attach  # type: ignore[assignment]
                existing.edge_queue_id = edge_queue_id_to_attach  # type: ignore[assignment]
                existing.engine_config = engine_cfg  # type: ignore[assignment]
                existing.bundle_checksum = bundle_hash  # type: ignore[assignment]
                existing.last_deployed_at = deployed_at  # type: ignore[assignment]
                existing.updated_at = now  # type: ignore[assignment]
                engine_id = str(existing.id)
                db.commit()
            else:
                engine = EdgeEngine(
                    id=str(uuid.uuid4()),
                    name=f"Cloudflare: {payload.worker_name}",
                    edge_provider_id=payload.provider_id,
                    adapter_type=payload.adapter_type,
                    url=worker_url,
                    edge_db_id=edge_db_id_to_attach,
                    edge_cache_id=edge_cache_id_to_attach,
                    edge_queue_id=edge_queue_id_to_attach,
                    engine_config=engine_cfg,
                    bundle_checksum=bundle_hash,
                    last_deployed_at=deployed_at,
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


# =============================================================================
# Edge Inspector Endpoints
# =============================================================================

def _inspect_content_sync(api_token: str, account_id: str, worker_name: str) -> dict:
    """Sync helper: fetch worker script source via CF API v4."""
    import requests as req
    hdrs = _headers(api_token)

    # Use /content/v2 which supports API Token auth
    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/content/v2"
    resp = req.get(url, headers=hdrs, timeout=30.0)

    if resp.status_code == 404:
        return {"error": f"Worker '{worker_name}' not found", "status": 404}
    if resp.status_code != 200:
        # Fallback: try the download endpoint
        url2 = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}"
        resp = req.get(url2, headers=hdrs, timeout=30.0)
        if resp.status_code != 200:
            return {"error": f"CF API error ({resp.status_code}): {resp.text[:300]}", "status": resp.status_code}

    content = resp.text
    # Determine filename from content-disposition or fallback
    cd = resp.headers.get("content-disposition", "")
    filename = "worker.js"
    if "filename=" in cd:
        filename = cd.split("filename=")[-1].strip('"').strip("'")

    return {
        "success": True,
        "content": content,
        "filename": filename,
        "size_bytes": len(content.encode("utf-8")),
    }


def _inspect_settings_sync(api_token: str, account_id: str, worker_name: str) -> dict:
    """Sync helper: fetch worker settings, bindings, routes, crons."""
    import requests as req
    hdrs = _headers(api_token)

    url = f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/settings"
    resp = req.get(url, headers=hdrs, timeout=15.0)

    if resp.status_code == 404:
        return {"error": f"Worker '{worker_name}' not found", "status": 404}
    if resp.status_code != 200:
        return {"error": f"CF API error ({resp.status_code}): {resp.text[:300]}", "status": resp.status_code}

    data = resp.json()
    result = data.get("result", {})

    # Extract bindings (KV, D1, R2, DO — exclude secrets)
    bindings = result.get("bindings", [])
    non_secret_bindings = [b for b in bindings if b.get("type") != "secret_text"]
    secret_names = [b["name"] for b in bindings if b.get("type") == "secret_text"]

    # Fetch cron triggers
    crons = []
    try:
        cron_resp = req.get(
            f"{CF_API}/accounts/{account_id}/workers/scripts/{worker_name}/schedules",
            headers=hdrs, timeout=10.0,
        )
        if cron_resp.status_code == 200:
            crons = cron_resp.json().get("result", {}).get("schedules", [])
    except Exception:
        pass

    # Fetch subdomain info for routes
    routes = []
    try:
        sub_resp = req.get(
            f"{CF_API}/accounts/{account_id}/workers/subdomain",
            headers=hdrs, timeout=10.0,
        )
        if sub_resp.status_code == 200:
            subdomain_name = sub_resp.json().get("result", {}).get("subdomain", "")
            if subdomain_name:
                routes.append({
                    "type": "workers.dev",
                    "pattern": f"{worker_name}.{subdomain_name}.workers.dev",
                })
    except Exception:
        pass

    return {
        "success": True,
        "settings": {
            "compatibility_date": result.get("compatibility_date", "unknown"),
            "compatibility_flags": result.get("compatibility_flags", []),
            "usage_model": result.get("usage_model", "standard"),
            "bindings": non_secret_bindings,
            "routes": routes,
            "cron_triggers": crons,
            "placement": result.get("placement", {}),
            "tail_consumers": result.get("tail_consumers", []),
        },
        "secrets": secret_names,
    }


@router.post("/inspect/content")
async def inspect_worker_content(payload: InspectRequest):
    """Fetch the deployed worker's script source code."""
    try:
        api_token, account_id = _get_provider_credentials(payload.provider_id)
        if not account_id:
            account_id = await _detect_account_id(api_token)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, _inspect_content_sync, api_token, account_id, payload.worker_name
        )

        if "error" in result:
            raise HTTPException(result.get("status", 500), result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/inspect/settings")
async def inspect_worker_settings(payload: InspectRequest):
    """Fetch a worker's settings: bindings, compatibility, routes, crons."""
    try:
        api_token, account_id = _get_provider_credentials(payload.provider_id)
        if not account_id:
            account_id = await _detect_account_id(api_token)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, _inspect_settings_sync, api_token, account_id, payload.worker_name
        )

        if "error" in result:
            raise HTTPException(result.get("status", 500), result["error"])

        # Return settings only (secrets are served by /inspect/secrets)
        return {"success": True, "settings": result["settings"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/inspect/secrets")
async def inspect_worker_secrets(payload: InspectRequest):
    """List secret names deployed to a worker (values are never returned by CF)."""
    try:
        api_token, account_id = _get_provider_credentials(payload.provider_id)
        if not account_id:
            account_id = await _detect_account_id(api_token)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, _inspect_settings_sync, api_token, account_id, payload.worker_name
        )

        if "error" in result:
            raise HTTPException(result.get("status", 500), result["error"])
        return {"success": True, "secrets": result.get("secrets", [])}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

