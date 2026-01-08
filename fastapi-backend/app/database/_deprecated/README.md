# Deprecated Migration Files

These files are **no longer used** and are kept only for historical reference.

## Why Deprecated?

The project previously had two migration systems:
1. Custom SQL schema (`unified_schema.sql` + `migrate.py`)
2. Alembic migrations

In January 2026, these were consolidated into a **single Alembic-based system**.

## Current Migration System

All migrations are now managed through Alembic:
```
fastapi-backend/alembic/versions/
```

See `MIGRATIONS.md` in the project root for documentation.

## Files in this folder

- `migrate.py` - Old Python migration runner
- `unified_schema.sql` - Old SQL schema definition

**Do not use these files.** They are outdated and may not match the current schema.
