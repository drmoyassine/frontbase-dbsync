from ..task_queue import celery_app
import logging

logger = logging.getLogger(__name__)

@celery_app.task(name="email.send_invite")
def send_invite_email(to: str, tenant_name: str, invite_token: str):
    """
    Async email sending.
    """
    logger.info(f"Task email.send_invite triggered for to={to}")
    # Implementation goes here later
    return {"status": "success", "to": to}
