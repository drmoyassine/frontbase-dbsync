"""
Webhooks API router - handles incoming webhook triggers from n8n, Zapier, etc.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.services.sync.database import get_db
from app.services.sync.models.sync_config import SyncConfig
from app.services.sync.models.job import SyncJob, JobStatus
from app.services.sync.engine.sync_executor import execute_sync


router = APIRouter()


@router.post("/n8n/{config_id}")
async def n8n_webhook(
    config_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Handle n8n webhook trigger."""
    return await _handle_webhook(config_id, "n8n", request, background_tasks, db)


@router.post("/zapier/{config_id}")
async def zapier_webhook(
    config_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Handle Zapier webhook trigger."""
    return await _handle_webhook(config_id, "zapier", request, background_tasks, db)


@router.post("/activepieces/{config_id}")
async def activepieces_webhook(
    config_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Handle ActivePieces webhook trigger."""
    return await _handle_webhook(config_id, "activepieces", request, background_tasks, db)


@router.post("/generic/{config_id}")
async def generic_webhook(
    config_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Handle generic webhook trigger."""
    return await _handle_webhook(config_id, "webhook", request, background_tasks, db)


async def _handle_webhook(
    config_id: str,
    provider: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession
):
    """Common webhook handler logic."""
    # Verify config exists
    result = await db.execute(
        select(SyncConfig)
        .options(selectinload(SyncConfig.field_mappings))
        .where(SyncConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sync config not found"
        )
    
    if not config.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sync config is not active"
        )
    
    # Parse webhook payload (if any)
    try:
        payload = await request.json()
    except:
        payload = {}
    
    # Create job record
    job = SyncJob(
        sync_config_id=config_id,
        status=JobStatus.PENDING,
        triggered_by=provider,
    )
    
    db.add(job)
    await db.commit()
    await db.refresh(job)
    
    # Execute sync in background
    background_tasks.add_task(execute_sync, job.id, config_id)
    
    return {
        "success": True,
        "message": f"Sync triggered via {provider}",
        "job_id": job.id,
        "status": job.status.value
    }
