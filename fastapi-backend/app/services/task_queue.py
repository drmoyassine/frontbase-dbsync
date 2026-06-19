import os
from celery import Celery
from celery.schedules import crontab

celery_app = Celery(
    "frontbase",
    broker=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
)

celery_app.conf.update(
    task_routes={
        "app.services.tasks.publish.*": {"queue": "publish"},
        "app.services.tasks.email.*": {"queue": "email"},
    },
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Periodic execution-history retention prune. Also runs on startup (main.py) so it
    # isn't dependent on celery-beat being configured. Daily at 03:17 UTC.
    beat_schedule={
        "prune-execution-history": {
            "task": "app.services.retention.prune_executions",
            "schedule": crontab(minute=17, hour=3),
        },
    },
)


@celery_app.task(name="app.services.retention.prune_executions")
def prune_executions_task() -> int:
    """Prune automation execution history older than each tenant's plan retention."""
    from app.database.config import SessionLocal
    from app.services.log_retention import prune_old_executions
    db = SessionLocal()
    try:
        return prune_old_executions(db)
    finally:
        db.close()

