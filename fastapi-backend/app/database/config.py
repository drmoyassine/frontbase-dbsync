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
    # Normalize PostgreSQL URLs to use the psycopg2 sync driver
    # Supabase/Heroku use postgresql:// or postgres://, SQLAlchemy needs +psycopg2
    url = DATABASE_URL_OVERRIDE
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql://") and "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    SYNC_DATABASE_URL = url
elif DATABASE == "postgresql":
    SYNC_DATABASE_URL = f"postgresql+psycopg2://frontbase:{DB_PASSWORD}@postgres:5432/frontbase"
else:
    # Auto-detect Docker (/app/data volume) vs local dev (current dir)
    data_dir = "/app/data" if os.path.isdir("/app/data") else "."
    SYNC_DATABASE_URL = f"sqlite:///{data_dir}/frontbase.db"

# Determine if using SQLite (needs different engine config)
is_sqlite = SYNC_DATABASE_URL.startswith("sqlite")

# ── Connection-pool sizing (Sprint 3B) ──────────────────────────────────────
# pool_size=20 base + max_overflow=30 = 50 max concurrent connections.
#
# Sizing rationale (target: AppSumo spike ≈ 10k req/min ≈ 167 req/s sustained):
#   - Each request holds a connection for ~the query duration. A typical Frontbase
#     read is 10–50ms; a signup (insert tenant/user + email handoff) ~300–500ms.
#   - At 167 req/s with ~50ms/query, the steady-state concurrent connection count
#     is ~8–10 reads; signups are bursty and hold longer, so 50 headroom covers
#     short bursts without exhausting Postgres `max_connections` (each conn ≈ 5–10MB,
#     so 50 ≈ 250–500MB RAM — fine on a standard VPS).
#   - Tuning trigger (from load test 3A): if pool checkout wait > 100ms p95 OR
#     read saturation > 90%, bump to pool_size=30, max_overflow=50 (80 max) and/or
#     enable the read replica below. Do NOT pre-size for hypothetical load.
DEFAULT_POOL_SIZE = 20
DEFAULT_MAX_OVERFLOW = 30

# Create SQLAlchemy engine with appropriate settings
if is_sqlite:
    engine = create_engine(
        SYNC_DATABASE_URL,
        connect_args={"check_same_thread": False},  # Needed for SQLite
        pool_size=DEFAULT_POOL_SIZE,
        max_overflow=DEFAULT_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=3600
    )
else:
    # PostgreSQL doesn't need check_same_thread
    engine = create_engine(
        SYNC_DATABASE_URL,
        pool_size=DEFAULT_POOL_SIZE,
        max_overflow=DEFAULT_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=3600
    )

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ── Optional read replica (Sprint 3B — INERT unless configured) ─────────────
# Provide a read-only engine for GET-heavy routes ONLY when the load test proves
# read saturation. Set SQLALCHEMY_READ_URL to a read-replica DSN to enable; leave
# unset to route all reads through the primary engine (default — no behaviour change).
READ_DATABASE_URL = os.getenv("SQLALCHEMY_READ_URL")
read_engine = None
ReadSessionLocal = None
if READ_DATABASE_URL:
    _rurl = READ_DATABASE_URL
    if _rurl.startswith("postgres://"):
        _rurl = _rurl.replace("postgres://", "postgresql+psycopg2://", 1)
    elif _rurl.startswith("postgresql://") and "+psycopg2" not in _rurl:
        _rurl = _rurl.replace("postgresql://", "postgresql+psycopg2://", 1)
    read_engine = create_engine(
        _rurl,
        pool_size=DEFAULT_POOL_SIZE,
        max_overflow=DEFAULT_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=3600,
    )
    ReadSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=read_engine)


def get_read_db():
    """Yield a read-replica session. Falls back to the primary when no replica is
    configured, so callers can use this for GET routes unconditionally."""
    if ReadSessionLocal is None:
        # No replica configured — use the primary engine (inert fallback).
        db = SessionLocal()
    else:
        db = ReadSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Create Base class for models
Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()