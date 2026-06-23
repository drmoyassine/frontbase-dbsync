"""Background file-move jobs (Post-sprint 2.2).

Tracks large cross-bucket / cross-provider file moves that run out-of-request so
the client can poll progress instead of blocking on a multi-hundred-MB transfer.
"""
from datetime import datetime, UTC

from sqlalchemy import Column, String, Integer, Text, DateTime

from ..database.config import Base


class FileMoveJob(Base):
    __tablename__ = "file_move_jobs"

    id = Column(String, primary_key=True)
    source_provider_id = Column(String, nullable=False)
    source_bucket = Column(String, nullable=False)
    source_key = Column(String, nullable=False)
    dest_provider_id = Column(String, nullable=False)
    dest_bucket = Column(String, nullable=False)
    dest_key = Column(String, nullable=False)

    # Scoping — only the owning tenant may poll the job status.
    tenant_id = Column(String, nullable=True)
    project_id = Column(String, nullable=True)

    # Lifecycle: pending → in_progress → completed | failed
    status = Column(String(20), nullable=False, default="pending")
    # Granular phase for progress UX: queued | downloading | uploading | deleting | completed
    phase = Column(String(20), nullable=True)

    bytes_total = Column(Integer, nullable=False, default=0)
    bytes_transferred = Column(Integer, nullable=False, default=0)

    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    completed_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<FileMoveJob {self.id[:8]} ({self.status}/{self.phase})>"
