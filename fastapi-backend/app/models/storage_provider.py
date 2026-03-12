"""
StorageProvider model — explicit user-added storage connections.

Each row links to an EdgeProviderAccount (connected account) and represents
the user's deliberate choice to use that account for storage on this project.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from ..database.config import Base


class StorageProvider(Base):
    """A storage provider explicitly added by the user to the Storage page."""

    __tablename__ = "storage_providers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)                # "My Supabase Storage"
    provider = Column(String(50), nullable=False)             # "supabase", "cloudflare", etc.
    provider_account_id = Column(
        String,
        ForeignKey("edge_providers_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    config = Column(Text, nullable=True, default="{}")        # JSON — provider-specific config (project_ref, R2 prefix, etc.)
    is_active = Column(Boolean, default=True)
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    provider_account = relationship("EdgeProviderAccount", lazy="joined")
