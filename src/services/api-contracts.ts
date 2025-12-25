import { z } from 'zod';

/**
 * API Contract Definitions
 * These schemas are the "Source of Truth" for API responses from both Express and FastAPI.
 * By enforcing these on the frontend, we ensure the backend precisely matches the expected format.
 */

// 1. Generic API Response Wrapper
export const ApiResponseSchema = z.object({
    success: z.boolean(),
    data: z.any().optional(),
    error: z.string().optional(),
    message: z.string().optional(),
});

// 2. Database Connection Schema
export const DbConnectionSchema = z.object({
    supabase: z.object({
        connected: z.boolean(),
        url: z.string(),
        hasServiceKey: z.boolean(),
    }),
});

// 3. Database Table Schema
export const TableInfoSchema = z.object({
    name: z.string(),
    schema: z.string().default('public'),
});

export const TablesListSchema = z.object({
    tables: z.array(z.any()), // Can be refined later
});

// 4. Column Schema (Parity with Express + Frontend Compatibility)
export const ColumnSchema = z.object({
    // DB/Express fields
    column_name: z.string(),
    data_type: z.string(),
    is_nullable: z.enum(['YES', 'NO']),
    column_default: z.any().nullable(),
    is_primary: z.boolean(),
    is_foreign: z.boolean(),
    foreign_table: z.string().nullable().optional(),
    foreign_column: z.string().nullable().optional(),

    // Frontend Aliases (Required by useTableColumns etc)
    name: z.string(),
    type: z.string(),
    isForeign: z.boolean().optional(),
    foreignTable: z.string().nullable().optional(),
    foreignColumn: z.string().nullable().optional(),
});

export const TableSchemaResponseSchema = z.object({
    table_name: z.string(),
    columns: z.array(ColumnSchema),
});

// 5. Table Data Query Result
export const TableDataResultSchema = z.object({
    rows: z.array(z.record(z.any())),
    total: z.number().optional(),
    authMethod: z.string().optional(),
    success: z.boolean(),
});

// 6. Page Schemas
export const PageSchema = z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    keywords: z.string().nullable().optional(),
    isPublic: z.boolean().optional(), // Can be missing in some responses
    isHomepage: z.boolean().optional(),
    layoutData: z.record(z.any()).optional().default({}),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable().optional(),
});

export const PageListSchema = z.array(PageSchema);

/**
 * Validation Helper
 */
export const ApiContracts = {
    /**
     * Validates a response and returns the typed data if successful.
     * Throws a descriptive error if validation fails.
     */
    validate: <T>(schema: z.ZodSchema<T>, rawData: any, endpointName: string): T => {
        // First validate the outer wrapper
        const wrappedResult = ApiResponseSchema.safeParse(rawData);
        if (!wrappedResult.success) {
            console.error(`[API Contract Error] Invalid response wrapper at ${endpointName}:`, wrappedResult.error.format());
            throw new Error(`Invalid API response format at ${endpointName}`);
        }

        if (!wrappedResult.data.success) {
            return rawData as T; // If success is false, we just return the original (it has error/message)
        }

        // Then validate the inner data
        const dataToValidate = wrappedResult.data.data !== undefined ? wrappedResult.data.data : wrappedResult.data;
        const result = schema.safeParse(dataToValidate);

        if (!result.success) {
            console.error(`[API Contract Error] Schema mismatch at ${endpointName}:`, result.error.format());
            console.log(`[API Contract Error] Raw data received:`, dataToValidate);
            throw new Error(`API contract validation failed at ${endpointName}`);
        }

        return result.data;
    }
};
