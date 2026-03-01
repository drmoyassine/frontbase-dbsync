# Frontbase FastAPI Backend

This is the primary control plane backend for Frontbase - orchestrating the visual database builder, user authentication, and the edge publishing pipeline.

## Setup Instructions

### Prerequisites
- Python 3.11 or higher
- `pip` (Python package manager)

### Installation (Virtual Environment)

For isolation, it's strictly required to use a virtual environment:

1. **Create Virtual Environment**:
   ```bash
   python -m venv venv
   ```
2. **Activate Environment**:
   - **Windows PowerShell**: `.\venv\Scripts\activate`
   - **macOS/Linux**: `source venv/bin/activate`
3. **Install Dependencies**:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```
4. **Initialize Database**:
   ```bash
   alembic upgrade head
   ```

### Running the Backend

```bash
python -m uvicorn main:app --reload --port 8000
```
The API is available at `http://localhost:8000` (proxied in dev via Vite on `5173`).
Interactive docs: `http://localhost:8000/docs`

---

## Database & Migration Patterns

The backend uses **SQLAlchemy + Alembic** for schema migrations, supporting both SQLite (dev) and PostgreSQL (prod) via dialect detection. 

### Common Commands

```bash
# Apply all pending migrations (run this after pulling new code!)
alembic upgrade head

# Create a new migration script after modifying models.py
alembic revision -m "description_of_change"

# View migration history
alembic history
```

### Workflow Checklist for Schema Changes

1. ✅ Update the SQLAlchemy model in `app/models/models.py`
2. ✅ Update the corresponding Pydantic schema in `app/models/schemas.py`
3. ✅ Create migration: `alembic revision -m "added_new_column"`
4. ✅ Write the migration logic in `alembic/versions/xxxx_added_new_column.py`
      *(Note: Use safe `column_exists` checks for SQLite `ALTER TABLE` operations)*
5. ✅ Test locally: `alembic upgrade head`
6. ✅ Commit `models.py`, `schemas.py`, and the migration file together.

---

## Key Endpoints Overview

For the complete OpenApi spec, visit `/docs`. Here are the major sub-routers:

### `/api/auth`
Authentication flows. Issues HTTP-only session cookies and verifies Supabase JWTs.
- `POST /register`, `POST /login`, `POST /logout`

### `/api/project` & `/api/deployment-targets`
Workspace and deployment definitions.
- `GET/PUT /api/project` - Global SEO and theme settings.
- `CRUD /api/deployment-targets/` - Defines environments (Vercel, Cloudflare, Local).

### `/api/edge-databases`
Manages the connection credentials for Turso, Neon, or local SQLite edge state DBs.

### `/api/cloudflare`
- `POST /deploy` - Compiles the edge Worker bundle (`tsup`), injects secrets, and pushes the worker to Cloudflare.

### `/api/database`
PostgREST proxy for the user's connected Supabase/PostgreSQL instance.
- `/tables`, `/table-schema/{table}`, `/table-data/{table}`

### `/api/pages` & `/api/variables`
Draft state CRUD for the builder canvas.

---

## Project Structure

```text
fastapi-backend/
├── main.py                 # FastAPI entrypoint and global middleware
├── requirements.txt        # Locked dependencies
├── app/
│   ├── database/           # Connection configs and utilities
│   ├── models/             # SQLAlchemy (models.py) & Pydantic (schemas.py)
│   ├── routers/            # Domain-specific route controllers
│   └── services/           # Orchestration logic (e.g., publish_pipeline.py)
├── alembic/
│   ├── env.py              # Migration environment (dialect mapping)
│   └── versions/           # Ordered schema migration scripts
└── tests/                  # Pytest test suite
```