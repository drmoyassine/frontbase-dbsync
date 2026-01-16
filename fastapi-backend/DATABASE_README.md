# Database & Migration Patterns

This document describes the database architecture and migration patterns for Frontbase.

## Overview

Frontbase uses SQLite with SQLAlchemy ORM and Alembic for migrations.

| Component | Technology |
|-----------|------------|
| Database | SQLite (`data/db.sqlite3`) |
| ORM | SQLAlchemy 2.x (mapped_column syntax) |
| Migrations | Alembic |
| Database File | `data/db.sqlite3` (prod), `data/dev.db` (dev) |

---

## Migration Workflow

### Creating a New Migration

```bash
# Auto-generate migration from model changes
alembic revision --autogenerate -m "description_of_changes"

# Or create empty migration to write manually
alembic revision -m "description_of_changes"
```

### Running Migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Apply one migration at a time
alembic upgrade +1

# Show current revision
alembic current

# Show migration history
alembic history
```

### On VPS / Docker

```bash
# Run migrations inside container
docker exec -it <backend-container> alembic upgrade head

# Or connect directly
docker exec -it <backend-container> bash
cd /app
alembic upgrade head
```

---

## Migration Patterns

### 1. Safe Column Addition (SQLite-Compatible)

SQLite has limited ALTER TABLE support. Use `column_exists` helper:

```python
def column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(sa.text(f"PRAGMA table_info({table_name})"))
    columns = [row[1] for row in result.fetchall()]
    return column_name in columns

def upgrade():
    conn = op.get_bind()
    
    if not column_exists(conn, 'my_table', 'new_column'):
        op.execute("ALTER TABLE my_table ADD COLUMN new_column TEXT")
```

### 2. Safe Table Creation

```python
def table_exists(conn, table_name: str) -> bool:
    result = conn.execute(sa.text(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    ))
    return result.fetchone() is not None

def upgrade():
    conn = op.get_bind()
    
    if not table_exists(conn, 'new_table'):
        op.execute("""
            CREATE TABLE new_table (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
        """)
```

### 3. Index Creation

```python
def upgrade():
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
```

---

## SQLite Limitations

| Operation | Supported | Workaround |
|-----------|-----------|------------|
| ADD COLUMN | ✅ Yes | Direct ALTER TABLE |
| DROP COLUMN | ❌ No (SQLite <3.35) | Recreate table |
| RENAME COLUMN | ⚠️ Limited | `ALTER TABLE x RENAME COLUMN old TO new` |
| Modify column type | ❌ No | Recreate table |
| Add constraints | ❌ No | Recreate table |

### Workaround: Table Recreation

For complex changes, use the "copy and swap" pattern:

```python
def upgrade():
    # 1. Create new table with correct schema
    op.execute("""
        CREATE TABLE new_table (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            new_column INTEGER DEFAULT 0
        )
    """)
    
    # 2. Copy data
    op.execute("""
        INSERT INTO new_table (id, name, new_column)
        SELECT id, name, 0 FROM old_table
    """)
    
    # 3. Drop old table
    op.execute("DROP TABLE old_table")
    
    # 4. Rename new table
    op.execute("ALTER TABLE new_table RENAME TO old_table")
```

---

## Model Changes Checklist

When adding/modifying SQLAlchemy models:

1. ✅ Update the Model class in `app/models/` or `app/services/*/models/`
2. ✅ Create Alembic migration: `alembic revision -m "description"`
3. ✅ Test migration locally: `alembic upgrade head`
4. ✅ Commit both model AND migration files
5. ✅ On VPS: Run `docker exec <container> alembic upgrade head`

---

## Common Issues

### "No such column" Error

**Cause:** Migration wasn't run on VPS after deploying new code.

**Fix:**
```bash
docker exec -it <backend-container> alembic upgrade head
```

### Migration Already Applied But Missing Columns

**Cause:** Migration was marked complete but columns weren't actually added.

**Fix:** Create a new migration that safely adds missing columns (using `column_exists` check).

### Alembic Version Mismatch

**Cause:** `alembic_version` table shows a revision that doesn't exist.

**Fix:**
```bash
docker exec -it <backend-container> sqlite3 /app/data/db.sqlite3 "SELECT * FROM alembic_version"
# Then stamp to the correct version
docker exec -it <backend-container> alembic stamp <correct_revision>
```

---

## File Locations

```
fastapi-backend/
├── alembic.ini                    # Alembic config
├── alembic/
│   ├── env.py                     # Alembic environment
│   ├── script.py.mako             # Migration template
│   └── versions/                  # Migration files
│       ├── 0001_frontbase_core_tables.py
│       └── 0002_sync_schema_updates.py
├── app/
│   ├── database/                  # Database utilities
│   └── models/                    # SQLAlchemy models
└── data/
    └── db.sqlite3                 # SQLite database
```
