/**
 * Publish Contract Schemas (Phase 1)
 * 
 * Zod schemas for the FastAPI → Hono publish contract.
 * These mirror the Pydantic schemas in FastAPI.
 */

import { z } from 'zod';

// =============================================================================
// Component Types
// =============================================================================

export const ComponentTypeSchema = z.enum([
    // Static
    'Text', 'Heading', 'Image', 'Badge', 'Divider', 'Spacer', 'Icon', 'Avatar', 'Label', 'MarkdownContent',
    // Interactive
    'Button', 'Link', 'Tabs', 'Accordion', 'Modal', 'Dropdown', 'Toggle', 'Checkbox', 'Radio',
    // Data-Driven
    'DataTable', 'Form', 'InfoList', 'Chart', 'DataCard', 'Repeater', 'Grid',
    // Layout
    'Container', 'Row', 'Column', 'Section', 'Card', 'Panel'
]);

export type ComponentType = z.infer<typeof ComponentTypeSchema>;

// =============================================================================
// Datasource Configuration
// =============================================================================

export const DatasourceTypeSchema = z.enum([
    'supabase',
    'neon',
    'planetscale',
    'turso',
    'postgres',
    'mysql',
    'sqlite'
]);

export type DatasourceType = z.infer<typeof DatasourceTypeSchema>;

export const DatasourceConfigSchema = z.object({
    id: z.string(),
    type: DatasourceTypeSchema,
    name: z.string(),
    // URL is safe to publish (no password)
    url: z.string().optional(),
    // For Supabase: anon key is safe to publish
    anonKey: z.string().optional(),
    // Secret environment variable name (actual secret NOT published)
    secretEnvVar: z.string().optional(),
});

export type DatasourceConfig = z.infer<typeof DatasourceConfigSchema>;

// =============================================================================
// Component Bindings (for data-driven components)
// =============================================================================

export const ColumnOverrideSchema = z.object({
    visible: z.boolean().nullish(),
    label: z.string().nullish(),
    width: z.string().nullish(),
    sortable: z.boolean().nullish(),
    filterable: z.boolean().nullish(),
    type: z.string().nullish(),
    primaryKey: z.string().nullish(),  // Added for FK reference
});

// Pre-computed HTTP request spec for data fetching (computed at publish time)
export const DataRequestSchema = z.object({
    url: z.string(),  // Full URL with query params (may contain {{ENV_VAR}} placeholders)
    method: z.string().default("GET"),  // HTTP method
    headers: z.record(z.string(), z.string()).default({}),  // Headers
    body: z.record(z.string(), z.unknown()).optional(),  // For POST requests
    resultPath: z.string().default(""),  // JSON path to extract data
    flattenRelations: z.boolean().default(true),  // Flatten nested objects
    queryConfig: z.record(z.string(), z.unknown()).optional(),  // RPC config for DataTable
});

export type DataRequest = z.infer<typeof DataRequestSchema>;

export const ComponentBindingSchema = z.object({
    componentId: z.string(),
    datasourceId: z.string().nullish(),
    tableName: z.string().nullish(),
    columns: z.array(z.string()).nullish(),
    columnOrder: z.array(z.string()).nullish(), // Added for React DataTable support
    columnOverrides: z.record(z.string(), ColumnOverrideSchema).nullish(),
    filters: z.record(z.string(), z.unknown()).nullish(),
    primaryKey: z.string().nullish(),
    foreignKeys: z.array(z.object({
        column: z.string(),
        referencedTable: z.string(),
        referencedColumn: z.string(),
    })).nullish(),
    dataRequest: DataRequestSchema.nullish(),  // Pre-computed HTTP request
    // Dynamic feature configuration (for DataTable server-side features)
    frontendFilters: z.array(z.record(z.string(), z.unknown())).nullish(),
    sorting: z.record(z.string(), z.unknown()).nullish(),
    pagination: z.record(z.string(), z.unknown()).nullish(),
    filtering: z.record(z.string(), z.unknown()).nullish(),
});

export type ComponentBinding = z.infer<typeof ComponentBindingSchema>;

// =============================================================================
// Page Component (Recursive)
// =============================================================================

// Visibility settings for responsive hiding
export const VisibilitySettingsSchema = z.object({
    mobile: z.boolean().default(true),
    tablet: z.boolean().default(true),
    desktop: z.boolean().default(true),
});

export type VisibilitySettings = z.infer<typeof VisibilitySettingsSchema>;

// Viewport-specific style overrides
export const ViewportOverridesSchema = z.object({
    mobile: z.record(z.string(), z.any()).nullable().optional(),
    tablet: z.record(z.string(), z.any()).nullable().optional(),
}).passthrough(); // Allow additional viewport names

export type ViewportOverrides = z.infer<typeof ViewportOverridesSchema>;

// Structured styles data with viewport support
export const StylesDataSchema = z.object({
    values: z.record(z.string(), z.any()).nullable().optional(),
    activeProperties: z.array(z.string()).nullable().optional(),
    stylingMode: z.string().default("visual"),
    viewportOverrides: ViewportOverridesSchema.nullable().optional(),
}).passthrough();

export type StylesData = z.infer<typeof StylesDataSchema>;

// Legacy styles (direct CSS properties)
export const ComponentStylesSchema = z.record(z.string(), z.any()).nullable().optional();

export const PageComponentSchema: z.ZodType<PageComponent, z.ZodTypeDef, unknown> = z.lazy(() =>
    z.object({
        id: z.string(),
        type: z.string(), // ComponentTypeSchema is too strict for flexibility
        props: z.record(z.string(), z.unknown()).nullable().optional(),
        styles: ComponentStylesSchema, // Legacy: direct styles
        stylesData: StylesDataSchema.nullable().optional(), // New: structured styles with overrides
        visibility: VisibilitySettingsSchema.nullable().optional(), // Per-viewport visibility
        children: z.array(PageComponentSchema).nullable().optional(),
        binding: ComponentBindingSchema.nullable().optional(),
    })
);

export interface PageComponent {
    id: string;
    type: string;
    props?: Record<string, unknown> | null;
    styles?: Record<string, any> | null; // Legacy: direct styles
    stylesData?: StylesData | null; // New: structured styles with overrides
    visibility?: VisibilitySettings | null; // Per-viewport visibility
    children?: PageComponent[] | null;
    binding?: ComponentBinding | null;
}

// =============================================================================
// Page Layout
// =============================================================================

export const PageLayoutSchema = z.object({
    content: z.array(PageComponentSchema),
    root: z.record(z.string(), z.unknown()).optional(),
});

export type PageLayout = z.infer<typeof PageLayoutSchema>;

// =============================================================================
// SEO Data
// =============================================================================

export const SeoDataSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    ogImage: z.string().optional(),
    canonical: z.string().optional(),
});

export type SeoData = z.infer<typeof SeoDataSchema>;

// =============================================================================
// Published Page Bundle (Main Schema)
// =============================================================================

export const PublishPageSchema = z.object({
    // Page identity (can be UUID or custom string ID like "default-homepage")
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),

    // Layout & structure
    layoutData: PageLayoutSchema,

    // SEO
    seoData: SeoDataSchema.nullable().optional(),

    // Datasources (non-sensitive config only)
    datasources: z.array(DatasourceConfigSchema).nullable().optional(),

    // CSS Bundle (tree-shaken, component-specific CSS from FastAPI)
    cssBundle: z.string().nullable().optional(),

    // Versioning
    version: z.number().int().min(1),
    publishedAt: z.string().datetime(),

    // Flags
    isPublic: z.boolean().default(true),
    isHomepage: z.boolean().default(false),
});

export type PublishPage = z.infer<typeof PublishPageSchema>;

// =============================================================================
// Import Request/Response
// =============================================================================

export const ImportPageRequestSchema = z.object({
    page: PublishPageSchema,
    // Optional: force overwrite even if version is same
    force: z.boolean().default(false),
});

export type ImportPageRequest = z.infer<typeof ImportPageRequestSchema>;

export const ImportPageResponseSchema = z.object({
    success: z.boolean(),
    slug: z.string(),
    version: z.number(),
    previewUrl: z.string(),
    message: z.string().optional(),
});

export type ImportPageResponse = z.infer<typeof ImportPageResponseSchema>;

// =============================================================================
// Error Response
// =============================================================================

export const ErrorResponseSchema = z.object({
    success: z.literal(false),
    error: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
