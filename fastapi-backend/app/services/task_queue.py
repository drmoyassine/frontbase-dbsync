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
        # V2 shared-engine secrets rotation: rotate any shared engine whose
        # per-worker key is older than 90 days. Daily at 02:00 UTC (off-peak).
        "rotate-shared-engine-secrets": {
            "task": "app.services.edge_secrets_push.check_and_rotate_shared_engine_secrets",
            "schedule": crontab(minute=0, hour=2),
        },
        # Workspace Agent credit daily reset: refill every tenant's daily credit
        # pool to its plan's agent_credits_daily limit (+ manual bonus). Daily at
        # 00:05 UTC (just past the UTC-midnight boundary). Cloud mode only; the
        # task no-ops when there are no tenants/balances.
        "reset-agent-credits-daily": {
            "task": "app.services.agent_quota.reset_all_daily",
            "schedule": crontab(minute=5, hour=0),
        },
        # Portable engine-move housekeeping: auto-revert moved_out engines older
        # than the TTL (default 7 days) so a lost/abandoned export bundle never
        # strands an engine in the soft-locked state forever. Daily at 03:30 UTC.
        "prune-stale-engine-moves": {
            "task": "app.services.engine_move.prune_stale_moves",
            "schedule": crontab(minute=30, hour=3),
        },
    },
)


@celery_app.task(name="app.services.engine_move.prune_stale_moves")
def prune_stale_engine_moves_task() -> int:
    """Revert moved_out engines past the TTL back to active (see engine_move.prune_stale_moves)."""
    from app.database.config import SessionLocal
    from app.services.engine_move import prune_stale_moves

    db = SessionLocal()
    try:
        return prune_stale_moves(db)
    finally:
        db.close()


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


@celery_app.task(name="app.services.edge_secrets_push.check_and_rotate_shared_engine_secrets")
def check_and_rotate_shared_engine_secrets_task() -> dict:
    """Rotate shared-engine secrets keys older than 90 days.

    Thin Celery wrapper around the async orchestrator so the sweep runs on the
    beat schedule. Returns a summary: {checked, rotated, failed, errors}.
    """
    import asyncio
    from app.services.edge_secrets_push import run_scheduled_rotation
    return asyncio.run(run_scheduled_rotation(max_age_days=90))


@celery_app.task(name="app.services.agent_quota.reset_all_daily_credits")
def reset_all_daily_credits_task() -> int:
    """Refill every tenant's daily Workspace Agent credit pool (beat-driven).

    Cloud-mode daily reset at 00:05 UTC. Also exposed as a manual master-admin
    trigger at POST /api/admin/agents/quota/reset-daily. Returns the tenant count.
    """
    from app.database.config import SessionLocal
    from app.services.agent_quota import reset_all_daily
    db = SessionLocal()
    try:
        return reset_all_daily(db)
    finally:
        db.close()

