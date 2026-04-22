"""Page domain models — Page, PageDeployment."""

import json as _json

from sqlalchemy import Column, String, Text, Boolean, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database.config import Base


class Page(Base):
    __tablename__ = 'pages'
    
    id = Column(String, primary_key=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), nullable=False)  # unique per project (see __table_args__)
    title = Column(String(200))
    description = Column(Text)
    keywords = Column(String(500))
    is_public = Column(Boolean, default=False)
    is_homepage = Column(Boolean, default=False)
    layout_data = Column(Text, nullable=False)
    seo_data = Column(Text)
    deleted_at = Column(String)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    content_hash = Column(String(64))  # SHA-256 of layout_data + seo_data before enrichment
    project_id = Column(String, ForeignKey('project.id'), nullable=True)  # null = legacy / self-host
    
    # Relationships
    deployments = relationship("PageDeployment", back_populates="page", cascade="all, delete-orphan")
    versions = relationship("PageVersion", back_populates="page", cascade="all, delete-orphan", order_by="PageVersion.version_number.desc()")
    project = relationship("Project", back_populates="pages")

    # Slug must be unique within a project (NULL project_id = masteradmin scope).
    # We cannot use a simple DB unique constraint across (slug, project_id) when project_id
    # is nullable in SQLite/Postgres (NULLs are not equal), so we enforce it in Python.
    # The old global unique=True on slug is removed to support multi-tenancy.
    
    @property
    def layout_data_dict(self):
        """Get layout_data as a dictionary"""
        if self.layout_data:  # type: ignore[truthy-bool]
            return _json.loads(str(self.layout_data))
        return {}
    
    @layout_data_dict.setter
    def layout_data_dict(self, value):
        """Set layout_data from a dictionary"""
        self.layout_data = _json.dumps(value)
    
    @property
    def seo_data_dict(self):
        """Get seo_data as a dictionary"""
        if self.seo_data:  # type: ignore[truthy-bool]
            return _json.loads(str(self.seo_data))
        return {}
    
    @seo_data_dict.setter
    def seo_data_dict(self, value):
        """Set seo_data from a dictionary"""
        self.seo_data = _json.dumps(value)


class PageDeployment(Base):
    """Tracks the deployment status of a page to a specific edge engine."""
    __tablename__ = 'page_deployments'
    
    id = Column(String, primary_key=True)
    page_id = Column(String, ForeignKey('pages.id'), nullable=False)
    edge_engine_id = Column(String, ForeignKey('edge_engines.id'), nullable=False)
    status = Column(String, default='published')     # published | failed
    version = Column(Integer, default=1)            # Matches edge's published version
    content_hash = Column(String(64))               # Hash of what was published
    published_at = Column(String)                    # Last attempt timestamp
    error_message = Column(Text)                     # If status == 'failed'
    preview_url = Column(String(2000))               # Tenant-aware preview URL returned by edge on publish
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    
    # Unique constraint: one record per page per engine
    __table_args__ = (UniqueConstraint('page_id', 'edge_engine_id', name='uq_page_engine'),)
    
    # Relationships
    page = relationship("Page", back_populates="deployments")
    edge_engine = relationship("EdgeEngine", back_populates="page_deployments")


class PageVersion(Base):
    """Immutable snapshot of a page's layout_data. Created on every save."""
    __tablename__ = 'page_versions'

    id = Column(String, primary_key=True)
    page_id = Column(String, ForeignKey('pages.id', ondelete='CASCADE'), nullable=False)
    version_number = Column(Integer, nullable=False)          # Auto-incremented per page
    layout_data = Column(Text, nullable=False)                # Full JSON snapshot
    content_hash = Column(String(64))                         # Hash at snapshot time
    label = Column(String(200))                               # Optional human label ("Pre-launch", "v2 draft")
    created_at = Column(String, nullable=False)

    # Relationships
    page = relationship("Page", back_populates="versions")
