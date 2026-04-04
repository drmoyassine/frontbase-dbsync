"""
ORM Models — Re-export hub.

Domain models are split into focused files for maintainability:
  - auth.py:  User, UserSession, UserSetting, Project, AppVariable
  - sync.py:  SyncConfig, FieldMapping, SyncJob, Conflict, DatasourceView, TableSchemaCache
  - edge.py:  EdgeDatabase, EdgeCache, EdgeQueue, EdgeProviderAccount, EdgeEngine, EdgeGPUModel, EdgeAPIKey
  - page.py:  Page, PageDeployment

This file re-exports everything so existing imports (from ...models.models import X)
continue to work without modification.
"""

# Auth & Settings
from .auth import User, UserSession, UserSetting, Project, AppVariable  # noqa: F401

# DB-Sync
from .sync import SyncConfig, FieldMapping, SyncJob, Conflict, DatasourceView, TableSchemaCache  # noqa: F401

# Edge Infrastructure
from .edge import (  # noqa: F401
    EdgeDatabase, EdgeCache, EdgeQueue, EdgeProviderAccount,
    EdgeEngine, EdgeGPUModel, EdgeAPIKey,
)

# Pages
from .page import Page, PageDeployment  # noqa: F401

# Actions (registered with Base via side-effect import)
from app.models.actions import AutomationDraft, AutomationExecution  # noqa: F401

# Storage
from .storage_provider import StorageProvider  # noqa: F401

# Themes
from .theme import ComponentTheme  # noqa: F401