"""
Datasources router package - modular API endpoints for datasource management.

Combines all sub-routers into a single router for the main app.
"""

from fastapi import APIRouter

from app.services.sync.routers.datasources.crud import router as crud_router
from app.services.sync.routers.datasources.testing import router as testing_router
from app.services.sync.routers.datasources.schema import router as schema_router
from app.services.sync.routers.datasources.data import router as data_router
from app.services.sync.routers.datasources.views import router as views_router
from app.services.sync.routers.datasources.migration import router as migration_router
from app.services.sync.routers.datasources.relationships import router as relationships_router

# Create the main router that combines all sub-routers
router = APIRouter()

# Include all sub-routers (no prefix since parent already has /datasources)
router.include_router(crud_router)
router.include_router(views_router)
router.include_router(testing_router)
router.include_router(migration_router)
router.include_router(schema_router)
router.include_router(relationships_router)
router.include_router(data_router)

__all__ = ["router"]
