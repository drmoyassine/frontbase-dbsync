import os
from celery import Celery

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
)
