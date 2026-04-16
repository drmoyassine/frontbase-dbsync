import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Database configuration
# Priority: DATABASE_URL (full conn string) > DATABASE + DB_PASSWORD (constructed)
DATABASE_URL_OVERRIDE = os.getenv("DATABASE_URL")
DATABASE = os.getenv("DATABASE", "sqlite")
DB_PASSWORD = os.getenv("DB_PASSWORD", "frontbase-dev-password")

if DATABASE_URL_OVERRIDE:
    # Direct connection string (e.g. Supabase: postgresql+psycopg2://...)
    SYNC_DATABASE_URL = DATABASE_URL_OVERRIDE
elif DATABASE == "postgresql":
    SYNC_DATABASE_URL = f"postgresql+psycopg2://frontbase:{DB_PASSWORD}@postgres:5432/frontbase"
else:
    # Auto-detect Docker (/app/data volume) vs local dev (current dir)
    data_dir = "/app/data" if os.path.isdir("/app/data") else "."
    SYNC_DATABASE_URL = f"sqlite:///{data_dir}/frontbase.db"

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