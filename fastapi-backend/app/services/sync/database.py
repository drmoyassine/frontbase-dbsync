"""
Database configuration and session management for SQLite config storage.
"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.services.sync.config import settings


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""
    pass


# Ensure data directory exists
os.makedirs("data", exist_ok=True)

from sqlalchemy import event

# Create async engine
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
)

@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    # Only run PRAGMA execution for SQLite connections
    cursor = dbapi_connection.cursor()
    try:
        # Check if it's a SQLite connection by attempting the PRAGMA
        # Postgres throws syntax error on PRAGMA, so we catch it
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
    except:
        # Not SQLite (likely Postgres), allow to proceed
        pass
    finally:
        cursor.close()

# Session factory
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        # Import models to register them with Base
        from app.services.sync.models import datasource, sync_config, job, conflict, view, project_settings, table_schema  # noqa
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    """Dependency to get database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
