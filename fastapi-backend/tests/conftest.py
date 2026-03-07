"""
Shared pytest fixtures for the FastAPI backend tests.

CRITICAL: Uses sys.modules mock injection to replace the async sync service
modules before main.py is imported. This prevents:
  - create_async_engine() failing with sync pysqlite
  - Missing redis_client function imports across the codebase

Strategy: Use MagicMock modules that auto-generate any attribute.
"""

import pytest
import sys
import os
import types
import warnings
from unittest.mock import AsyncMock, MagicMock

# Suppress warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Ensure the app package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Override env vars BEFORE any app imports
os.environ["DATABASE_URL"] = "sqlite:///./test_db.sqlite3"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest")
os.environ.setdefault("SUPABASE_URL", "https://fake.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "fake-key")


# ── Build mock module hierarchy for app.services.sync.* ────────────────
# MagicMock auto-generates any attribute, so missing functions won't fail.

class MockModule(MagicMock):
    """A MagicMock that behaves as a module for sys.modules injection."""
    # Make it picklable and importable
    def __init__(self, *args, name="mock_module", **kwargs):
        super().__init__(*args, **kwargs)
        self.__name__ = name
        self.__loader__ = None
        self.__package__ = name
        self.__spec__ = None
        self.__path__ = []
        self.__file__ = None

# Pre-populate all sync service modules with mocks
_sync_modules = [
    "app.services.sync",
    "app.services.sync.config",
    "app.services.sync.database",
    "app.services.sync.redis_client",
    "app.services.sync.main",
    "app.services.sync.models",
    "app.services.sync.models.datasource",
    "app.services.sync.models.sync_config",
    "app.services.sync.models.job",
    "app.services.sync.models.conflict",
    "app.services.sync.models.view",
    "app.services.sync.models.project_settings",
    "app.services.sync.models.table_schema",
    "app.services.sync.services",
    "app.services.sync.services.state_manager",
    "app.services.sync.routers",
    "app.services.sync.routers.datasources",
    "app.services.sync.routers.datasources.schema",
    "app.services.sync.routers.sync_configs",
    "app.services.sync.routers.sync",
    "app.services.sync.routers.views",
    "app.services.sync.routers.webhooks",
    "app.services.sync.routers.settings",
    "app.services.sync.adapters",
    "app.services.sync.adapters.wordpress_api_adapter",
]

for mod_name in _sync_modules:
    if mod_name not in sys.modules:
        sys.modules[mod_name] = MockModule(name=mod_name)

# Override sync_app with a real (empty) FastAPI app so it can be mounted
from fastapi import FastAPI as _FastAPI
sys.modules["app.services.sync.main"].sync_app = _FastAPI()

# Also mock the CSS bundler's sync deps
if "app.services.css_bundler" not in sys.modules:
    sys.modules["app.services.css_bundler"] = MockModule(name="app.services.css_bundler")

# ── Now safe to import ─────────────────────────────────────────────────
from fastapi.testclient import TestClient
from app.database.config import Base, engine
import app.models.models  # noqa
import app.models.actions  # noqa

# Create core tables (drop first to ensure schema freshness with model changes)
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)


@pytest.fixture(scope="session")
def app():
    """Provide the FastAPI app instance."""
    from main import app as fastapi_app
    return fastapi_app


@pytest.fixture
def client(app):
    """TestClient for making HTTP requests."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def db_session():
    """Get a fresh database session."""
    from app.database.config import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def clean_drafts_table():
    """Wipe automation_drafts before each test for isolation."""
    from app.database.config import SessionLocal
    session = SessionLocal()
    try:
        session.execute(__import__("sqlalchemy").text("DELETE FROM automation_drafts"))
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()
    yield


@pytest.fixture
def sample_draft_data():
    """Sample workflow draft data for testing."""
    return {
        "name": "Test Workflow",
        "description": "A test workflow for pytest",
        "trigger_type": "manual",
        "trigger_config": {},
        "nodes": [{
            "id": "n1",
            "name": "Log Step",
            "type": "log",
            "position": {"x": 0, "y": 0},
            "inputs": [],
            "outputs": [],
        }],
        "edges": [],
        "settings": {"rate_limit_max": 60, "cooldown_ms": 0},
    }
