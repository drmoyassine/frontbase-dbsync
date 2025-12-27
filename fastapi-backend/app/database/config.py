import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Database configuration - Use FastAPI's own unified database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./unified.db")

# Ensure we use the synchronous driver for the Main App
# The Sync sub-app uses async ("sqlite+aiosqlite"), but Main App uses sync ("sqlite")
SYNC_DATABASE_URL = DATABASE_URL.replace("sqlite+aiosqlite", "sqlite")

# Create SQLAlchemy engine
engine = create_engine(
    SYNC_DATABASE_URL,
    connect_args={"check_same_thread": False}  # Needed for SQLite
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