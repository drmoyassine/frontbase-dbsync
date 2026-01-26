import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Database configuration - Use FastAPI's own unified database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./unified.db")

# Convert async drivers to sync drivers for Alembic migrations
# - SQLite: sqlite+aiosqlite -> sqlite
# - PostgreSQL: postgresql+asyncpg -> postgresql+psycopg2
SYNC_DATABASE_URL = DATABASE_URL.replace("sqlite+aiosqlite", "sqlite").replace("postgresql+asyncpg", "postgresql+psycopg2")

# Determine if using SQLite (needs different engine config)
is_sqlite = SYNC_DATABASE_URL.startswith("sqlite")

# Create SQLAlchemy engine with appropriate settings
if is_sqlite:
    engine = create_engine(
        SYNC_DATABASE_URL,
        connect_args={"check_same_thread": False},  # Needed for SQLite
        pool_size=20,
        max_overflow=30,
        pool_pre_ping=True,
        pool_recycle=3600
    )
else:
    # PostgreSQL doesn't need check_same_thread
    engine = create_engine(
        SYNC_DATABASE_URL,
        pool_size=20,
        max_overflow=30,
        pool_pre_ping=True,
        pool_recycle=3600
    )

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()