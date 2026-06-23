"""
WordPress migration services.

Transforms a WordPress discovery manifest (produced by the Frontbase Connector
plugin + ``WordPressPluginAdapter``) into Frontbase content-model proposals,
runs paginated imports with live progress, and emits old→new URL redirect maps.

Modules
-------
- ``mapping_service``  : discovery manifest → content models + default field maps
- ``import_service``   : orchestrates extraction → transformation → persistence
                         with an SSE-friendly progress store
- ``url_mapping``      : builds permalink → Frontbase-URL redirect tables
- ``redis_progress_store`` : Redis-backed progress store for multi-worker deployments
- ``audit``             : Structured audit logging for security compliance
- ``cleanup``           : Scheduled cleanup utilities for old imports
"""

from app.services.wordpress.mapping_service import (
    WordPressMappingService,
    ContentModelProposal,
    FieldMappingProposal,
)
from app.services.wordpress.import_service import (
    WordPressImportService,
    ImportProgressStore,
)
from app.services.wordpress.url_mapping import WordPressUrlMappingService
from app.services.wordpress.redis_progress_store import (
    RedisImportProgressStore,
    get_redis_import_store,
)
from app.services.wordpress.audit import WordPressAuditLogger, get_audit_logger, AuditEventType
from app.services.wordpress.cleanup import cleanup_old_imports, run_cleanup_sync

__all__ = [
    "WordPressMappingService",
    "ContentModelProposal",
    "FieldMappingProposal",
    "WordPressImportService",
    "ImportProgressStore",
    "WordPressUrlMappingService",
    "RedisImportProgressStore",
    "get_redis_import_store",
    "WordPressAuditLogger",
    "get_audit_logger",
    "AuditEventType",
    "cleanup_old_imports",
    "run_cleanup_sync",
]
