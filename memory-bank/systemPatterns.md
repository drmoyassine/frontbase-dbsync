# System Patterns

This file documents recurring patterns and standards used in the project.
2026-01-02 - 🎨 Added Builder Styling and Responsive patterns
2025-12-25 05:20:00 - Updated with React Query patterns

## Builder UI/UX Patterns (NEW)

### Visual CSS Styling Engine
- **Pattern**: Metadata-driven preset CSS properties
- **Implementation**: 
  - `src/lib/styles/configs.ts` - CSS property configurations
  - `src/lib/styles/defaults.ts` - `getDefaultPageStyles()` single source of truth
  - `src/components/styles/PropertyControl.tsx` - Dynamic control rendering
- **Benefits**: Extensible, type-safe, visual toggle groups for better UX
- **Usage**: StylingPanel for page-level styles, future component-level styling

### Container Styles Persistence
- **Pattern**: Zero-migration nested JSON storage
- **Implementation**:
  - In-memory: `page.containerStyles` (top-level convenience)
  - Database: `page.layoutData.root.containerStyles` (nested JSON)
  - On save: Serialize to `layoutData.root`
  - On load: Extract to top-level
- **Benefits**: No database migration needed, backward compatible
- **Files**: `createPageSlice.ts` (serialize/deserialize), `BuilderCanvas.tsx` (apply styles)

### Responsive Viewport Pattern
- **Pattern**: Auto-switch viewport based on screen size
- **Implementation** (`CustomBuilder.tsx`):
  - < 768px → Mobile viewport (375×812)
  - 768-1024px → Tablet viewport (768×1024)
  - > 1024px → Desktop viewport (1200×1400)
- **Benefits**: WYSIWYG editing on any device
- **Usage**: Combined with mobile drawer pattern for sidebars

### @dnd-kit Drag and Drop
- **Pattern**: Unified DnD engine for all drag interactions
- **Components**: ComponentPalette, BuilderCanvas, LayersPanel
- **Benefits**: Hardware-accelerated CSS transforms, accessibility, consistent behavior

## Architecture Patterns

### State Management
- **Zustand with Slices**: Large stores split into domain-specific slices
- **React Query for Server State**: Data fetching, caching, synchronization
- **Local State for UI**: Component-level state for UI interactions

### Data Flow Pattern (Current)
```
Component → useSimpleData() → useTableData() → databaseApi → FastAPI → Supabase
                                    ↓
                              React Query Cache
```

## Coding Patterns

### React Query Data Hooks
**2025-12-25 - Primary Data Fetching Pattern**
- **Pattern**: Centralized data hooks in `useDatabase.ts`
- **Implementation**:
  - `useGlobalSchema()` - Fetches FK relationships (1hr cache)
  - `useTables()` - Fetches table list (5min cache)
  - `useTableSchema(tableName)` - Fetches columns (10min cache)
  - `useTableData(tableName, params)` - Fetches rows with auto FK joins
- **Benefits**: Caching, stale-while-revalidate, automatic error handling
- **Usage**: All data-bound components use these hooks

### Automatic FK Join Pattern
**2025-12-25 - PostgREST Embedded Resources**
- **Pattern**: Embed FK relationships in `select` clause
- **Implementation**: `select=*,providers(*),categories(*)`
- **Benefits**: Single query, no N+1, automatic relationship resolution
- **Usage**: `useTableData` constructs select clause from global schema

### API Contract Validation
**Pattern**: Zod schemas for API response validation
- **Implementation**: `ApiContracts.validate()` wrapper
- **Location**: `src/services/api-contracts.ts`
- **Usage**: All API calls validate responses against schemas

### Component Architecture
- **Pattern**: Specialized renderer delegation
- **Implementation**: ComponentRenderer → BasicRenderers, FormRenderers, etc.
- **Benefits**: Maintainability, extensibility

### Zustand Store Pattern
- **Pattern**: Centralized state with persist middleware
- **Stores**: builder, dashboard, auth
- **Benefits**: Predictable updates, persistence, TypeScript support

## Backend Patterns

### FastAPI Router Organization
- **Pattern**: Modular routers by domain
- **Location**: `fastapi-backend/app/routers/`
- **Files**: database.py, pages.py, auth.py, project.py

## Environment Patterns

### Python Virtual Environment Strategy
- **Pattern**: Strict isolation per machine
- **Implementation**: 
  - `requirements.txt` locked to specific versions
  - `venv` directory excluded from git
  - Explicit activation required (`source venv/bin/activate` or `.\venv\Scripts\activate`)
- **Reasoning**: Avoids system-level package conflicts (especially with modern Python versions like 3.13) and ensures reproducible builds.

### Production Docker Setup (VPS)
- **Pattern**: Multi-container orchestration (FastAPI + Frontend + Redis)
- **Components**:
    - **Backend**: Python 3.11-slim, FastAPI, Gunicorn/Uvicorn
    - **Frontend**: Node 20-alpine build, served via Nginx
    - **Routing**: Nginx reverse proxy for SPA and API
- **Benefits**: Scalability, isolation, identical environment between VPS and local test

### Legacy Parity Pattern
- **Pattern**: Archived legacy components for reference
- **Implementation**: `docker-compose.legacy.yml` + `Dockerfile.legacy`
- **Purpose**: Behavioral verification and historical reference during migration

## Performance Patterns

### Request Caching (React Query)
- **staleTime**: How long data is fresh
- **cacheTime**: How long inactive data stays in cache
- **Configuration**: Per-hook basis based on data volatility

### Component Memoization
- **Pattern**: React.memo for expensive components
- **Usage**: Data table cells, complex renderers