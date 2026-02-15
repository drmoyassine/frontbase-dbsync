#!/bin/bash
set -e

# Wait for PostgreSQL if using it
if [ "$DATABASE" = "postgresql" ]; then
  echo "Waiting for PostgreSQL to be ready..."
  until python -c "
import psycopg2, os
psycopg2.connect(
    host='postgres', port=5432, user='frontbase',
    password=os.environ.get('DB_PASSWORD', 'frontbase-dev-password'),
    dbname='frontbase'
)
" 2>/dev/null; do
    echo "  PostgreSQL not ready, retrying in 2s..."
    sleep 2
  done
  echo "PostgreSQL is ready!"
fi

# Run Alembic migrations (handles all tables including Frontbase core)
echo "Running database migrations..."
alembic upgrade head

# Start the application with proxy headers support (for HTTPS behind reverse proxy)
echo "Starting application..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
