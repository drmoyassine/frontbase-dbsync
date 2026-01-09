from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from app.routers import pages, project, variables, database, rls, actions, auth_forms, auth
from app.middleware.test_mode import TestModeMiddleware

logger = logging.getLogger(__name__)

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
    lifespan=lifespan
    # Note: redirect_slashes=True (default) to support trailing slash normalization
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
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]
    allow_all = False  # Now we have explicit origins, can enable credentials

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=not allow_all,  # Enable credentials with explicit origins
    allow_methods=["*"],
    allow_headers=["*"],
)


# Custom middleware to internally add trailing slash to paths
# This prevents 307 redirects by normalizing paths before routing
from starlette.types import ASGIApp, Receive, Scope, Send

class TrailingSlashMiddleware:
    """
    Middleware that adds trailing slash to paths internally.
    This prevents 307 redirects that can cause mixed-content issues.
    
    Note: Excludes /api/auth/ routes which don't use trailing slashes.
    """
    # Paths that should NOT have trailing slashes added
    EXCLUDE_PREFIXES = ["/api/auth"]
    
    def __init__(self, app: ASGIApp):
        self.app = app
    
    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "http":
            path = scope["path"]
            # Skip excluded paths
            should_skip = any(path.startswith(prefix) for prefix in self.EXCLUDE_PREFIXES)
            # Add trailing slash if missing and not a file path (no extension)
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
app.include_router(actions.router, prefix="/api/actions", tags=["Actions"])
app.include_router(auth_forms.router, prefix="/api/auth-forms", tags=["Auth Forms"])

# Mount DB-Synchronizer Service
from app.services.sync.main import sync_app
app.mount("/api/sync", sync_app)

@app.get("/")
async def root():
    return {"message": "Frontbase-DBSync API is running", "test_mode": True}

@app.get("/health/")
async def health_check():
    return {"status": "healthy", "message": "API is operational", "test_mode": True}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)# trigger reload
# trigger reload 2
# trigger reload 3
# reload 4
# reload 5
# reload 6
# reload 7 - 2step search

