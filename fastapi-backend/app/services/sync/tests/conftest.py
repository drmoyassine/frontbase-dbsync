"""
Test configuration and fixtures for pytest (sync service).

CRITICAL — pin the database to an isolated test SQLite BEFORE importing any
app module. The sync engine resolves its URL at import time from the
DATABASE_URL/DATABASE env vars; without this override it points at the
application's real configured database (local dev SQLite or cloud Postgres).
The autouse `setup_database` fixture below calls Base.metadata.drop_all() on
teardown of every test, so running these tests against the real DB would
DROP the datasources table (and all other sync tables) — destroying real
data. (This mirrors the isolation in tests/conftest.py for the main app.)
"""

import os

# Isolate the test database BEFORE any app/database import builds the engine.
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_sync_db.sqlite3"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest")

import pytest
import asyncio
from httpx import AsyncClient, ASGITransport

from app.services.sync.main import sync_app as app
from app.services.sync.database import engine, Base, async_session


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
async def setup_database():
    """Create tables before each test and drop after."""
    from app.database.config import Base as MainBase
    import app.models.models  # noqa
    from app.services.sync.database import init_db, Base
    
    async with engine.begin() as conn:
        await conn.run_sync(MainBase.metadata.create_all)
        
    await init_db()
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(MainBase.metadata.drop_all)


@pytest.fixture
async def client():
    """Async HTTP client for testing API endpoints."""
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db():
    """Database session for tests."""
    async with async_session() as session:
        yield session
