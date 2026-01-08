#!/bin/bash
set -e

# Run Alembic migrations (handles all tables including Frontbase core)
echo "Running database migrations..."
alembic upgrade head

# Start the application
echo "Starting application..."
exec uvicorn main:app --host 0.0.0.0 --port 8000

