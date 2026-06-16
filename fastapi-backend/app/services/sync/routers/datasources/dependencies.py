"""
FastAPI dependencies for datasources router.
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.middleware.tenant_context import TenantContext, get_tenant_context
from app.services.sync.database import get_db
from app.services.sync.models.datasource import Datasource
from app.models.models import Project


async def get_scoped_datasource(
    datasource_id: str,
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext | None = Depends(get_tenant_context)
) -> Datasource:
    """Dependency to fetch a datasource by ID and check tenant context ownership."""
    result = await db.execute(
        select(Datasource)
        .options(selectinload(Datasource.views))
        .where(Datasource.id == datasource_id)
    )
    datasource = result.scalar_one_or_none()
    
    if not datasource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Datasource not found"
        )
        
    if ctx and ctx.tenant_id and not ctx.is_master:
        project_result = await db.execute(
            select(Project).where(Project.tenant_id == ctx.tenant_id)
        )
        project = project_result.scalar_one_or_none()
        if not project or datasource.project_id != str(project.id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Datasource not found"
            )
    elif ctx and ctx.is_master:
        if datasource.project_id is not None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Datasource not found"
            )
            
    return datasource
