# Database & Migration Patterns

Frontbase uses **SQLite + SQLAlchemy + Alembic** for database management.

## Quick Reference

| Component | Path |
|-----------|------|
| Database | `data/db.sqlite3` |
| Migrations | `alembic/versions/` |
| Config | `alembic.ini` |

---

## Common Commands

```bash
# Apply all migrations
alembic upgrade head

# Create new migration
alembic revision -m "description"

# Show current version
alembic current

# Show history
alembic history
```

### On VPS (Docker)

```bash
docker exec -it <backend-container> alembic upgrade head
```

---

## Migration Pattern

Always use **safe column/table existence checks** for SQLite compatibility:

```python
"""Description of migration

Revision ID: xxxx
Revises: previous_revision
"""
from alembic import op
import sqlalchemy as sa


revision = 'xxxx'
down_revision = 'previous_revision'


def column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if column exists in SQLite table."""
    result = conn.execute(sa.text(f"PRAGMA table_info({table_name})"))
    return column_name in [row[1] for row in result.fetchall()]


def table_exists(conn, table_name: str) -> bool:
    """Check if table exists in SQLite."""
    result = conn.execute(sa.text(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    ))
    return result.fetchone() is not None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Add column safely
    if not column_exists(conn, 'my_table', 'new_column'):
        op.execute("ALTER TABLE my_table ADD COLUMN new_column TEXT")
    
    # Create table safely
    if not table_exists(conn, 'new_table'):
        op.execute("""
            CREATE TABLE new_table (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
        """)


def downgrade() -> None:
    # SQLite doesn't support DROP COLUMN easily
    pass
```

---

## Workflow Checklist

1. ✅ Update SQLAlchemy model in `app/models/` or `app/services/*/models/`
2. ✅ Create migration: `alembic revision -m "add_xyz_column"`
3. ✅ Test locally: `alembic upgrade head`
4. ✅ Commit model + migration together
5. ✅ On VPS: `docker exec <container> alembic upgrade head`

---

## Troubleshooting

### "No such column" Error

Migration wasn't run on VPS:
```bash
docker exec -it <backend-container> alembic upgrade head
```

### Check Current State

```bash
docker exec -it <backend-container> sqlite3 /app/data/db.sqlite3 "SELECT * FROM alembic_version"
```
