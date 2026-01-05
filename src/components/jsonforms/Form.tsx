/**
 * Form Smart Block - Schema-driven form for create/edit operations.
 * 
 * Fetches schema from existing /schema endpoint and converts to JSON Forms format.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { JsonForms } from '@jsonforms/react';
import { shadcnRenderers } from './renderers';
import { schemaToJsonSchema, JsonFormsSchema } from '@/lib/schemaToJsonSchema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ColumnSchema, TableSchema } from '@/types/schema';
import { FormInteractionProvider } from './FormInteractionContext';

export interface FormProps {
    /** Datasource ID for external databases */
    dataSourceId?: string;
    /** Table name to generate form for */
    tableName?: string;
    /** Record ID for edit mode. If not provided, creates new record */
    recordId?: string;
    /** Callback when form is submitted successfully */
    onSubmit?: (data: Record<string, any>) => void;
    /** Callback when form is cancelled */
    onCancel?: () => void;
    /** Title override */
    title?: string;
    /** Columns to exclude from form */
    excludeColumns?: string[];
    /** Columns to mark as read-only */
    readOnlyColumns?: string[];
    /** Show card wrapper */
    showCard?: boolean;
    /** Class name for container */
    className?: string;
    /** Inline styles */
    style?: React.CSSProperties;
    fieldOverrides?: Record<string, any>;
    /** Field order overrides */
    fieldOrder?: string[];
    /** Builder mode - enables inline field settings popover */
    isBuilderMode?: boolean;
    /** Callback when field overrides change (for builder mode) */
    onFieldOverrideChange?: (fieldName: string, updates: any) => void;
}

export const Form: React.FC<FormProps> = ({
    dataSourceId,
    tableName,
    recordId,
    onSubmit,
    onCancel,
    title,
    excludeColumns = [],
    readOnlyColumns = [],
    showCard = true,
    className,
    style,
    fieldOverrides = {},
    fieldOrder = [],
    isBuilderMode = false,
    onFieldOverrideChange,
}) => {
    const { toast } = useToast();
    const [schema, setSchema] = useState<JsonFormsSchema | null>(null);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<any[]>([]);

    const isEditMode = !!recordId;

    // Serialize array deps to prevent infinite loops from default [] values
    const excludeColumnsKey = JSON.stringify(excludeColumns);

    const readOnlyColumnsKey = JSON.stringify(readOnlyColumns);
    const fieldOverridesKey = JSON.stringify(fieldOverrides);
    const fieldOrderKey = JSON.stringify(fieldOrder);

    // Fetch schema from backend
    useEffect(() => {
        if (!tableName) {
            setLoading(false);
            return;
        }

        const fetchSchema = async () => {
            setLoading(true);
            try {
                const endpoint = dataSourceId && dataSourceId !== 'backend'
                    ? `/api/sync/datasources/${dataSourceId}/tables/${tableName}/schema`
                    : `/api/database/tables/${tableName}/schema`;

                const response = await fetch(endpoint);
                if (!response.ok) throw new Error('Failed to fetch schema');

                const tableSchema: TableSchema = await response.json();

                // Sort columns if fieldOrder is present
                let columns = [...tableSchema.columns];
                if (fieldOrder.length > 0) {
                    const colMap = new Map(columns.map(c => [c.name, c]));
                    const sorted: ColumnSchema[] = [];
                    const seen = new Set<string>();

                    // 1. Add ordered columns
                    for (const name of fieldOrder) {
                        if (colMap.has(name)) {
                            sorted.push(colMap.get(name)!);
                            seen.add(name);
                        }
                    }

                    // 2. Add remaining columns that weren't in the order list
                    for (const c of columns) {
                        if (!seen.has(c.name)) {
                            sorted.push(c);
                        }
                    }
                    columns = sorted;
                }

                // Convert to JSON Forms schema
                const jsonFormsSchema = schemaToJsonSchema(columns, {
                    excludeColumns,
                    readOnlyColumns: isEditMode ? readOnlyColumns : [],
                    fieldOverrides,
                });

                // Inject dataSourceId into uischema options for dropdown/multiselect renderers
                jsonFormsSchema.uiSchema.elements = jsonFormsSchema.uiSchema.elements.map((el: any) => ({
                    ...el,
                    options: { ...el.options, dataSourceId }
                }));

                setSchema(jsonFormsSchema);
            } catch (error) {
                console.error('Failed to fetch schema:', error);
                toast({
                    title: 'Error',
                    description: 'Failed to load form schema',
                    variant: 'destructive',
                });
            } finally {
                setLoading(false);
            }
        };

        fetchSchema();
    }, [tableName, dataSourceId, excludeColumnsKey, readOnlyColumnsKey, fieldOverridesKey, fieldOrderKey, isEditMode]);

    // Fetch existing record data for edit mode
    useEffect(() => {
        if (!isEditMode || !tableName || !schema) return;

        const fetchRecord = async () => {
            try {
                const endpoint = dataSourceId && dataSourceId !== 'backend'
                    ? `/api/sync/datasources/${dataSourceId}/tables/${tableName}/data?filters=${encodeURIComponent(JSON.stringify([{ field: 'id', operator: '==', value: recordId }]))}&limit=1`
                    : `/api/database/tables/${tableName}/data?filters=${encodeURIComponent(JSON.stringify([{ field: 'id', operator: '==', value: recordId }]))}&limit=1`;

                const response = await fetch(endpoint);
                if (!response.ok) throw new Error('Failed to fetch record');

                const result = await response.json();
                const record = result.records?.[0] || result.rows?.[0];

                if (record) {
                    setFormData(record);
                }
            } catch (error) {
                console.error('Failed to fetch record:', error);
                toast({
                    title: 'Error',
                    description: 'Failed to load record data',
                    variant: 'destructive',
                });
            }
        };

        fetchRecord();
    }, [isEditMode, tableName, dataSourceId, recordId, schema]);

    // Handle form submission
    const handleSubmit = async () => {
        if (errors.length > 0) {
            toast({
                title: 'Validation Error',
                description: 'Please fix the form errors before submitting',
                variant: 'destructive',
            });
            return;
        }

        setSubmitting(true);
        try {
            const endpoint = dataSourceId && dataSourceId !== 'backend'
                ? isEditMode
                    ? `/api/sync/datasources/${dataSourceId}/tables/${tableName}/records/${recordId}`
                    : `/api/sync/datasources/${dataSourceId}/tables/${tableName}/records`
                : isEditMode
                    ? `/api/database/tables/${tableName}/records/${recordId}`
                    : `/api/database/tables/${tableName}/records`;

            const response = await fetch(endpoint, {
                method: isEditMode ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: formData }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to save record');
            }

            toast({
                title: 'Success',
                description: isEditMode ? 'Record updated successfully' : 'Record created successfully',
            });

            onSubmit?.(formData);
        } catch (error) {
            console.error('Failed to save record:', error);
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to save record',
                variant: 'destructive',
            });
        } finally {
            setSubmitting(false);
        }
    };

    // Form title
    const formTitle = title || (isEditMode ? `Edit ${tableName}` : `New ${tableName}`);

    // Render loading state
    if (loading) {
        return (
            <div className={`flex items-center justify-center p-8 ${className}`}>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Render placeholder if no table selected
    if (!tableName || !schema) {
        return (
            <div className={`flex items-center justify-center p-8 text-muted-foreground ${className}`}>
                Select a table to generate form
            </div>
        );
    }

    const formContent = (
        <FormInteractionProvider
            onFieldClick={fieldOverrides?.onFieldClick}
            isBuilderMode={isBuilderMode}
            fieldOverrides={fieldOverrides}
            onFieldOverrideChange={onFieldOverrideChange}
        >
            <JsonForms
                schema={schema.schema}
                uischema={schema.uiSchema}
                data={formData}
                renderers={shadcnRenderers}
                cells={[]}
                onChange={({ data, errors }) => {
                    setFormData(data || {});
                    setErrors(errors || []);
                }}
            />

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
                {onCancel && (
                    <Button variant="outline" onClick={onCancel} disabled={submitting}>
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                    </Button>
                )}
                <Button onClick={handleSubmit} disabled={submitting}>
                    {submitting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="mr-2 h-4 w-4" />
                    )}
                    {isEditMode ? 'Update' : 'Create'}
                </Button>
            </div>
        </FormInteractionProvider>
    );

    if (showCard) {
        return (
            <Card className={className} style={style}>
                <CardHeader>
                    <CardTitle>{formTitle}</CardTitle>
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return <div className={className} style={style}>{formContent}</div>;
};

export default Form;
