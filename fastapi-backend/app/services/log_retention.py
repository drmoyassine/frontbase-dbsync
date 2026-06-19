"""Execution-history retention — prune old automation executions per tenant plan.

`edge_logs` is a read-through fetcher (runtime logs live on the provider edge); the
history that accumulates in the Frontbase DB is `AutomationExecution`. This prunes
rows older than each tenant's plan `log_retention_hours` (operational cap). A value of
UNLIMITED (-1) / non-int disables pruning for that tenant.
"""

import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Tenant, AutomationExecution, AutomationDraft, Project
from app.services.plan_limits import get_plan, plan_limits, UNLIMITED

logger = logging.getLogger(__name__)


def prune_old_executions(db: Session) -> int:
    """Delete automation execution history older than each tenant's plan retention.

    Returns total rows deleted. Commits if anything was deleted.
    """
    now = datetime.now(timezone.utc)
    total = 0
    for t in db.query(Tenant).all():
        hours = plan_limits(get_plan(db, str(t.plan))).get("log_retention_hours", UNLIMITED)
        if not isinstance(hours, int) or hours == UNLIMITED or hours <= 0:
            continue
        cutoff = now - timedelta(hours=hours)   # datetime object — started_at is a DateTime column
        project_ids = select(Project.id).where(Project.tenant_id == t.id)
        draft_ids = select(AutomationDraft.id).where(AutomationDraft.project_id.in_(project_ids))
        deleted = (
            db.query(AutomationExecution)
            .where(
                AutomationExecution.draft_id.in_(draft_ids),
                AutomationExecution.started_at < cutoff,
            )
            .delete(synchronize_session=False)
        )
        total += int(deleted or 0)
    if total:
        db.commit()
        logger.info("[retention] pruned %d old execution row(s)", total)
    return total
