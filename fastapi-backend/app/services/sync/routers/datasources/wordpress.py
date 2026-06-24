"""
WordPress-specific datasource endpoints (Frontbase Connector plugin).

Mounted under the datasources router so the discovery manifest is reachable at
``/api/sync/datasources/{datasource_id}/wordpress/discover/`` — a faithful
proxy of the plugin's ``/wp-json/frontbase/v1/discover`` payload (cached by the
adapter so the UI stays fast).
"""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sync.adapters import get_adapter
from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource, DatasourceType
from app.services.sync.routers.datasources.dependencies import get_scoped_datasource

router = APIRouter()
logger = logging.getLogger("app.routers.datasources.wordpress")


@router.get(
    "/{datasource_id}/wordpress/discover/",
    summary="WordPress discovery manifest (Frontbase Connector plugin)",
)
async def get_wordpress_discovery(
    datasource: Datasource = Depends(get_scoped_datasource),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Return the full WordPress discovery manifest for a plugin datasource.

    Requires the datasource ``type`` to be ``wordpress_plugin``. The adapter
    caches the manifest (Redis + in-process) for ~5 minutes.
    """
    if datasource.type != DatasourceType.WORDPRESS_PLUGIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Datasource '{datasource.name}' is of type {datasource.type.value}, "
                "not wordpress_plugin."
            ),
        )

    adapter = get_adapter(datasource, db)
    try:
        # WordPressPluginAdapter exposes discover(); guard for safety.
        discover = getattr(adapter, "discover", None)
        if discover is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Adapter does not support WordPress discovery.",
            )
        manifest = await discover()
        return manifest or {}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("WordPress discovery failed for %s: %s", datasource.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"WordPress discovery failed: {exc}",
        )
