# Frontbase Builder - Agent Documentation

## Overview
Frontbase is a visual database builder and admin panel for Supabase. It enables users to create web pages through a drag-and-drop interface with automatic data binding.

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: Shadcn UI + Tailwind CSS
- **State Management**: Zustand + TanStack Query (React Query)
- **Drag & Drop**: React DND
- **Backend**: FastAPI (Python) + SQLite
- **Database Integration**: Supabase (via PostgREST)

### Directory Structure

```
src/                  # React Frontend
├── components/       # UI components
├── hooks/            # Data fetching & logic
├── modules/          # Feature-based modules (e.g., dbsync)
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

### 2. Component System

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

### 3. State Management

#### Zustand Stores
- **Builder Store** (`stores/builder.ts`): Page builder state (sliced architecture)
- **Dashboard Store** (`stores/dashboard.ts`): Dashboard and settings
- **Data Binding Store** (`stores/data-binding-simple.ts`): Legacy data management

#### React Query (TanStack Query)
- Server state management for database operations
- Automatic caching and background updates
- `keepPreviousData` for smooth pagination

### 4. Data Flow

```
Component → useSimpleData() → useTableData() → databaseApi → FastAPI → Supabase
                                    ↓
                            React Query Cache
```

### 5. Foreign Key Handling

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
.\venv\Scripts\activate  # Windows
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 - Frontend (Vite)**:
```bash
npm run dev
```

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

## Troubleshooting

### Common Issues
- **FK columns show dashes**: Run `supabase_setup.sql` in Supabase
- **Data not loading**: Check Supabase connection in Settings
- **Build errors**: Clear `node_modules/.vite` cache

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
