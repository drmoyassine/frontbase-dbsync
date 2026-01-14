"""
Pages module - combines all page-related routers.
"""
from fastapi import APIRouter
from .crud import router as crud_router
from .publish import router as publish_router
from .public import router as public_router

# Combined router with prefix and tags
router = APIRouter(prefix="/api/pages", tags=["pages"])
router.include_router(crud_router)
router.include_router(publish_router)
router.include_router(public_router)

__all__ = ['router']
