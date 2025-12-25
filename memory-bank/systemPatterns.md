# System Patterns

This file documents recurring patterns and standards used in the project.
2025-12-25 05:20:00 - Updated with React Query patterns

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

### API Response Format
- **Pattern**: Consistent `{success, data, message}` envelope
- **Implementation**: All endpoints return this format
- **Validation**: Frontend validates with Zod schemas

## Performance Patterns

### Request Caching (React Query)
- **staleTime**: How long data is fresh
- **cacheTime**: How long inactive data stays in cache
- **Configuration**: Per-hook basis based on data volatility

### Component Memoization
- **Pattern**: React.memo for expensive components
- **Usage**: Data table cells, complex renderers