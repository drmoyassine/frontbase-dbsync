#!/bin/bash
# Apply all database migrations

# 1. Run base schema migration
echo "Running base schema migration..."
python3 app/database/migrate.py

# 2. Run specific sync service migrations
echo "Running sync service migrations..."
python3 -m app.services.sync.migrations.add_foreign_keys_column

echo "All migrations completed."
