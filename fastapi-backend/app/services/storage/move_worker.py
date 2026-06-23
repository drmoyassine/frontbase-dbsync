"""Background worker for cross-bucket file moves (Post-sprint 2.2).

Executes a ``FileMoveJob`` to completion out-of-request so the client can poll
progress instead of blocking on a large transfer. Runs via FastAPI
``BackgroundTasks`` (in-process); a Celery/queue migration is a drop-in later.
"""
import logging
from datetime import datetime, UTC

from app.database.config import SessionLocal
from app.models.file_move_job import FileMoveJob
from app.services.storage_service import get_storage_adapter

logger = logging.getLogger(__name__)

# Above this size, /api/storage/move-cross returns a job_id and runs the transfer
# in the background. Below it (or when the size is unknown), the move is
# synchronous — matching the proven Sprint 4B path.
LARGE_FILE_THRESHOLD = 50 * 1024 * 1024  # 50 MB


async def execute_file_move(job_id: str) -> None:
    """Run a FileMoveJob to completion: download → upload → delete source.

    Updates job.status / phase / bytes_transferred as it goes. On any failure the
    job is marked ``failed`` with the error message; the source is never deleted
    unless the destination write succeeded (guarantee from ``move_cross_streaming``).
    """
    db = SessionLocal()
    try:
        job = db.query(FileMoveJob).filter(FileMoveJob.id == job_id).first()
        if not job:
            logger.error("[move_worker] job %s not found", job_id)
            return

        job.status = "in_progress"
        job.phase = "queued"
        db.commit()

        try:
            src_adapter = get_storage_adapter(db, job.source_provider_id)
            dst_adapter = get_storage_adapter(db, job.dest_provider_id)

            if not job.bytes_total:
                job.bytes_total = await src_adapter.get_file_size(job.source_bucket, job.source_key) or 0
                db.commit()

            def on_progress(phase: str, transferred: int) -> None:
                job.phase = phase
                job.bytes_transferred = transferred
                db.commit()

            result = await src_adapter.move_cross_streaming(
                job.source_bucket,
                job.source_key,
                dst_adapter,
                job.dest_bucket,
                job.dest_key,
                on_progress=on_progress,
            )

            job.bytes_transferred = result.get("bytes", job.bytes_transferred or job.bytes_total)
            job.status = "completed"
            job.phase = "completed"
            job.completed_at = datetime.now(UTC)
            db.commit()
        except Exception as e:
            logger.exception("[move_worker] job %s failed", job_id)
            job.status = "failed"
            job.error_message = str(e)[:1000]
            job.completed_at = datetime.now(UTC)
            db.commit()
    finally:
        db.close()
