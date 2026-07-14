"""Response contracts for the pages domain (CF-22 P0 response_model burn-down).

These mirror the EXACT dict shapes the pages routers return today
(serialize_page / serialize_version in app/routers/pages) — camelCase keys,
`{success, data?, message?, error?}` envelope. response_model both documents
and enforces the shape, so any field added to the serializers must be added
here (the openapi hygiene gate keeps the exported contract in sync).
"""

from typing import Optional

from pydantic import BaseModel


class PageDeploymentTarget(BaseModel):
    """Engine summary embedded in a deployment record (may be empty)."""

    id: Optional[str] = None
    name: Optional[str] = None
    url: Optional[str] = None
    is_shared: Optional[bool] = None
    provider: Optional[str] = None


class PageDeploymentOut(BaseModel):
    id: str
    engineId: str
    status: Optional[str] = None
    version: Optional[int] = None
    contentHash: Optional[str] = None
    publishedAt: Optional[str] = None
    errorMessage: Optional[str] = None
    previewUrl: Optional[str] = None
    target: PageDeploymentTarget


class PageOut(BaseModel):
    """serialize_page() shape."""

    id: str
    name: str
    slug: str
    title: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[str] = None
    isPublic: Optional[bool] = None
    isHomepage: Optional[bool] = None
    layoutData: dict
    createdAt: str
    updatedAt: str
    deletedAt: Optional[str] = None
    contentHash: Optional[str] = None
    hasUnpublishedChanges: bool
    deployments: list[PageDeploymentOut] = []


class PageEnvelope(BaseModel):
    """Single-page (or data-less ack) envelope used by the pages CRUD routes."""

    success: bool
    data: Optional[PageOut] = None
    message: Optional[str] = None
    error: Optional[str] = None


class PageListEnvelope(BaseModel):
    success: bool
    data: Optional[list[PageOut]] = None
    error: Optional[str] = None


class PageVersionOut(BaseModel):
    """serialize_version() shape; layoutData only present on the detail route."""

    id: str
    pageId: str
    versionNumber: int
    contentHash: Optional[str] = None
    label: Optional[str] = None
    createdAt: str
    layoutData: Optional[dict] = None


class PageVersionEnvelope(BaseModel):
    success: bool
    data: Optional[PageVersionOut] = None
    message: Optional[str] = None
    error: Optional[str] = None


class PageVersionListEnvelope(BaseModel):
    success: bool
    data: Optional[list[PageVersionOut]] = None
    error: Optional[str] = None


class RollbackResult(BaseModel):
    preRollbackVersionId: str
    restoredVersionNumber: int


class RollbackEnvelope(BaseModel):
    success: bool
    message: Optional[str] = None
    data: Optional[RollbackResult] = None
    error: Optional[str] = None


class PublishResult(BaseModel):
    """Single-target publish: {success, message?, previewUrl?, version?} | {success, error}."""

    success: bool
    message: Optional[str] = None
    previewUrl: Optional[str] = None
    version: Optional[int] = None
    error: Optional[str] = None


class BatchPublishEngineResult(BaseModel):
    engineId: str
    name: Optional[str] = None
    success: bool
    error: Optional[str] = None
    previewUrl: Optional[str] = None


class BatchPublishResult(BaseModel):
    success: bool
    message: Optional[str] = None
    results: list[BatchPublishEngineResult] = []
    error: Optional[str] = None
