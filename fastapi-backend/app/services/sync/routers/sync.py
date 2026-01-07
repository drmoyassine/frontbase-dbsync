"""
Sync operations API router - execute syncs, check status, manage conflicts.
"""

import json
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.services.sync.database import get_db
from app.services.sync.models.sync_config import SyncConfig
from app.services.sync.models.job import SyncJob, JobStatus
from app.services.sync.models.conflict import Conflict, ConflictStatus
from app.services.sync.schemas.job import SyncJobResponse
from app.services.sync.schemas.conflict import ConflictResponse, ConflictResolve
from app.services.sync.engine.sync_executor import execute_sync


router = APIRouter()


@router.post("/{config_id}", response_model=SyncJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def execute_sync_job(
    config_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Execute a sync job for the given configuration."""
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
    
    # Create job record
    job = SyncJob(
        sync_config_id=config_id,
        status=JobStatus.PENDING,
        triggered_by="manual",
    )
    
    db.add(job)
    await db.commit()
    await db.refresh(job)
    
    # Execute sync in background
    background_tasks.add_task(execute_sync, job.id, config_id)
    
    return job


@router.get("/{job_id}/status", response_model=SyncJobResponse)
async def get_job_status(
    job_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get the status of a sync job."""
    result = await db.execute(
        select(SyncJob).where(SyncJob.id == job_id)
    )
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    return job


@router.get("/{config_id}/conflicts", response_model=List[ConflictResponse])
async def get_conflicts(
    config_id: str,
    status_filter: str = "pending",
    db: AsyncSession = Depends(get_db)
):
    """Get conflicts for a sync configuration."""
    query = select(Conflict).where(Conflict.sync_config_id == config_id)
    
    if status_filter == "pending":
        query = query.where(Conflict.status == ConflictStatus.PENDING)
    elif status_filter == "resolved":
        query = query.where(Conflict.status != ConflictStatus.PENDING)
    
    query = query.order_by(Conflict.created_at.desc())
    
    result = await db.execute(query)
    conflicts = result.scalars().all()
    
    # Parse JSON fields
    response = []
    for conflict in conflicts:
        response.append(ConflictResponse(
            id=conflict.id,
            sync_config_id=conflict.sync_config_id,
            job_id=conflict.job_id,
            record_key=conflict.record_key,
            master_data=json.loads(conflict.master_data),
            slave_data=json.loads(conflict.slave_data),
            conflicting_fields=json.loads(conflict.conflicting_fields),
            status=conflict.status,
            resolved_data=json.loads(conflict.resolved_data) if conflict.resolved_data else None,
            resolved_by=conflict.resolved_by,
            resolved_at=conflict.resolved_at,
            resolution_notes=conflict.resolution_notes,
            created_at=conflict.created_at,
        ))
    
    return response


@router.post("/{config_id}/resolve/{conflict_id}", response_model=ConflictResponse)
async def resolve_conflict(
    config_id: str,
    conflict_id: str,
    data: ConflictResolve,
    db: AsyncSession = Depends(get_db)
):
    """Resolve a specific conflict."""
    result = await db.execute(
        select(Conflict).where(
            Conflict.id == conflict_id,
            Conflict.sync_config_id == config_id
        )
    )
    conflict = result.scalar_one_or_none()
    
    if not conflict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conflict not found"
        )
    
    if conflict.status != ConflictStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conflict already resolved"
        )
    
    # Determine resolution
    master_data = json.loads(conflict.master_data)
    slave_data = json.loads(conflict.slave_data)
    
    if data.resolution == "master":
        conflict.status = ConflictStatus.RESOLVED_MASTER
        conflict.resolved_data = conflict.master_data
    elif data.resolution == "slave":
        conflict.status = ConflictStatus.RESOLVED_SLAVE
        conflict.resolved_data = conflict.slave_data
    elif data.resolution == "merge" and data.merged_data:
        conflict.status = ConflictStatus.RESOLVED_MERGED
        conflict.resolved_data = json.dumps(data.merged_data)
    elif data.resolution == "skip":
        conflict.status = ConflictStatus.SKIPPED
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid resolution type"
        )
    
    conflict.resolved_by = data.resolved_by or "admin"
    conflict.resolved_at = datetime.utcnow()
    conflict.resolution_notes = data.notes
    
    await db.commit()
    await db.refresh(conflict)
    
    return ConflictResponse(
        id=conflict.id,
        sync_config_id=conflict.sync_config_id,
        job_id=conflict.job_id,
        record_key=conflict.record_key,
        master_data=json.loads(conflict.master_data),
        slave_data=json.loads(conflict.slave_data),
        conflicting_fields=json.loads(conflict.conflicting_fields),
        status=conflict.status,
        resolved_data=json.loads(conflict.resolved_data) if conflict.resolved_data else None,
        resolved_by=conflict.resolved_by,
        resolved_at=conflict.resolved_at,
        resolution_notes=conflict.resolution_notes,
        created_at=conflict.created_at,
    )


@router.get("/jobs/", response_model=List[SyncJobResponse])
async def list_jobs(
    config_id: str = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """List sync jobs, optionally filtered by config."""
    query = select(SyncJob).order_by(SyncJob.created_at.desc()).limit(limit)
    
    if config_id:
        query = query.where(SyncJob.sync_config_id == config_id)
    
    result = await db.execute(query)
    return result.scalars().all()
