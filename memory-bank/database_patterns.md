# Database Compatibility Patterns

Frontbase is designed to support both **SQLite** (Development/Edge default) and **PostgreSQL** (Production). This dichotomy requires specific patterns in migrations, driver handling, and data models to ensure compatibility.

## 1. Driver Strategy

We use **Asynchronous** drivers for the runtime application and **Synchronous** drivers for Alembic migrations.

| Environment | Database | Application Driver | Alembic Driver |
| :--- | :--- | :--- | :--- |
| **Development** | SQLite | `sqlite+aiosqlite` | `sqlite` |
| **Production** | PostgreSQL | `postgresql+asyncpg` | `postgresql+psycopg2` |

### Implementation
- **Application (`database/config.py`):** Uses `create_async_engine` with the async URL unmodified.
- **Alembic (`env.py`):** Automatically detects `asyncpg` or `aiosqlite` in `DATABASE_URL` and converts it to `psycopg2` or `sqlite` (sync) respectively because Alembic migrations run synchronously.

## 2. Migration Best Practices

When writing Alembic migrations (`alembic revision`), you must ensure SQL compatibility for both dialects.

### A. Boolean Literals
*   **Problem:** SQLite uses `1`/`0`. PostgreSQL uses `true`/`false` and has a strict `BOOLEAN` type.
*   **Resolution:** Use dialect detection or SQLAlchemy's type abstraction. If writing raw SQL:
    ```python
    # DO NOT DO THIS
    op.execute("INSERT INTO settings (is_active) VALUES (1)")
    
    # DO THIS (Dialect Detection)
    dialect = op.get_bind().dialect.name
    true_val = "true" if dialect == "postgresql" else "1"
    op.execute(f"INSERT INTO settings (is_active) VALUES ({true_val})")
    ```

### B. Conditional Execution
*   **Problem:** Some commands are database-specific (e.g., SQLite `PRAGMA`).
*   **Resolution:** Check the dialect before executing.
    ```python
    if op.get_bind().dialect.name == 'sqlite':
        op.execute("PRAGMA foreign_keys=OFF")
    ```

### C. Datetime Functions
*   **SQLite:** `datetime('now')`
*   **PostgreSQL:** `NOW()`

## 3. Pydantic & Data Models

PostgreSQL and SQLite drivers return some data types differently.

### A. Datetime Parsing
*   **Problem:** `psycopg2` (and some Postgres configs) return `created_at` as a `datetime` object, but sometimes as a **String** (e.g. `'2024-01-01 12:00:00+00'`). Pydantic's default strict validator fails on space-separated strings.
*   **Resolution:** Use a `BeforeValidator` to handle string parsing flexibly.
    ```python
    from pydantic import BeforeValidator
    from typing import Annotated
    from datetime import datetime
    
    # Flexible Validator
    FlexibleDatetime = Annotated[datetime, BeforeValidator(lambda v: datetime.fromisoformat(v) if isinstance(v, str) else v)]
    
    class UserResponse(BaseModel):
        created_at: FlexibleDatetime
    ```

## 4. Connection Configuration

The system uses a single `DATABASE_URL` environment variable.

*   **SQLite:** `sqlite+aiosqlite:///./frontbase.db`
*   **PostgreSQL:** `postgresql+asyncpg://user:pass@host:5432/dbname`

**Important:** Do not hardcode driver prefixes in logic checks. Check for `sqlite` or `postgres` substrings to determine behavior.
