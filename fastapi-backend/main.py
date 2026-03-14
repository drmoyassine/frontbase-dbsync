# gpu_model serialization update — force reload
# Load .env FIRST — before any app imports that may read env vars (e.g. FERNET_KEY)
from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from app.routers import pages, project, variables, database, rls, actions, auth_forms, auth, settings, storage, edge_providers, edge_engines, cloudflare, cloudflare_inspector, engine_inspector, edge_databases, edge_caches, edge_queues, edge_gpu, edge_api_keys
from app.middleware.test_mode import TestModeMiddleware

logger = logging.getLogger(__name__)


def _ensure_local_edge():
    """Seed the Local Edge system records in dev / self-host mode.

    Creates three is_system=True records (idempotent):
      1. EdgeDatabase  → "Local SQLite"
      2. EdgeCache     → "Local Redis"
      3. EdgeEngine    → "Local Edge" (linked to 1 & 2)

    Skipped in cloud (multi-tenant) mode — the edge container still runs
    for build-time services, but won't appear in the UI or as a publish target.
    """
    mode = os.getenv("DEPLOYMENT_MODE", "self-host")
    if mode == "cloud":
        return

    from datetime import datetime
    import uuid
    from app.database.config import SessionLocal
    from app.models.models import EdgeEngine, EdgeDatabase, EdgeCache

    edge_url = os.getenv("EDGE_URL", "http://localhost:3002")
    now = datetime.utcnow().isoformat()
    db = SessionLocal()
    try:
        # --- 1. Local SQLite system database ---
        sys_db = db.query(EdgeDatabase).filter(EdgeDatabase.is_system == True).first()  # noqa: E712
        if not sys_db:
            sys_db = EdgeDatabase(
                id=str(uuid.uuid4()),
                name="Local SQLite",
                provider="sqlite",
                db_url="file:local.db",
                is_default=False,
                is_system=True,
                created_at=now,
                updated_at=now,
            )
            db.add(sys_db)
            db.flush()
            logger.info("[Startup] ✅ Local SQLite DB seeded")
        elif bool(sys_db.is_default):
            # Clear stale default on system resource
            sys_db.is_default = False  # type: ignore[assignment]
            logger.info("[Startup] Cleared is_default on system DB")

        # --- 2. Local Redis system cache ---
        sys_cache = db.query(EdgeCache).filter(EdgeCache.is_system == True).first()  # noqa: E712
        if not sys_cache:
            sys_cache = EdgeCache(
                id=str(uuid.uuid4()),
                name="Local Redis",
                provider="redis",
                cache_url="redis://localhost:6379",
                is_default=False,
                is_system=True,
                created_at=now,
                updated_at=now,
            )
            db.add(sys_cache)
            db.flush()
            logger.info("[Startup] ✅ Local Redis cache seeded")
        elif bool(sys_cache.is_default):
            # Clear stale default on system resource
            sys_cache.is_default = False  # type: ignore[assignment]
            logger.info("[Startup] Cleared is_default on system cache")

        # --- 3. Local Edge system engine ---
        sys_engine = db.query(EdgeEngine).filter(EdgeEngine.is_system == True).first()  # noqa: E712
        if sys_engine:
            # Update URL and bindings if needed
            changed = False
            if str(sys_engine.url) != edge_url:
                sys_engine.url = edge_url  # type: ignore[assignment]
                changed = True
            if str(sys_engine.edge_db_id or "") != str(sys_db.id):
                sys_engine.edge_db_id = sys_db.id  # type: ignore[assignment]
                changed = True
            if str(sys_engine.edge_cache_id or "") != str(sys_cache.id):
                sys_engine.edge_cache_id = sys_cache.id  # type: ignore[assignment]
                changed = True
            if changed:
                sys_engine.updated_at = now  # type: ignore[assignment]
                logger.info("[Startup] Local Edge bindings updated")
        else:
            sys_engine = EdgeEngine(
                id=str(uuid.uuid4()),
                name="Local Edge",
                edge_provider_id=None,
                adapter_type="full",
                url=edge_url,
                edge_db_id=sys_db.id,
                edge_cache_id=sys_cache.id,
                is_active=True,
                is_system=True,
                created_at=now,
                updated_at=now,
            )
            db.add(sys_engine)
            logger.info(f"[Startup] ✅ Local Edge seeded at {edge_url}")

        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler - initializes ALL databases on startup."""
    import asyncio
    
    logger.info("[Main App Startup] Initializing databases...")
    
    # Initialize Sync Service database tables
    # This is critical because mounted sub-apps don't run their own lifespan events
    try:
        from app.services.sync.database import init_db as init_sync_db
        async with asyncio.timeout(30.0):
            await init_sync_db()
            logger.info("[Main App Startup] ✅ Sync DB tables initialized successfully")
    except asyncio.TimeoutError:
        logger.error("[Main App Startup] ❌ Sync DB init timed out after 30s")
    except Exception as e:
        logger.error(f"[Main App Startup] ❌ Sync DB init failed: {e}")

    # Initialize Main App database tables (Project, User, Page, etc.)
    # This is critical for fresh deployments
    try:
        from app.database.config import Base, engine
        # Verify models are imported to register them
        import app.models.models  # noqa
        
        logger.info("[Main App Startup] Initializing Core tables...")
        # Create tables synchronously (SQLite is fast/local)
        Base.metadata.create_all(bind=engine)
        logger.info("[Main App Startup] ✅ Core tables initialized successfully")
    except Exception as e:
        logger.error(f"[Main App Startup] ❌ Core DB init failed: {e}")
    
    # Seed the Local Edge system engine (dev / self-host only)
    try:
        _ensure_local_edge()
    except Exception as e:
        logger.warning(f"[Main App Startup] Local Edge seed failed (non-fatal): {e}")

    # Load Redis settings for sync service
    try:
        from app.services.sync.redis_client import load_settings_from_db
        async with asyncio.timeout(5.0):
            await load_settings_from_db()
            logger.info("[Main App Startup] ✅ Redis settings loaded")
    except Exception as e:
        logger.warning(f"[Main App Startup] Redis settings load failed (non-fatal): {e}")
    
    logger.info("[Main App Startup] 🚀 Application ready")
    yield
    logger.info("[Main App Shutdown] Shutting down...")


app = FastAPI(
    title="Frontbase-DBSync API",
    description="Unified API for Frontbase and DB-Sync functionality",
    version="1.0.0",
    lifespan=lifespan,
)

# Global exception handler — catch hidden 500s and log full tracebacks
from starlette.requests import Request as StarletteRequest
from starlette.responses import JSONResponse as StarletteJSONResponse
import traceback as _tb

@app.exception_handler(Exception)
async def global_exception_handler(request: StarletteRequest, exc: Exception):
    logger.error(f"[UNHANDLED] {request.method} {request.url.path}: {exc}")
    logger.error(_tb.format_exc())
    return StarletteJSONResponse(
        status_code=500,
        content={"detail": f"Internal error: {str(exc)}"},
    )

# Configure CORS for frontend integration
# Default to allowing everything if not specified (relative domain support)
cors_origins_str = os.getenv("CORS_ORIGINS", "*")
cors_origins = [origin.strip() for origin in cors_origins_str.split(",")]

# Note: allow_credentials=True cannot be used with allow_origins=["*"]
# For local development (Windows), we expand "*" to include explicit localhost origins
# We assume VPS/Production (Linux) manages origins explicitly or uses a proxy
import sys
is_windows = os.name == 'nt' or sys.platform == 'win32'

allow_all = "*" in cors_origins
if allow_all and is_windows:
    # Replace wildcard with specific origins to support credentials
    cors_origins = [
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative port
        "http://localhost:3001",  # Edge service
        "http://localhost:8000",  # FastAPI self
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:8000",
        "http://[::1]:5173",  # IPv6 localhost
        "http://[::1]:8000",
    ]
    allow_all = False  # Now we have explicit origins, can enable credentials

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TEMP: Allow all origins for debugging
    allow_credentials=False,  # Disabled with wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

# ProxyHeadersMiddleware: trust X-Forwarded-Proto from reverse proxy
# so FastAPI constructs redirects with https:// instead of http://
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])


# Custom middleware to internally add trailing slash to paths
# This prevents 307 redirects by normalizing paths before routing
from starlette.types import ASGIApp, Receive, Scope, Send

class TrailingSlashMiddleware:
    """
    Middleware that adds trailing slash to paths internally.
    
    Prevents 307 redirect loops: the excluded routers define routes
    WITHOUT trailing slashes, so the middleware must not add one.
    Non-excluded routes get a trailing slash added to match their
    route definitions, preventing a 307 from FastAPI.
    
    Note: some excluded routes may still produce a single benign 307
    redirect (e.g., /api/edge-engines → /api/edge-engines/). This is
    harmless — the client follows it once.
    """
    EXCLUDE_PREFIXES = [
        "/api/auth",
        "/api/actions",
        "/api/storage",
        "/api/edge-engines",
        "/api/edge-providers",
        "/api/edge-caches",
        "/api/edge-databases",
        "/api/edge-queues",
        "/api/edge-gpu",
        "/api/edge-api-keys",
        "/api/cloudflare",
        "/api/settings",
    ]
    
    def __init__(self, app: ASGIApp):
        self.app = app
    
    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "http":
            path = scope["path"]
            should_skip = any(path.startswith(prefix) for prefix in self.EXCLUDE_PREFIXES)
            if not should_skip and not path.endswith("/") and "." not in path.split("/")[-1]:
                scope["path"] = path + "/"
        await self.app(scope, receive, send)

app.add_middleware(TrailingSlashMiddleware)

# Add test mode middleware
app.add_middleware(TestModeMiddleware, test_mode=True)

# Include routers
app.include_router(auth.router)  # Auth routes (login, logout, me)
app.include_router(pages.router)
app.include_router(project.router)
app.include_router(variables.router)
app.include_router(database.router)
app.include_router(rls.router)
app.include_router(storage.router)
app.include_router(actions.router, prefix="/api/actions", tags=["Actions"])
app.include_router(auth_forms.router, prefix="/api/auth-forms", tags=["Auth Forms"])
app.include_router(settings.router)  # Privacy & Tracking settings
app.include_router(edge_providers.router)  # Edge provider accounts
app.include_router(edge_engines.router)  # Edge deployed engines
app.include_router(edge_databases.router)  # Edge database connections
app.include_router(edge_caches.router)  # Edge cache connections
app.include_router(edge_queues.router)  # Edge queue connections
app.include_router(cloudflare.router)  # One-click Cloudflare deploy
app.include_router(cloudflare_inspector.router)  # CF Worker inspector (legacy)
app.include_router(engine_inspector.router)  # Multi-provider engine inspector
app.include_router(edge_gpu.router)  # Edge GPU AI inference models
app.include_router(edge_api_keys.router)  # Tenant API keys for /v1/* endpoints

# Mount DB-Synchronizer Service
from app.services.sync.main import sync_app
app.mount("/api/sync", sync_app)

# Mount static assets directory for branding files (favicon, logo, etc.)
from fastapi.staticfiles import StaticFiles
from pathlib import Path
ASSETS_DIR = Path(__file__).parent / "static" / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

@app.get("/")
async def root():
    return {"message": "Frontbase-DBSync API is running", "test_mode": True}

@app.get("/health/")
async def health_check():
    return {"status": "healthy", "message": "API is operational", "test_mode": True}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, proxy_headers=True, forwarded_allow_ips="*")# trigger reload
# trigger reload 2
# trigger reload 3
# reload 4
# reload 5
# reload 6
# reload 7 - 2step search

 
