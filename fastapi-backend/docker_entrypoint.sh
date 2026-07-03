#!/bin/bash
set -e

# Load persisted secrets (e.g. FERNET_KEY) from the Docker volume.
# This file is auto-created by the app on first run and survives container recreation.
if [ -f /app/data/.env ]; then
  echo "Loading persisted environment from /app/data/.env"
  set -a  # auto-export all sourced variables
  source /app/data/.env
  set +a
fi

# Wait for PostgreSQL if using it (either via DATABASE_URL or DATABASE env var)
if [ "$DATABASE" = "postgresql" ] || echo "$DATABASE_URL" | grep -q "^postgresql"; then
  echo "Waiting for PostgreSQL to be ready..."
  until python -c "
from app.database.config import SYNC_DATABASE_URL
from sqlalchemy import create_engine, text
e = create_engine(SYNC_DATABASE_URL, pool_pre_ping=True)
with e.connect() as c:
    c.execute(text('SELECT 1'))
" 2>/dev/null; do
    echo "  PostgreSQL not ready, retrying in 2s..."
    sleep 2
  done
  echo "PostgreSQL is ready!"
fi

# Bootstrap: create all tables from SQLAlchemy models (idempotent — skips existing).
# This MUST run before Alembic because the initial migration (c5311426ba79) is minimal
# and assumes tables were already created by create_all(). On fresh DBs, without this
# step, Alembic migrations crash with "NoSuchTableError".
#
# Self-healing: if create_all fails due to readonly database (common when the
# persisted volume was created before the non-root user change), we detect it,
# create tables as root, and restart. Exit code 149 signals entrypoint to restart.
echo "Bootstrapping database tables..."
BOOTSTRAP_OK=0
python -c "
from app.database.config import Base, engine
import app.models.models  # register all models
Base.metadata.create_all(bind=engine)
print('Tables bootstrapped successfully')
" 2>/dev/null || BOOTSTRAP_OK=$?

if [ $BOOTSTRAP_OK -ne 0 ]; then
  # Check if it's a readonly database error
  READONLY_STATUS=0
  python -c "
import sys
try:
  from app.database.config import Base, engine
  import app.models.models
  Base.metadata.create_all(bind=engine)
  sys.exit(0)
except Exception as e:
  if 'readonly' in str(e).lower() or 'attempt to write' in str(e).lower():
    sys.exit(1)  # Confirmed readonly error
  sys.exit(2)  # Other error
  " || READONLY_STATUS=$?

  if [ $READONLY_STATUS -eq 1 ]; then
    echo "Database is readonly (volume ownership issue). Fixing as root..."

    # Fix volume ownership BEFORE creating tables (only works as root)
    if [ "$(id -u)" = "0" ]; then
      echo "Ensuring /app/data is owned by UID 1000..."
      chown -R 1000:1000 /app/data
      chmod -R u+rwX /app/data
    else
      echo "Not running as root — cannot fix ownership. This may fail in self-host/VPS mode."
    fi

    # Create tables as root (run with escalated privileges)
    python -c "
from app.database.config import engine
from sqlalchemy import text
import app.models.models  # register all models

# Create all tables via SQLAlchemy metadata (ensures consistent schema)
from app.database.config import Base
Base.metadata.create_all(bind=engine)
print('Tables created via root (fixed)')
    "

    # Fix ownership again after table creation (only works as root)
    if [ "$(id -u)" = "0" ]; then
      echo "Re-applying ownership after bootstrap..."
      chown -R 1000:1000 /app/data
      chmod -R u+rwX /app/data
    fi

    echo "Database ownership fixed and tables created successfully"
  else
    # Not a readonly error - let it fail with the actual message
    python -c "
from app.database.config import Base, engine
import app.models.models
Base.metadata.create_all(bind=engine)
"
  fi
fi

# Ensure correct ownership even when bootstrap succeeded (only works as root)
# This catches the case where bootstrap worked on first run but created root-owned files
if [ "$(id -u)" = "0" ]; then
  echo "Ensuring data directory is writable by appuser..."
  chown -R 1000:1000 /app/data 2>/dev/null || true
  chmod -R u+rwX /app/data 2>/dev/null || true
fi
echo "Tables bootstrapped successfully"

# Run Alembic migrations.
# On fresh DBs (no alembic_version row), stamp head — create_all() already made
# all tables, so running incremental migrations would fail on existing tables.
# On existing DBs, run upgrade normally for incremental changes.
# On DBs created via create_all() but no alembic_version: detect schema state
# and stamp to appropriate version, then run migrations to catch up.
echo "Running database migrations..."
DB_STATE=$(python -c "
from app.database.config import engine
from sqlalchemy import text, inspect
with engine.connect() as conn:
    inspector = inspect(conn)
    tables = inspector.get_table_names()
    if 'alembic_version' not in tables:
        print('fresh')
    else:
        row = conn.execute(text('SELECT version_num FROM alembic_version LIMIT 1')).fetchone()
        if row is None:
            print('fresh')
        else:
            print('existing')
")
if [ "$DB_STATE" = "fresh" ]; then
  echo "No alembic_version table found, checking if database already has tables..."
  # Check if this is a DB created by create_all() (tables exist but no alembic_version)
  TABLES_EXIST=$(python -c "
from app.database.config import engine
from sqlalchemy import text, inspect
with engine.connect() as conn:
    inspector = inspect(conn)
    tables = inspector.get_table_names()
    # Check for a few core tables that indicate create_all() was run
    if 'edge_engines' in tables and 'datasources' in tables:
        print('yes')
    else:
        print('no')
")
  if [ "$TABLES_EXIST" = "yes" ]; then
    echo "Tables exist but no alembic_version (created via create_all), detecting schema state..."
    # Detect which migrations have already been applied by checking for key columns
    # We'll check for edge_vector_id (added in 0053) to determine current state
    SCHEMA_VERSION=$(python -c "
from app.database.config import engine
from sqlalchemy import text, inspect
with engine.connect() as conn:
    inspector = inspect(conn)
    tables = inspector.get_table_names()
    if 'edge_engines' not in tables:
        print('0050')  # Base: before edge_vectors work
    else:
        columns = [c['name'] for c in inspector.get_columns('edge_engines')]
        if 'edge_vector_id' in columns:
            print('head')  # Already at or past 0053
        else:
            print('0052')  # Before edge_vectors (0053), need to run 0053+
")
    if [ "$SCHEMA_VERSION" = "head" ]; then
      echo "Schema is already at latest version, stamping Alembic to head..."
      alembic stamp head
    else
      echo "Detected schema at pre-$SCHEMA_VERSION state, stamping to $SCHEMA_VERSION then upgrading..."
      alembic stamp "$SCHEMA_VERSION"
      echo "Now running alembic upgrade to apply pending migrations..."
      alembic upgrade head
    fi
  else
    echo "Fresh database detected, stamping Alembic to head..."
    alembic stamp head
    echo "Database stamped to head"
  fi
else
  echo "Existing database, running alembic upgrade..."
  alembic upgrade head
fi

echo "Upserting master admin user..."
python create_admin.py

# Start the application with proxy headers support (for HTTPS behind reverse proxy)
# - Self-host/VPS: Running as root, drop to appuser via gosu (security best practice)
# - Cloud/Kubernetes: Already running as non-root, skip gosu and run directly
#
# Single-container model: the Celery worker and the API run side by side. Bash stays
# PID 1 (no `exec`) so it can (a) forward SIGTERM to BOTH children on `docker stop`
# for a graceful drain, and (b) take the whole container down the moment EITHER
# process dies — otherwise a crashed/OOM-killed worker would leave the container
# reporting "healthy" (uvicorn still up) while all background jobs silently stop.
#
# --beat embeds Celery Beat in the worker so the periodic schedule in
# app.services.task_queue (retention prune, cleanups) actually fires. This is safe
# precisely because there is exactly ONE worker in this single container — no risk
# of duplicate beat schedulers. --concurrency is capped to keep memory bounded
# (default prefork spawns one child per CPU core; tune CELERY_CONCURRENCY per host).
CELERY_CONCURRENCY="${CELERY_CONCURRENCY:-2}"

echo "Starting Celery worker (with embedded beat, concurrency=${CELERY_CONCURRENCY}) in the background..."
if [ "$(id -u)" = "0" ]; then
  gosu appuser celery -A app.services.task_queue worker --beat --concurrency="${CELERY_CONCURRENCY}" --loglevel=info &
else
  celery -A app.services.task_queue worker --beat --concurrency="${CELERY_CONCURRENCY}" --loglevel=info &
fi
CELERY_PID=$!

echo "Starting application..."
if [ "$(id -u)" = "0" ]; then
  # Running as root — drop privileges to appuser
  gosu appuser uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' &
else
  # Already running as non-root (cloud/Kubernetes) — run directly
  uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' &
fi
UVICORN_PID=$!

# Forward termination signals to both children for a graceful shutdown.
term() {
  echo "Received termination signal, shutting down worker and API..."
  kill -TERM "$CELERY_PID" 2>/dev/null || true
  kill -TERM "$UVICORN_PID" 2>/dev/null || true
}
trap term TERM INT

# Block until EITHER process exits; then tear the other down so the orchestrator
# restarts a clean container instead of serving a half-dead one.
wait -n || true
echo "A managed process exited — bringing the container down for a clean restart."
term
exit 1
