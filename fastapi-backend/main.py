from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from app.routers import pages, project, variables, database, rls
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
)

# Configure CORS for frontend integration
# Default to allowing everything if not specified (relative domain support)
cors_origins_str = os.getenv("CORS_ORIGINS", "*")
cors_origins = [origin.strip() for origin in cors_origins_str.split(",")]

# Note: allow_credentials=True cannot be used with allow_origins=["*"]
# We detect if wildcard is used and adjust accordingly
allow_all = "*" in cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=not allow_all, # Disable credentials if wildcard is used
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add test mode middleware
app.add_middleware(TestModeMiddleware, test_mode=True)

# Include routers
app.include_router(pages.router)
app.include_router(project.router)
app.include_router(variables.router)
app.include_router(database.router)
app.include_router(rls.router)

# Mount DB-Synchronizer Service
from app.services.sync.main import sync_app
app.mount("/api/sync", sync_app)

@app.get("/")
async def root():
    return {"message": "Frontbase-DBSync API is running", "test_mode": True}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "API is operational", "test_mode": True}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)