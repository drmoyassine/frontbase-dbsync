/**
 * Zod-Pydantic Contract Validation Script
 * 
 * This script validates that the Zod schemas (Edge) have all required fields
 * that match the Pydantic schemas (FastAPI).
 * 
 * Run: npx tsx scripts/validate-contract.ts
 */

import { z } from 'zod';
import {
    PageComponentSchema,
    VisibilitySettingsSchema,
    ViewportOverridesSchema,
    StylesDataSchema,
    ComponentBindingSchema,
    PublishPageSchema,
    PageLayoutSchema,
} from '../src/schemas/publish.js';

interface ValidationResult {
    schema: string;
    requiredFields: string[];
    actualFields: string[];
    missing: string[];
    passed: boolean;
}

function getZodObjectKeys(schema: z.ZodTypeAny): string[] {
    // Unwrap lazy schemas
    if (schema instanceof z.ZodLazy) {
        return getZodObjectKeys(schema._def.getter());
    }

    // Get keys from object schema
    if (schema instanceof z.ZodObject) {
        return Object.keys(schema.shape);
    }

    return [];
}

function validateSchema(
    name: string,
    schema: z.ZodTypeAny,
    requiredFields: string[]
): ValidationResult {
    const actualFields = getZodObjectKeys(schema);
    const missing = requiredFields.filter(f => !actualFields.includes(f));

    return {
        schema: name,
        requiredFields,
        actualFields,
        missing,
        passed: missing.length === 0,
    };
}

function runValidation(): boolean {
    console.log('🔍 Validating Zod schemas against Pydantic contract...\n');

    const results: ValidationResult[] = [
        validateSchema('PageComponent', PageComponentSchema, [
            'id', 'type', 'props', 'styles', 'stylesData', 'visibility', 'children', 'binding'
        ]),
        validateSchema('VisibilitySettings', VisibilitySettingsSchema, [
            'mobile', 'tablet', 'desktop'
        ]),
        validateSchema('ViewportOverrides', ViewportOverridesSchema, [
            'mobile', 'tablet'
        ]),
        validateSchema('StylesData', StylesDataSchema, [
            'values', 'activeProperties', 'stylingMode', 'viewportOverrides'
        ]),
        validateSchema('ComponentBinding', ComponentBindingSchema, [
            'componentId', 'datasourceId', 'tableName', 'dataRequest'
        ]),
        validateSchema('PublishPage', PublishPageSchema, [
            'id', 'slug', 'name', 'layoutData', 'version', 'publishedAt'
        ]),
        validateSchema('PageLayout', PageLayoutSchema, [
            'content', 'root'
        ]),
    ];

    let allPassed = true;

    for (const result of results) {
        if (result.passed) {
            console.log(`✅ ${result.schema}: All required fields present`);
        } else {
            console.log(`❌ ${result.schema}: Missing fields: ${result.missing.join(', ')}`);
            allPassed = false;
        }
    }

    console.log('');

    if (allPassed) {
        console.log('✅ All Zod schemas match Pydantic contract!');
    } else {
        console.log('❌ Contract validation failed! Please sync Zod schemas with Pydantic.');
    }

    return allPassed;
}

// Generate JSON Schema output for comparison
function generateSchemaSnapshot(): Record<string, any> {
    // Note: zodToJsonSchema would be ideal here, but we use a simplified approach
    return {
        PageComponent: {
            fields: getZodObjectKeys(PageComponentSchema),
        },
        VisibilitySettings: {
            fields: getZodObjectKeys(VisibilitySettingsSchema),
        },
        ViewportOverrides: {
            fields: getZodObjectKeys(ViewportOverridesSchema),
        },
        StylesData: {
            fields: getZodObjectKeys(StylesDataSchema),
        },
        ComponentBinding: {
            fields: getZodObjectKeys(ComponentBindingSchema),
        },
    };
}

// Main
const passed = runValidation();

if (!passed) {
    process.exit(1);
}
