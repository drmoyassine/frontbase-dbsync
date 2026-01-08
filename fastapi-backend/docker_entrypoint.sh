#!/bin/bash
set -e

# Run unified schema migration (creates auth_forms, pages, etc.)
echo "Running unified schema migration..."
python -m app.database.migrate || echo "Unified schema migration skipped or failed (may already exist)"

# Run Alembic migrations
echo "Running Alembic migrations..."
alembic upgrade head || echo "Alembic migrations skipped or failed"

# Start the application
echo "Starting application..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
