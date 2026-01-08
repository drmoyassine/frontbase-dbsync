# Active Context

This file tracks the project's current status, including recent changes, current goals, and open questions.
2026-01-09 - 🔄 MIGRATION CONSOLIDATION: Unified into single Alembic system
2026-01-09 - 🛤️ TRAILING SLASH FIXES: Fixed 25+ routes to prevent 307 redirects
2026-01-09 - 📝 AUTH FORMS: Fixed response format and trashed pages display
2026-01-06 - 🔒 RLS SINGLE POLICY BUILDER: Fixed user validation bug (button disabled)
2026-01-06 - 🔒 RLS BATCH POLICY BUILDER: Fixed TypeScript property mismatch (`authIdColumn` → `authUserIdColumn`)
2026-01-06 - 🔄 ALEMBIC MIGRATIONS: Automated database migrations for VPS deployments
2026-01-02 - 🎨 BUILDER UI/UX REVAMP: Visual CSS Styling, Responsive Viewport, Container Styles
2026-01-01 - 🔒 DEPENDENCY HARDENING: Updated requirements and setup for cross-platform robustness
2025-12-25 05:20:00 - INITIAL COMMIT READY: FastAPI + React Query Migration Complete

## Current Focus

**🔄 MIGRATION & API CONSOLIDATION COMPLETE**
- **COMPLETED**: Unified two migration systems into single Alembic system
- **COMPLETED**: Fixed 25+ routes with missing trailing slashes
- **COMPLETED**: Fixed auth_forms API response format
- **COMPLETED**: Fixed trashed pages display (includeDeleted param)
- **STATUS**: All changes pushed to main, MIGRATIONS.md documentation created

### Current Environment Status
- **FastAPI Backend (Port 8000)**: ✅ Primary - Unified API & DB-Sync
- **Express.js Backend (Port 3001)**: ⚠️ Legacy - Archived in `Dockerfile.legacy`
- **Frontend (Port 5173)**: ✅ Active - Vite dev server or Nginx (Prod)
- **Builder**: ✅ **REVAMPED** - 17-phase UI/UX improvements complete

## Recent Changes

**2026-01-09 - 🔄 MIGRATION CONSOLIDATION**
- **UNIFIED**: Consolidated `unified_schema.sql` + `migrate.py` into Alembic
- **NEW MIGRATION**: `0001_frontbase_core_tables.py` (15 tables, idempotent)
- **DOCS**: Created `MIGRATIONS.md` with comprehensive documentation
- **CLEANUP**: Moved deprecated files to `app/database/_deprecated/`
- **ENTRYPOINT**: Simplified to only run `alembic upgrade head`

**2026-01-09 - 🛤️ TRAILING SLASH FIXES (25+ routes)**
- **ISSUE**: FastAPI 307 redirects breaking frontend API calls
- **FIX**: Added trailing slashes to all parameterized routes
- **ROUTES FIXED**:
  - `main.py`: `/health/`
  - `sync/main.py`: `/health/`
  - `pages.py`: `/{page_id}/`, `/layout/`, `/restore/`, `/permanent/`
  - `database.py`: `/table-schema/{table_name}/`, `/table-data/{table_name}/`
  - `testing.py`: `/{datasource_id}/test/`, `/test-update/`
  - Plus all sync service routes (views, datasources, sync_configs, etc.)

**2026-01-09 - 📝 AUTH FORMS API FIX**
- **500 ERROR**: Fixed missing `auth_forms` table (now in Alembic)
- **RESPONSE FORMAT**: Changed from raw data to `{success: true, data: ...}`
- **FRONTEND**: Fixed `getPages()` to pass `includeDeleted` param for trashed pages

**2026-01-06 - 🔒 RLS SINGLE POLICY BUILDER FIX**
- **FIX**: Resolved "Create Policy" button disabled bug in `RLSPolicyBuilder.tsx`
- **ISSUE**: Validation logic ignored `actorConditionGroup` (Visual Builder "Who" conditions)
- **SOLUTION**: Added `actorConditionGroup` and `isUnauthenticated` checks to `isValid` logic
- **COMMIT**: Pushed fix to main branch (`886e2b8`)

**2026-01-06 - 🔒 RLS BATCH POLICY BUILDER FIX**
- **FIX**: Resolved TypeScript error in `RLSBatchPolicyBuilder.tsx` line 159
- **ISSUE**: Property `authIdColumn` did not exist on `columnMapping` type
- **SOLUTION**: Changed `config?.columnMapping?.authIdColumn` to `config?.columnMapping?.authUserIdColumn`
- **COMMIT**: Pushed fix to main branch (`9e80d59`)

**2026-01-06 - 🔄 ALEMBIC MIGRATIONS IMPLEMENTED**
- **SETUP**: Installed Alembic with SQLite batch mode support (`render_as_batch=True`)
- **AUTO-DEPLOY**: Migrations run automatically via `docker_entrypoint.sh` on container start
- **FIX**: Resolved VPS 500 error by adding `columns` and `foreign_keys` to `table_schema_cache`
- **PATTERN**: Minimal, surgical migrations using raw SQL for SQLite compatibility
- **WORKFLOW**: Generate locally → Review → Commit → Deploy automatically

**2026-01-02 - 🎨 BUILDER UI/UX REVAMP COMPLETE**
- **VISUAL STYLING**: Implemented metadata-driven preset CSS properties engine
- **CONTAINER STYLES**: Zero-migration nested JSON persistence (`layoutData.root.containerStyles`)
- **RESPONSIVE BUILDER**: Auto-switching viewport (mobile <768px, tablet 768-1024px, desktop >1024px)
- **CANVAS UX**: Grid bounds fixed to viewport, double-click to add components
- **DND MIGRATION**: Completed @dnd-kit migration from legacy react-dnd
- **CODE CLEANUP**: Removed unused imports (Magnet, snapToGrid, Button, Badge)
- **DOCS UPDATED**: agent.md with new sections 3-5 for styling, container styles, responsive builder

**2025-12-27 - 🐳 Docker Organization & VPS Readiness**
- **REFACTORED**: Docker configuration to separate Production (FastAPI) from Legacy (Express).
- **RENAMED**: `docker-compose.prod.yml` → `docker-compose.yml` (Main).
- **RENAMED**: Legacy files to `Dockerfile.legacy` and `docker-compose.legacy.yml`.
- **CREATED**: `Dockerfile.frontend` and `nginx.conf` for VPS deployment.
- **UPDATED**: `agent.md` and Memory Bank with new architecture details.

**2025-12-25 05:20:00 - 🚀 INITIAL COMMIT PREPARATION**
- **MIGRATED**: Data layer to React Query (`useDatabase.ts` hooks)
- **FIXED**: Foreign key "dashes" bug (joins now in PostgREST `select` clause)
- **UPDATED**: README.md with FastAPI setup instructions
- **CLEANED**: Removed debug components from push (kept locally)
- **OPTIMIZED**: Gitignore for clean repository

**2025-12-25 04:40:00 - 🔧 React Query Migration**
- **CREATED**: `src/hooks/useDatabase.ts` with:
  - `useGlobalSchema()` - FK relationship fetching
  - `useTables()` - Table list fetching
  - `useTableSchema()` - Column schema fetching
  - `useTableData()` - Data with automatic FK joins
- **REFACTORED**: `useSimpleData.ts` to use React Query hooks
- **UPDATED**: `TableSelector.tsx` to use `useTables()` hook

**2025-12-24 - Express to FastAPI Migration**
- Completed full backend migration
- Updated Vite proxy to point to FastAPI (port 8000)
- Archived Express server for reference

## Open Questions/Issues

**Resolved ✅**
- ✅ FK data showing dashes → Fixed with proper `select` clause
- ✅ Table selector not showing active table → Fixed with React Query
- ✅ Console logging spam → Removed debug logs

**Post-Push Verification**
- Deploy in fresh environment to confirm no Express dependencies
- Test all Supabase features end-to-end
- Verify authentication flow with FastAPI

**Future Enhancements (Documented)**
- User-configurable FK display columns
- Optimized fetching (select specific columns)
- Heuristic FK detection fallback
- Multi-level relation support
