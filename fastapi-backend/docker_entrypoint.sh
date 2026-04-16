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
echo "Bootstrapping database tables..."
python -c "
from app.database.config import Base, engine
import app.models.models  # register all models
Base.metadata.create_all(bind=engine)
print('Tables bootstrapped successfully')
"

# Run Alembic migrations.
# On fresh DBs (no alembic_version row), stamp head — create_all() already made
# all tables, so running incremental migrations would fail on existing tables.
# On existing DBs, run upgrade normally for incremental changes.
echo "Running database migrations..."
python -c "
from app.database.config import engine
from sqlalchemy import text, inspect
with engine.connect() as conn:
    inspector = inspect(conn)
    tables = inspector.get_table_names()
    if 'alembic_version' not in tables:
        # Completely fresh — create_all made tables, just stamp
        print('Fresh database detected, stamping Alembic to head...')
        exit(0)
    else:
        row = conn.execute(text('SELECT version_num FROM alembic_version LIMIT 1')).fetchone()
        if row is None:
            print('Empty alembic_version, stamping to head...')
            exit(0)
        else:
            print(f'Existing database at revision {row[0]}, running upgrade...')
            exit(1)
"
NEEDS_UPGRADE=$?
if [ $NEEDS_UPGRADE -eq 0 ]; then
  alembic stamp head
  echo "Database stamped to head"
else
  alembic upgrade head
fi

# Start the application with proxy headers support (for HTTPS behind reverse proxy)
echo "Starting application..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
