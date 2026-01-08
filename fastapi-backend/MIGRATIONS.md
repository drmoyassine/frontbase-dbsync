# Database Migrations

This project uses **Alembic** as the single, unified database migration system.

## Overview

All database schema changes are managed through Alembic migrations located in:
```
fastapi-backend/alembic/versions/
```

## Running Migrations

### Automatic (Docker)
Migrations run automatically on container startup via `docker_entrypoint.sh`:
```bash
alembic upgrade head
```

### Manual
```bash
cd fastapi-backend

# Apply all migrations
alembic upgrade head

# Check current version
alembic current

# View migration history
alembic history

# Rollback one migration
alembic downgrade -1

# Rollback all migrations
alembic downgrade base
```

## Creating New Migrations

### Auto-generate from model changes
```bash
alembic revision --autogenerate -m "Description of changes"
```

### Create empty migration
```bash
alembic revision -m "Description of changes"
```

## Current Migrations

| Revision | Description |
|----------|-------------|
| `c5311426ba79` | Initial migration - adds columns to `table_schema_cache` |
| `0001_frontbase_core` | Frontbase core tables (project, pages, users, auth_forms, etc.) |

## Tables Managed

### Frontbase Core
- `project` - Project settings and Supabase credentials
- `pages` - Website pages with layout data
- `app_variables` - Application variables
- `assets` - Uploaded files
- `users` - Admin users
- `user_sessions` - Authentication sessions
- `user_settings` - User preferences
- `page_views` - Analytics
- `rls_policy_metadata` - RLS policy tracking
- `auth_forms` - Authentication forms

### Sync Service
- `sync_configs` - Sync configurations
- `field_mappings` - Field mapping rules
- `sync_jobs` - Sync job history
- `conflicts` - Conflict tracking

### Schema Cache
- `table_schema_cache` - Cached table schemas

## Deprecated Files

The following files in `app/database/_deprecated/` are **no longer used**:
- `migrate.py` - Old custom migration script
- `unified_schema.sql` - Old SQL schema file

These were replaced by Alembic migrations in January 2026 to consolidate into a single migration system.

## Best Practices

1. **Always test migrations locally** before deploying
2. **Use idempotent operations** - migrations should be safe to run multiple times
3. **Check for table existence** before CREATE TABLE (see `0001_frontbase_core` for example)
4. **Never edit deployed migrations** - create new ones instead
5. **Include both upgrade() and downgrade()** functions
