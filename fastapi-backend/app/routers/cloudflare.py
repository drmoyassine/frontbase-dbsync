"""
Cloudflare Workers Deploy Router — Thin Router.

One-click deployment of the Edge Engine to Cloudflare Workers via API v4.
This is a control plane operation — lives in the main app, not the sync sub-app.

Endpoints:
    POST /api/cloudflare/connect  — Validate token, detect account, list workers
    POST /api/cloudflare/deploy   — Build + upload Worker + set secrets + register engine
    POST /api/cloudflare/status   — Check deployment status
    POST /api/cloudflare/teardown — Remove Worker + deactivate engine

All CF API calls delegated to services/cloudflare_api.py.
All bundle operations delegated to services/bundle.py.
All secret building delegated to services/secrets_builder.py.
Inspector endpoints live in cloudflare_inspector.py.
"""

import json
import uuid
import asyncio
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from ..database.config import get_db
from ..models.models import EdgeEngine, EdgeDatabase, EdgeCache, EdgeQueue, EdgeProviderAccount

from ..schemas.cloudflare import ConnectRequest, DeployRequest, StatusRequest, TeardownRequest
from ..services import cloudflare_api
from ..services.bundle import build_worker, get_source_hash
from ..services.secrets_builder import build_engine_secrets

router = APIRouter(prefix="/api/cloudflare", tags=["Cloudflare Deploy"])


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/connect")
async def connect_cloudflare(payload: ConnectRequest, db: Session = Depends(get_db)):
    """
    List existing workers using saved credentials from EdgeProviderAccount.
    
    Uses run_in_executor to run sync httpx calls in a thread,
    avoiding Windows ProactorEventLoop Errno 22 with HTTPS.
    """
    api_token, account_id = cloudflare_api.get_provider_credentials(payload.provider_id, db)
    
    def _do_connect():
        import requests as req
        hdrs = cloudflare_api.headers(api_token)
        
        nonlocal account_id
        account_name = ""
        
        # Detect account ID if missing
        if not account_id:
            print("[Cloudflare] Auto-detecting account ID...")
            resp = req.get(
                f"{cloudflare_api.CF_API}/accounts",
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
            provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == payload.provider_id).first()
            if provider:
                creds = json.loads(str(provider.provider_credentials or "{}"))
                creds["account_id"] = account_id
                provider.provider_credentials = json.dumps(creds)  # type: ignore[assignment]
                db.commit()

        # Fetch workers
        print("[Cloudflare] Fetching existing workers...")
        workers = cloudflare_api.list_workers(api_token, account_id)
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
async def deploy_to_cloudflare(payload: DeployRequest, db: Session = Depends(get_db)):
    """One-click deploy the Edge Engine to Cloudflare Workers."""
    try:
        api_token, account_id = cloudflare_api.get_provider_credentials(payload.provider_id, db)

        if not account_id:
            print("[Cloudflare] Auto-detecting account ID...")
            account_id = await cloudflare_api.detect_account_id(api_token)
            
            # Save it back to DB
            provider = db.query(EdgeProviderAccount).filter(EdgeProviderAccount.id == payload.provider_id).first()
            if provider:
                creds = json.loads(str(provider.provider_credentials or "{}"))
                creds["account_id"] = account_id
                provider.provider_credentials = json.dumps(creds)  # type: ignore[assignment]
                db.commit()

        # Build & upload Worker
        script_content, bundle_hash = build_worker(payload.adapter_type)
        print(f"[Cloudflare] Uploading Worker '{payload.worker_name}' (hash={bundle_hash})...")

        script_filename = "cloudflare.js" if payload.adapter_type == "full" else "cloudflare-lite.js"
        await cloudflare_api.upload_worker(api_token, account_id, payload.worker_name, script_content, script_filename)
        
        worker_url = await cloudflare_api.enable_workers_dev(api_token, account_id, payload.worker_name)
        
        # Build secrets (DRY: uses shared secrets_builder)
        # Resolve edge IDs, handling '__none__' sentinel
        edge_db_id = payload.edge_db_id
        if edge_db_id == "__none__":
            edge_db_id = None
        edge_cache_id = payload.edge_cache_id
        if edge_cache_id == "__none__":
            edge_cache_id = None
        edge_queue_id = payload.edge_queue_id
        if edge_queue_id == "__none__":
            edge_queue_id = None

        # Use default DB if none specified
        if not edge_db_id and payload.edge_db_id != "__none__":
            default_db = db.query(EdgeDatabase).filter(EdgeDatabase.is_default == True).first()  # noqa: E712
            if default_db:
                edge_db_id = str(default_db.id)

        secrets = build_engine_secrets(db, edge_db_id, edge_cache_id, edge_queue_id)

        # Direct cache URL/token (legacy — overrides EdgeCache lookup)
        if payload.cache_url:
            secrets["FRONTBASE_CACHE_URL"] = payload.cache_url
        if payload.cache_token:
            secrets["FRONTBASE_CACHE_TOKEN"] = payload.cache_token

        if secrets:
            try:
                await cloudflare_api.set_secrets(api_token, account_id, payload.worker_name, secrets)
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to push secrets to Cloudflare: {e}"
                )

        # Register as Edge Engine
        engine_id = None
        source_hash = get_source_hash() or bundle_hash
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
                existing.edge_db_id = edge_db_id  # type: ignore[assignment]
                existing.edge_cache_id = edge_cache_id  # type: ignore[assignment]
                existing.edge_queue_id = edge_queue_id  # type: ignore[assignment]
                existing.engine_config = engine_cfg  # type: ignore[assignment]
                existing.bundle_checksum = source_hash  # type: ignore[assignment]
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
                    edge_db_id=edge_db_id,
                    edge_cache_id=edge_cache_id,
                    edge_queue_id=edge_queue_id,
                    engine_config=engine_cfg,
                    bundle_checksum=source_hash,
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
async def cloudflare_status(payload: StatusRequest, db: Session = Depends(get_db)):
    """Check if a Worker is deployed and get its details."""
    try:
        api_token, account_id = cloudflare_api.get_provider_credentials(payload.provider_id, db)

        if not account_id:
            account_id = await cloudflare_api.detect_account_id(api_token)

        url = f"{cloudflare_api.CF_API}/accounts/{account_id}/workers/scripts/{payload.worker_name}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                headers=cloudflare_api.headers(api_token),
                timeout=10.0,
            )

        if resp.status_code == 404:
            return {"deployed": False, "worker_name": payload.worker_name}

        if resp.status_code != 200:
            raise HTTPException(400, f"Status check failed: {resp.text[:300]}")

        worker_url = await cloudflare_api.enable_workers_dev(api_token, account_id, payload.worker_name)

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
async def teardown_cloudflare(payload: TeardownRequest, db: Session = Depends(get_db)):
    """Remove a Worker and deactivate its edge engine target."""
    try:
        api_token, account_id = cloudflare_api.get_provider_credentials(payload.provider_id, db)
        if not account_id:
            account_id = await cloudflare_api.detect_account_id(api_token)

        # Delete Worker
        await cloudflare_api.delete_worker(api_token, account_id, payload.worker_name)

        # Deactivate Edge Engines
        engines = db.query(EdgeEngine).filter(
            EdgeEngine.name.contains(payload.worker_name),
        ).all()
        for t in engines:
            t.is_active = False  # type: ignore[assignment]
            t.updated_at = datetime.utcnow().isoformat()  # type: ignore[assignment]
        db.commit()

        return {
            "success": True,
            "message": f"Worker '{payload.worker_name}' deleted",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
