/**
 * shadcn-based JSON Forms Renderers
 * 
 * Custom renderer set using shadcn/ui components for JSON Forms.
 * Updated at: 2026-01-05
 */

import { rankWith, isStringControl, isBooleanControl, isIntegerControl, isNumberControl, isDateControl, isDateTimeControl, optionIs, and, schemaMatches, uiTypeIs, scopeEndsWith } from '@jsonforms/core';
import type { JsonFormsRendererRegistryEntry } from '@jsonforms/core';

// Import all renderers
import { TextRenderer, textRendererTester } from '@/components/jsonforms/renderers/TextRenderer';
import { TextareaRenderer, textareaRendererTester } from '@/components/jsonforms/renderers/TextareaRenderer';
import { NumberRenderer, numberRendererTester } from '@/components/jsonforms/renderers/NumberRenderer';
import { BooleanRenderer, booleanRendererTester } from '@/components/jsonforms/renderers/BooleanRenderer';
import { DateRenderer, dateRendererTester } from '@/components/jsonforms/renderers/DateRenderer';
import { EmailRenderer, emailRendererTester } from '@/components/jsonforms/renderers/EmailRenderer';
import { PhoneRenderer, phoneRendererTester } from '@/components/jsonforms/renderers/PhoneRenderer';
import { DropdownRenderer, dropdownRendererTester } from '@/components/jsonforms/renderers/DropdownRenderer';
import { MultiselectRenderer, multiselectRendererTester } from '@/components/jsonforms/renderers/MultiselectRenderer';
import { VerticalLayoutRenderer, verticalLayoutTester } from '@/components/jsonforms/renderers/layouts/VerticalLayout';

/**
 * Complete set of shadcn renderers for JSON Forms.
 * Higher priority numbers take precedence.
 */
export const shadcnRenderers: JsonFormsRendererRegistryEntry[] = [
    // Layout renderers
    { tester: verticalLayoutTester, renderer: VerticalLayoutRenderer },

    // Special field renderers (higher priority - checked first)
    { tester: emailRendererTester, renderer: EmailRenderer },          // Priority 5
    { tester: phoneRendererTester, renderer: PhoneRenderer },          // Priority 5
    { tester: dropdownRendererTester, renderer: DropdownRenderer },    // Priority 5
    { tester: multiselectRendererTester, renderer: MultiselectRenderer }, // Priority 5
    { tester: textareaRendererTester, renderer: TextareaRenderer },    // Priority 4

    // Standard type renderers (lower priority - fallback)
    { tester: dateRendererTester, renderer: DateRenderer },            // Priority 3
    { tester: booleanRendererTester, renderer: BooleanRenderer },      // Priority 2
    { tester: numberRendererTester, renderer: NumberRenderer },        // Priority 2
    { tester: textRendererTester, renderer: TextRenderer },            // Priority 1 (default for strings)
];

// Re-export individual renderers for custom use
export {
    TextRenderer,
    TextareaRenderer,
    NumberRenderer,
    BooleanRenderer,
    DateRenderer,
    EmailRenderer,
    PhoneRenderer,
    DropdownRenderer,
    MultiselectRenderer,
    VerticalLayoutRenderer,
};
