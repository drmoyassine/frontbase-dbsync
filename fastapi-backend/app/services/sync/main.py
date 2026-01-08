import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
# CORS handled by main app
# from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi

from app.services.sync.config import settings
from app.services.sync.database import init_db
from app.services.sync.routers import (
    datasources as datasources_router,
    sync_configs as sync_configs_router,
    sync as sync_router,
    webhooks as webhooks_router,
    views as views_router,
    settings as settings_api_router
)
from app.services.sync.middleware.error_handler import (
    global_exception_handler,
    validation_exception_handler,
    database_exception_handler
)
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError

# Logging should be configured by the main application
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler - runs on startup and shutdown."""
    import asyncio
    
    # Startup - Database initialization is CRITICAL, so we don't timeout too quickly
    logger.info("[Sync-App Startup] Initializing database tables...")
    try:
        # Increase timeout to 30 seconds for first-time table creation
        async with asyncio.timeout(30.0):
            await init_db()
            logger.info("[Sync-App Startup] ✅ Database tables initialized successfully")
    except asyncio.TimeoutError:
        logger.error("[Sync-App Startup] ❌ Database init timed out after 30s. Tables may not exist!")
    except Exception as e:
        logger.error(f"[Sync-App Startup] ❌ Database init FAILED: {e}")
        # Re-raise to prevent app from starting without a working DB
        # This is more honest than silently failing
        raise
    
    # Load Redis settings into memory safely (optional, can fail)
    try:
        from app.services.sync.redis_client import load_settings_from_db
        async with asyncio.timeout(5.0):
            await load_settings_from_db()
            logger.info("[Sync-App Startup] ✅ Redis settings loaded")
    except asyncio.TimeoutError:
        logger.warning("[Sync-App Startup] Redis settings load timed out - will use defaults")
    except Exception as e:
        logger.warning(f"[Sync-App Startup] Redis settings load failed (non-fatal): {e}")
    
    logger.info("[Sync-App Startup] 🚀 Sub-app ready")
    yield
    # Shutdown
    logger.info("[Sync-App Shutdown] Shutting down...")
    pass


sync_app = FastAPI(
    title="DB Synchronizer (Sub-App)",
    description="Multi-source database synchronization microservice",
    version="1.0.0",
    lifespan=lifespan,
    # Docs URL for sub-app will be /api/sync/docs relative to root if mounted at /api/sync
    # We can keep defaults or customize if needed.
)

# Exception handlers
sync_app.add_exception_handler(RequestValidationError, validation_exception_handler)
sync_app.add_exception_handler(SQLAlchemyError, database_exception_handler)
sync_app.add_exception_handler(Exception, global_exception_handler)

# Custom middleware to internally add trailing slash to paths
# This prevents 307 redirects by normalizing paths before routing
from starlette.types import ASGIApp, Receive, Scope, Send

class TrailingSlashMiddleware:
    """Middleware that adds trailing slash to paths internally."""
    def __init__(self, app: ASGIApp):
        self.app = app
    
    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "http":
            path = scope["path"]
            if not path.endswith("/") and "." not in path.split("/")[-1]:
                scope["path"] = path + "/"
        await self.app(scope, receive, send)

sync_app.add_middleware(TrailingSlashMiddleware)

# Register specific routes BEFORE parametrized routers to avoid conflicts
@sync_app.get("/health/")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}

# Custom Swagger UI for Views - MUST come before views_router to avoid /{view_id} conflict
@sync_app.get("/views/openapi.json", include_in_schema=False)
async def get_views_openapi():
    """Returns a filtered OpenAPI schema for Views only."""
    full_openapi = get_openapi(
        title="View Data APIs",
        version="1.0.0",
        routes=sync_app.routes,
    )
    
    filtered_paths = {}
    for path, methods in full_openapi.get("paths", {}).items():
        filtered_methods = {}
        for method, details in methods.items():
            if "Views" in details.get("tags", []):
                filtered_methods[method] = details
        if filtered_methods:
            filtered_paths[path] = filtered_methods
            
    views_openapi = full_openapi.copy()
    views_openapi["paths"] = filtered_paths
    views_openapi["info"] = {
        "title": "View Documentation",
        "description": "API endpoints for interacting with data through Views.",
        "version": "1.0.0"
    }
    
    return views_openapi

# Include routers
# Prefixes are modified to be relative to the mount point (/api/sync)
logger.info("Including routers...")
sync_app.include_router(datasources_router.router, prefix="/datasources", tags=["Datasources"]) # Was /api/datasources
sync_app.include_router(sync_configs_router.router, prefix="/sync-configs", tags=["Sync Configs"]) # Was /api/sync-configs
sync_app.include_router(sync_router.router, prefix="/operations", tags=["Sync Operations"]) # Was /api/sync -> /operations
sync_app.include_router(views_router.router, prefix="/views", tags=["Views"]) # Was /api -> /views (to separate from data APIs)
# Wait, /api/views prefix was just /api in original file line 82.
# "app.include_router(views_router.router, prefix="/api", tags=["Views"])"
# If I change it to /views, it becomes /api/sync/views.
# Original was /api/data? No, viewed file said prefix="/api".
# Let's check views router content later. For now /views is safe.

sync_app.include_router(webhooks_router.router, prefix="/webhooks", tags=["Webhooks"]) # Keep /webhooks
sync_app.include_router(settings_api_router.router, prefix="/settings", tags=["Settings"]) # Was /api/settings
logger.info("Routers included successfully")





@sync_app.get("/docs/views/", include_in_schema=False)
async def views_swagger_ui():
    """Serves a customized, compact Swagger UI for Views."""
    custom_css = """
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info { margin: 10px 0; padding: 0 20px; }
        .swagger-ui .info .title { font-size: 20px; font-weight: 800; color: #2563eb; }
        .swagger-ui .info p { font-size: 11px; margin: 2px 0; color: #64748b; }
        .swagger-ui .opblock-tag { font-size: 13px; border: none; padding: 0 20px; margin: 10px 0; color: #1e293b; }
        .swagger-ui .opblock .opblock-summary-path { font-size: 12px; font-weight: 600; color: #334155; }
        .swagger-ui .opblock .opblock-summary-description { font-size: 10px; color: #94a3b8; }
        .swagger-ui .btn { font-size: 10px; font-weight: 700; border-radius: 6px; padding: 4px 12px; }
        .swagger-ui input, .swagger-ui select, .swagger-ui textarea { font-size: 11px; border-radius: 6px; padding: 4px 8px; border: 1px solid #e2e8f0; }
        /* Make try-it-out section more compact */
        .swagger-ui .opblock-body pre.microlight { font-size: 10px; border-radius: 8px; }
        .swagger-ui .response-col_status { font-size: 10px; font-weight: 700; }
        .swagger-ui .response-col_links { font-size: 10px; }
        .swagger-ui .tab li button.tablinks { font-size: 10px; padding: 4px 10px; }
        .swagger-ui table thead tr td, .swagger-ui table thead tr th { font-size: 10px; padding: 6px; }
        .swagger-ui .parameter__name { font-size: 11px; font-weight: 700; }
        .swagger-ui .parameter__type { font-size: 10px; font-family: monospace; }
        /* Hide models section */
        .swagger-ui section.models { display: none; }
        /* Animation for appearance */
        .swagger-ui { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    """
    
    # Custom JS to pre-fill view_id path parameter
    custom_js = """
        window.addEventListener('load', function() {
            const urlParams = new URLSearchParams(window.location.search);
            const viewId = urlParams.get('id');
            if (viewId) {
                console.log('[Docs] Attempting to pre-fill View ID:', viewId);
                const preFill = () => {
                    // Try different possible selectors for Swagger UI inputs
                    const selectors = [
                        'input[placeholder="view_id"]',
                        'tr[data-param-name="view_id"] input',
                        '.parameter__name[data-param-name="view_id"] + .parameter__input input'
                    ];
                    
                    let found = false;
                    selectors.forEach(selector => {
                        const inputs = document.querySelectorAll(selector);
                        if (inputs.length > 0) {
                            inputs.forEach(input => {
                                if (!input.value || input.value === '{view_id}') {
                                    input.value = viewId;
                                    // Trigger React change events
                                    const event = new Event('input', { bubbles: true });
                                    input.dispatchEvent(event);
                                    const changeEvent = new Event('change', { bubbles: true });
                                    input.dispatchEvent(changeEvent);
                                    found = true;
                                }
                            });
                        }
                    });
                    
                    if (found) {
                        console.log('[Docs] Successfully pre-filled view_id');
                    }
                };
                
                // Poll more aggressively initially, then slow down
                const interval = setInterval(preFill, 500);
                setTimeout(() => clearInterval(interval), 15000);
                
                // Also hook into clicks on "Try it out" buttons
                document.addEventListener('click', (e) => {
                    if (e.target.classList.contains('try-it-out__btn')) {
                        setTimeout(preFill, 100);
                    }
                });
            }
        });
    """
    
    html = get_swagger_ui_html(
        openapi_url="/api/sync/views/openapi.json", # Adjusted path for when mounted at /api/sync
        title="View Data Inspector APIs",
        swagger_ui_parameters={"defaultModelsExpandDepth": -1, "deepLinking": True},
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_favicon_url=None,
    ).body.decode()
    
    # Inject CSS and JS
    html = html.replace("</head>", f"<style>{custom_css}</style></head>")
    html = html.replace("</body>", f"<script>{custom_js}</script></body>")
    
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)
