# Frontbase Builder - Agent Documentation

## Overview
Frontbase is an open-source, edge-native platform enabling teams to deploy AI-powered apps and edge services with no-code.

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: Shadcn UI + Tailwind CSS
- **State Management**: Zustand + TanStack Query (React Query)
- **Caching**: Redis / Upstash (Edge-compatible)
- **Drag & Drop**: @dnd-kit (Unified DnD engine)
- **Backend**: FastAPI (Python) + PostgreSQL (Production) / SQLite (Development)
- **Edge Engine**: Hono (SSR & Workflows)
- **Data Sources**: Multi-Source (Supabase, PostgreSQL, REST APIs)

### Directory Structure

```
src/                  # React Frontend
├── components/       # UI components
├── hooks/            # Data fetching & logic
├── modules/          # Feature-based modules (e.g., dbsync)
├── services/         # Shared services
└── ...

services/edge/        # Hono Edge Engine (SSR + Workflows)
├── src/db/           # Drizzle Schema (SQLite/Turso)
├── src/routes/       # Runtime Routes
└── ...

fastapi-backend/      # Unified Backend
├── app/              # API and Services
├── Dockerfile        # Production API image
└── ...

Dockerfile.frontend   # Production Frontend image
nginx.conf            # Production routing
docker-compose.yml    # Main production orchestration
docker-compose.legacy.yml # Legacy (Express) setup
Dockerfile.legacy     # Legacy image definition
```

## Key Concepts

### 1. Data Layer (React Query)

**Primary Hooks** (`src/hooks/useDatabase.ts`):
- `useGlobalSchema()` - Fetches FK relationships (1hr cache)
- `useTables()` - Fetches table list (5min cache)
- `useTableSchema(tableName)` - Fetches columns (10min cache)
- `useTableData(tableName, params)` - Fetches data with auto FK joins

**Consumer Hook** (`src/hooks/data/useSimpleData.ts`):
- Wraps React Query hooks for component use
- Manages local state (filters, pagination, sorting)
- Returns: `{ data, count, loading, error, schema, refetch, ... }`

### 2. Edge Self-Sufficiency
- **Concept**: The Edge Engine is a standalone runtime.
- **Rule**: Once published, Edge **NEVER** communicates with the FastAPI Builder.
- **Dependency**: Relies 100% on its own database (SQLite/Turso) and Redis.
- **Benefit**: Zero runtime coupling, faster edge performance, higher availability.

### 3. Component System

**Component Types**:
- **Basic**: Button, Text, Heading, Card, Badge, Image, Alert, etc.
- **Form**: Input, Textarea, Select, Checkbox, Switch
- **Layout**: Container, Tabs, Accordion, Breadcrumb
- **Data**: DataTable, KPICard, Chart, Grid (data-bound)

**Component Structure**:
```typescript
{
  id: string;
  type: string;
  props: Record<string, any>;
  styles?: ComponentStyles;
  responsiveStyles?: ResponsiveStyles;
  className?: string;
  children?: Component[];
}
```

### 4. Visual CSS Styling System

**Architecture**: Metadata-driven preset CSS properties engine

**Key Files**:
- `src/lib/styles/defaults.ts` - Default page styles (`getDefaultPageStyles()`)
- `src/lib/styles/configs.ts` - CSS property configurations
- `src/lib/styles/types.ts` - StylesData and related types
- `src/lib/styles/converters.ts` - CSS value converters
- `src/components/styles/PropertyControl.tsx` - Dynamic property controls

**StylesData Format**:
```typescript
{
  activeProperties: string[];   // Which properties are enabled
  values: Record<string, any>;  // Property values
  stylingMode: 'visual' | 'css' // Current styling mode
}
```

**CSS Property Categories**:
- **Layout**: flexDirection, justifyContent, alignItems, flexWrap
- **Spacing**: padding, margin, gap
- **Sizing**: width, height, minWidth, maxWidth
- **Typography**: fontSize, fontWeight, color, textAlign
- **Background**: backgroundColor, gradient
- **Visual Effects**: borderRadius, opacity, boxShadow

**Visual Toggle Groups**: Properties like flexDirection and alignItems use visual toggle groups instead of dropdowns for better UX.

### 5. Container Styles (Page-Level Styling)

**Storage Strategy**: Zero-migration nested JSON approach

**Data Flow**:
1. In-memory: `page.containerStyles` (top-level for convenience)
2. Database: `page.layoutData.root.containerStyles` (nested in JSON)
3. On save: Serialize to `layoutData.root`
4. On load: Extract to top-level `containerStyles`

**Key Implementation**:
- `createPageSlice.ts`: Handles serialization/deserialization
- `BuilderCanvas.tsx`: Applies styles via `getContainerCSS()`
- `StylingPanel.tsx`: UI for editing page styles

### 6. Responsive Builder

**Viewport Auto-Switching**:
| Screen Width | Canvas Viewport | Use Case |
|--------------|-----------------|----------|
| < 768px | Mobile (375x812) | Phone users |
| 768-1024px | Tablet (768x1024) | iPad users |
| > 1024px | Desktop (1200x1400) | Desktop users |

**Implementation** (`CustomBuilder.tsx`):
```typescript
useEffect(() => {
  const checkMobile = () => {
    const width = window.innerWidth;
    setIsMobile(width < 1024);
    if (width < 768) setCurrentViewport('mobile');
    else if (width < 1024) setCurrentViewport('tablet');
    else setCurrentViewport('desktop');
  };
  // ...
}, [setCurrentViewport]);
```

**Mobile UI**: Collapsible sidebars with drawer pattern for touch-friendly editing.

### 7. State Management

#### Zustand Stores
- **Builder Store** (`stores/builder.ts`): Page builder state (sliced architecture)
- **Dashboard Store** (`stores/dashboard.ts`): Dashboard and settings
- **Data Binding Store** (`stores/data-binding-simple.ts`): Legacy data management

#### React Query (TanStack Query)
- Server state management for database operations
- Automatic caching and background updates
- `keepPreviousData` for smooth pagination

### 8. Data Flow

```
Component → useSimpleData() → useTableData() → databaseApi → FastAPI → Supabase
                                    ↓
                            React Query Cache
```

### 9. Foreign Key Handling

FKs are automatically detected and joined:
1. `useGlobalSchema()` fetches FK relationships from `frontbase_get_schema_info` RPC
2. `useTableData()` constructs PostgREST select: `*,providers(*),categories(*)`
3. Related data is embedded in response as nested objects

## API Structure

### FastAPI Routes (`fastapi-backend/app/routers/`)

#### `/api/database`
- `GET /connections` - Get database connections
- `POST /connect-supabase` - Connect to Supabase
- `GET /tables` - List tables
- `GET /table-schema/:tableName` - Get table schema
- `GET /table-data/:tableName` - Get table data
- `POST /advanced-query` - RPC calls

#### `/api/pages`
- `GET /` - List pages
- `POST /` - Create page
- `PUT /:id` - Update page
- `DELETE /:id` - Delete page

#### `/api/auth`
- `POST /login` - User login
- `POST /logout` - User logout
- `GET /me` - Get current user

## Common Patterns

### 1. Adding a New Data Hook

Create in `src/hooks/useDatabase.ts`:
```typescript
export function useMyData(options) {
  return useQuery({
    queryKey: ['myData', options],
    queryFn: async () => {
      const response = await databaseApi.myEndpoint(options);
      return response.data;
    },
    staleTime: 5000,
  });
}
```

### 2. Adding a New API Endpoint

Add route in `fastapi-backend/app/routers/`:
```python
@router.get("/my-endpoint")
async def my_endpoint(request: Request, db: Session = Depends(get_db)):
    try:
        # Implementation
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

## Development Workflow

### Running Locally

**Terminal 1 - Backend (FastAPI)**:
```bash
cd fastapi-backend
# Ensure you have activated your venv!
# Windows: .\venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 - Edge Engine (Hono)**:
```bash
cd services/edge
npm run dev
# Runs on http://localhost:3002
# Swagger UI: http://localhost:3002/docs
```

**Terminal 3 - Frontend (Vite)**:
```bash
npm run dev
# Runs on http://localhost:5173
```

> **Note**: Actions Engine is optional for basic development but required for testing workflows.
> See `memory-bank/actionsArchitecture.md` for full architecture details.

### Running with Docker (Production)

**Direct Deployment (VPS)**:
```bash
# Start unified environment (FastAPI + Frontend + Redis)
docker-compose up -d --build
```

**Legacy/Reference Environment**:
```bash
# Start legacy setup (Express)
docker-compose -f docker-compose.legacy.yml up -d --build
```

### Database Migrations (Alembic)

**Automatic Deployment**: Migrations run automatically on container start via `docker_entrypoint.sh`. No manual intervention needed on VPS.

**Local Development Workflow**:
```bash
cd fastapi-backend

# 1. After changing models.py, generate a migration:
alembic revision --autogenerate -m "Add xyz column"

# 2. Review the generated script in alembic/versions/
# WARNING: Auto-generate can be aggressive - always review!

# 3. Test locally:
alembic upgrade head

# 4. Commit and push - VPS will apply automatically on deploy
```

**Key Files**:
- `alembic/env.py` - Alembic configuration (uses SYNC_DATABASE_URL)
- `alembic/versions/` - Migration scripts
- `docker_entrypoint.sh` - Runs `alembic upgrade head` before app start

**SQLite Gotchas**:
- Use `render_as_batch=True` in env.py for ALTER TABLE support
- Always provide `server_default` when adding NOT NULL columns to populated tables
- Name all constraints explicitly (no `None` constraint names)

## Troubleshooting

### Common Issues
- **FK columns show dashes**: Run `supabase_setup.sql` in Supabase
- **Data not loading**: Check Supabase connection in Settings
- **Build errors**: Clear `node_modules/.vite` cache
- **RLS config errors**: Ensure `columnMapping` uses `authUserIdColumn` (not `authIdColumn`)

### Debugging
- React Query DevTools: Shows cache state
- Browser Network tab: Verify API calls
- FastAPI `/docs`: Interactive API documentation

## Future Enhancements

Documented in `memory-bank/progress.md`:
- User-configurable FK display columns
- Optimized column fetching
- Multi-level relation support
- Undo/redo for builder actions
