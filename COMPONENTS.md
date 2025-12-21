# Component Reference

## Builder Components

### Core Components

#### ComponentRenderer
**Location**: `src/components/builder/ComponentRenderer.tsx`

Main component that renders all builder components. Delegates to specialized renderers and handles data binding.

**Props**:
```typescript
{
  component: Component;
  isSelected?: boolean;
  children?: React.ReactNode;
  onComponentClick?: (id: string, event: React.MouseEvent) => void;
  onDoubleClick?: (id: string, event: React.MouseEvent) => void;
}
```

#### DraggableComponent
**Location**: `src/components/builder/DraggableComponent.tsx`

Wraps components with drag-and-drop functionality using React DND.

**Features**:
- Drag to reorder
- Drop zones for nesting
- Visual feedback during drag
- Selection handling

### Renderers

#### BasicRenderers
**Location**: `src/components/builder/renderers/BasicRenderers.tsx`

Renders basic UI components:
- **Button**: Clickable button with variants
- **Text**: Text paragraph with size options
- **Heading**: H1-H6 headings
- **Card**: Card container with title/description
- **Badge**: Small label badge
- **Image**: Image with alt text
- **Alert**: Alert message box
- **Separator**: Horizontal divider
- **Avatar**: User avatar with fallback
- **Progress**: Progress bar
- **Link**: Hyperlink with target options

#### FormRenderers
**Location**: `src/components/builder/renderers/FormRenderers.tsx`

Renders form components:
- **Input**: Text input field
- **Textarea**: Multi-line text input
- **Select**: Dropdown selector
- **Checkbox**: Checkbox with label
- **Switch**: Toggle switch

#### LayoutRenderers
**Location**: `src/components/builder/renderers/LayoutRenderers.tsx`

Renders layout components:
- **Container**: Flex/grid container with nesting
- **Tabs**: Tabbed interface
- **Accordion**: Collapsible sections
- **Breadcrumb**: Navigation breadcrumbs

#### DataRenderers
**Location**: `src/components/builder/renderers/DataRenderers.tsx`

Renders data-bound components:
- **DataTable**: Table with pagination/sorting
- **KPICard**: Key metric display
- **Chart**: Data visualization
- **Grid**: Data grid layout

### Panels

#### PropertiesPanel
**Location**: `src/components/builder/PropertiesPanel.tsx`

Displays and edits component properties. Shows different fields based on component type.

**Features**:
- Type-specific property editors
- Data binding configuration
- Component deletion

#### StylingPanel
**Location**: `src/components/builder/StylingPanel.tsx`

Manages component styling with visual controls.

**Features**:
- Color picker
- Font controls
- Spacing controls
- Responsive styles
- Style presets

#### LayersPanel
**Location**: `src/components/builder/LayersPanel.tsx`

Shows component hierarchy tree.

**Features**:
- Nested component visualization
- Component selection
- Reordering via drag-and-drop

### Style Controls

#### ColorPicker
**Location**: `src/components/builder/style-controls/ColorPicker.tsx`

Color selection with preset colors and custom input.

#### FontControl
**Location**: `src/components/builder/style-controls/FontControl.tsx`

Font family, size, and weight selection.

#### SpacingControl
**Location**: `src/components/builder/style-controls/SpacingControl.tsx`

Margin and padding controls with visual preview.

## Data Binding Components

### UniversalDataTable
**Location**: `src/components/data-binding/UniversalDataTable.tsx`

Advanced data table with full feature set.

**Features**:
- Pagination
- Sorting
- Filtering
- Search
- Column customization
- Data binding integration

**Props**:
```typescript
{
  binding: ComponentDataBinding;
  className?: string;
}
```

### KPICard
**Location**: `src/components/data-binding/KPICard.tsx`

Displays key performance indicator with trend.

**Props**:
```typescript
{
  binding: ComponentDataBinding;
  className?: string;
}
```

### Chart
**Location**: `src/components/data-binding/Chart.tsx`

Data visualization component supporting bar, line, and pie charts.

**Props**:
```typescript
{
  binding: ComponentDataBinding;
  chartType: 'bar' | 'line' | 'pie';
  className?: string;
}
```

### Grid
**Location**: `src/components/data-binding/Grid.tsx`

Displays data in a responsive grid layout.

**Props**:
```typescript
{
  binding: ComponentDataBinding;
  columns: number;
  className?: string;
}
```

## Dashboard Components

### DatabasePanel
**Location**: `src/components/dashboard/DatabasePanel.tsx`

Manages database connections and displays table data.

**Features**:
- Supabase connection management
- Table listing
- Table data viewer
- Schema viewer

### PagesPanel
**Location**: `src/components/dashboard/PagesPanel.tsx`

Lists and manages pages.

**Features**:
- Create new pages
- Edit existing pages
- Delete pages
- Navigate to builder

### SupabaseConnectionModal
**Location**: `src/components/dashboard/SupabaseConnectionModal.tsx`

Modal for configuring Supabase connection.

**Fields**:
- Supabase URL
- Anon key
- Service key (optional)

## UI Components (Shadcn)

All UI components are located in `src/components/ui/` and follow Shadcn UI patterns.

### Common Components
- **Button**: `button.tsx`
- **Input**: `input.tsx`
- **Select**: `select.tsx`
- **Card**: `card.tsx`
- **Dialog**: `dialog.tsx`
- **Table**: `table.tsx`
- **Badge**: `badge.tsx`
- **Skeleton**: `skeleton.tsx`
- **Toast**: `toast.tsx`
- **Tooltip**: `tooltip.tsx`

## Hooks

### useSimpleData
**Location**: `src/hooks/data/useSimpleData.ts`

Main hook for fetching and managing data for data-bound components.

**Usage**:
```typescript
const {
  data,
  count,
  loading,
  error,
  schema,
  refetch,
  setFilters,
  setSorting,
  setPagination,
  setSearchQuery
} = useSimpleData({
  componentId: 'my-component',
  binding: componentBinding,
  autoFetch: true
});
```

### useTableSchema
**Location**: `src/hooks/data/useTableSchema.ts`

Fetches and caches table schema.

**Usage**:
```typescript
const { schema, loading, error, refetch } = useTableSchema(tableName);
```

### useDataMutation
**Location**: `src/hooks/data/useDataMutation.ts`

Provides CRUD operations for table data.

**Usage**:
```typescript
const { insert, update, remove, loading } = useDataMutation(tableName);

await insert({ name: 'John', email: 'john@example.com' });
await update(id, { name: 'Jane' });
await remove(id);
```

### useComponentTextEditor
**Location**: `src/components/builder/hooks/useComponentTextEditor.tsx`

Manages inline text editing for components.

**Returns**:
```typescript
{
  isEditing: boolean;
  handleTextEdit: (property: string, text: string) => void;
  handleTextEditEnd: () => void;
  createEditableText: (text: string, property: string, className: string, style?: CSSProperties) => ReactNode;
}
```

## Utilities

### styleUtils
**Location**: `src/lib/styleUtils.ts`

Functions for generating and managing component styles.

**Key Functions**:
- `generateStyles(styles: ComponentStyles): CSSProperties`
- `getStylePresets(): StylePreset[]`

### componentDefaults
**Location**: `src/lib/componentDefaults.ts`

Default props for all component types.

### dropZoneUtils
**Location**: `src/lib/dropZoneUtils.ts`

Utilities for drag-and-drop zones.

**Key Functions**:
- `shouldRenderDropZone(component: Component): boolean`
- `getDropZoneStyle(isOver: boolean): string`

## Types

### ComponentStyles
**Location**: `src/types/styles.ts`

```typescript
interface ComponentStyles {
  backgroundColor?: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
  padding?: string;
  margin?: string;
  borderRadius?: string;
  border?: string;
  // ... more style properties
}
```

### Component
```typescript
interface Component {
  id: string;
  type: string;
  props: Record<string, any>;
  styles?: ComponentStyles;
  responsiveStyles?: ResponsiveStyles;
  className?: string;
  children?: Component[];
}
```

### ComponentDataBinding
```typescript
interface ComponentDataBinding {
  componentId: string;
  dataSourceId: string;
  tableName: string;
  refreshInterval?: number;
  pagination: {
    enabled: boolean;
    pageSize: number;
    page: number;
  };
  sorting: {
    enabled: boolean;
    column?: string;
    direction?: 'asc' | 'desc';
  };
  filtering: {
    searchEnabled: boolean;
    filters: Record<string, any>;
  };
  columnOverrides: Record<string, ColumnOverride>;
}
```
