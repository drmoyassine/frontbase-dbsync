# Frontbase Builder - Agent Documentation

## Overview
Frontbase is a visual page builder application that allows users to create web pages through a drag-and-drop interface. It features database connectivity (Supabase), component-based design, and real-time preview capabilities.

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: Shadcn UI + Tailwind CSS
- **State Management**: Zustand (persistent stores)
- **Drag & Drop**: React DND
- **Backend**: Node.js + Express + SQLite
- **Database Integration**: Supabase (via REST API)

### Directory Structure

```
src/
├── components/
│   ├── builder/          # Page builder components
│   │   ├── renderers/    # Component renderers (Basic, Form, Layout, Data)
│   │   ├── hooks/        # Builder-specific hooks
│   │   ├── data-binding/ # Data binding UI
│   │   └── style-controls/ # Styling controls
│   ├── dashboard/        # Dashboard UI components
│   ├── data-binding/     # Data-bound components (DataTable, KPICard, etc.)
│   └── ui/              # Shadcn UI components
├── hooks/
│   └── data/            # Data fetching hooks (useSimpleData, useTableSchema, etc.)
├── stores/              # Zustand stores
├── services/            # API services
├── lib/                 # Utilities
├── pages/               # Route pages
└── types/               # TypeScript types

server/
├── routes/api/
│   ├── database/        # Database API routes (connection, schema, data)
│   ├── auth.js          # Authentication
│   ├── pages.js         # Page management
│   ├── project.js       # Project settings
│   └── variables.js     # App variables
└── utils/               # Server utilities
```

## Key Concepts

### 1. Component System
The builder uses a component-based architecture where each UI element is a draggable, configurable component.

**Component Types**:
- **Basic**: Button, Text, Heading, Card, Badge, Image, Alert, etc.
- **Form**: Input, Textarea, Select, Checkbox, Switch
- **Layout**: Container, Tabs, Accordion, Breadcrumb
- **Data**: DataTable, KPICard, Chart, Grid (data-bound components)

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

### 2. State Management

#### Builder Store (`stores/builder.ts`)
Manages the page builder state using a sliced architecture:
- **Project Slice**: Project settings
- **Page Slice**: Page CRUD and database sync
- **Builder Slice**: Component manipulation (move, update, delete)
- **UI Slice**: Tooling state (preview, viewport, zoom)
- **Variables Slice**: App variables

#### Dashboard Store (`stores/dashboard.ts`)
Manages dashboard state:
- Database connections
- Project settings
- User data

#### Data Binding Store (`stores/data-binding-simple.ts`)
Manages data fetching and caching:
- Database connection status
- Table schemas
- Component data bindings
- Query cache

### 3. Data Binding System

**Flow**:
1. User connects to Supabase via Dashboard
2. Tables are fetched and cached in `data-binding-simple` store
3. User binds a data component (DataTable, KPICard, etc.) to a table
4. `useSimpleData` hook fetches and manages data for the component
5. Data is cached and refreshed based on pagination/sorting/filtering

**Key Files**:
- `src/services/database-api.ts` - API service layer
- `src/stores/data-binding-simple.ts` - Data state management
- `src/hooks/data/useSimpleData.ts` - Main data fetching hook
- `src/components/builder/data-binding/DataBindingModal.tsx` - Binding UI

### 4. Rendering System

**ComponentRenderer** (`src/components/builder/ComponentRenderer.tsx`):
- Main component that renders all builder components
- Delegates to specialized renderers:
  - `BasicRenderers.tsx`
  - `FormRenderers.tsx`
  - `LayoutRenderers.tsx`
  - `DataRenderers.tsx`
- Handles data binding resolution
- Manages inline text editing

**DraggableComponent** (`src/components/builder/DraggableComponent.tsx`):
- Wraps components with drag-and-drop functionality
- Handles drop zones for nesting
- Manages component selection

## API Structure

### Server Routes

#### `/api/auth`
- `POST /login` - User login
- `POST /logout` - User logout
- `GET /me` - Get current user
- `GET /demo-info` - Get demo mode info

#### `/api/database`
- `GET /connections` - Get database connections
- `POST /connect-supabase` - Connect to Supabase
- `DELETE /disconnect-supabase` - Disconnect
- `GET /supabase-tables` - List tables
- `GET /table-schema/:tableName` - Get table schema
- `GET /table-data/:tableName` - Get table data (with pagination, sorting, filtering)
- `POST /distinct-values` - Get distinct column values

#### `/api/pages`
- `GET /` - List all pages
- `GET /:id` - Get page by ID
- `POST /` - Create page
- `PUT /:id` - Update page
- `DELETE /:id` - Delete page

#### `/api/variables`
- `GET /` - List app variables
- `POST /` - Create variable
- `PUT /:id` - Update variable
- `DELETE /:id` - Delete variable

## Common Patterns

### 1. Adding a New Component Type

1. **Define default props** in `src/lib/componentDefaults.ts`
2. **Create renderer** in appropriate renderer file (`BasicRenderers.tsx`, etc.)
3. **Add to ComponentPalette** in `src/components/builder/ComponentPalette.tsx`
4. **Add properties panel** in `src/components/builder/PropertiesPanel.tsx`
5. **Add styling support** if needed

### 2. Adding a New Data Hook

1. Create hook in `src/hooks/data/`
2. Use `databaseApi` service for API calls
3. Integrate with `data-binding-simple` store if caching is needed
4. Export from `src/hooks/useSimpleData.ts` for backward compatibility

### 3. Adding a New API Endpoint

1. Add route in appropriate file in `server/routes/api/`
2. Use `authenticateToken` middleware for protected routes
3. Access database via `DatabaseManager` instance
4. Return consistent response format: `{ success: boolean, data?: any, message?: string }`

## Important Notes

### Data Persistence
- Builder state is persisted to SQLite via `/api/pages`
- User settings stored in `user_settings` table
- Project settings in `project` table
- Data bindings stored in browser localStorage (Zustand persist)

### Authentication
- JWT-based authentication
- Tokens stored in httpOnly cookies
- Demo mode available (no auth required)

### Responsive Design
- Components support responsive styles per breakpoint
- Viewports: mobile (375px), tablet (768px), desktop (1024px)
- Zoom levels: 50%, 75%, 100%, 125%, 150%

### Inline Editing
- Double-click text components to edit inline
- Uses `InlineTextEditor` component
- Managed by `useComponentTextEditor` hook

## Development Workflow

### Running Locally
```bash
# Frontend (port 5173)
npm run dev

# Backend (port 3001)
cd server && npm run dev
```

### Building
```bash
npm run build
```

### Code Organization Principles
1. **Modularity**: Keep files focused and under 400 lines
2. **Separation of Concerns**: Separate UI, logic, and data layers
3. **Reusability**: Extract common patterns into hooks/utilities
4. **Type Safety**: Use TypeScript interfaces for all data structures

## Recent Refactorings

### Builder Store Refactoring (Dec 2025)
- Split monolithic `builder.ts` into modular slices (`createPageSlice`, `createBuilderSlice`, etc.)
- Enforced stricter TypeScript configuration (`noImplicitAny: true`)
- Centralized shared types in `src/types/builder.ts`

### ComponentRenderer Refactoring
- Split large switch statement into categorized renderer files
- Extracted text editing logic into `useComponentTextEditor` hook
- Created shared `RendererProps` interface

### Database API Refactoring
- Split monolithic `database.js` into modular files (connection, schema, data)
- Created `database-api.ts` service layer on frontend
- Organized data hooks into `src/hooks/data/` directory

### Users Dashboard Refactoring (Dec 2025)
- **Modularized UI Components**:
  - `FilterBar`: Extracted individual filters into `src/components/data-binding/filters/`
  - `UniversalDataTable`: Extracted `DataTableCell` and `ColumnSettingsPopover`
  - `CompactColumnConfigurator`: Extracted `DraggableColumnItem`
- **Logic Extraction**:
  - `UserManagementTable`: Created `useFilterOptions` and `useUserTableBinding` hooks
  - **Backend**: centralized authentication logic in `server/routes/api/database/utils.js`

## Troubleshooting

### Build Warnings
- **Dynamic import warnings**: Expected for lazy-loaded modules
- **Large chunk warnings**: Consider code splitting if bundle > 500KB

### Common Issues
- **Data not loading**: Check Supabase connection and service key
- **Components not rendering**: Verify component type in `ComponentRenderer`
- **Drag-and-drop not working**: Check React DND provider wrapping

## Future Considerations
- Implement undo/redo for builder actions
- Add component templates/presets
- Support for custom component plugins
- Multi-user collaboration features
