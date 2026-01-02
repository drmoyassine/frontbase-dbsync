# Active Context

This file tracks the project's current status, including recent changes, current goals, and open questions.
2026-01-02 - 🎨 BUILDER UI/UX REVAMP: Visual CSS Styling, Responsive Viewport, Container Styles
2026-01-01 - 🔒 DEPENDENCY HARDENING: Updated requirements and setup for cross-platform robustness
2025-12-25 05:20:00 - INITIAL COMMIT READY: FastAPI + React Query Migration Complete

## Current Focus

**🎨 BUILDER UI/UX REVAMP COMPLETE (17 Phases)**
- **COMPLETED**: Visual CSS Styling System (metadata-driven preset properties)
- **COMPLETED**: Container Styles with zero-migration persistence
- **COMPLETED**: Responsive viewport auto-switching (mobile/tablet/desktop)
- **COMPLETED**: Canvas UX improvements (grid bounds, double-click to add)
- **COMPLETED**: @dnd-kit migration from legacy react-dnd
- **STATUS**: All builder improvements pushed to remote

### Current Environment Status
- **FastAPI Backend (Port 8000)**: ✅ Primary - Unified API & DB-Sync
- **Express.js Backend (Port 3001)**: ⚠️ Legacy - Archived in `Dockerfile.legacy`
- **Frontend (Port 5173)**: ✅ Active - Vite dev server or Nginx (Prod)
- **Builder**: ✅ **REVAMPED** - 17-phase UI/UX improvements complete

## Recent Changes

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
