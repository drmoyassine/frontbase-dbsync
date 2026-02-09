/**
 * Edge Form Component - React SSR Hydration
 * 
 * Binding-driven form component for the edge runtime.
 * All field metadata (columns, types, FK info) is baked into the binding
 * at publish time by the FastAPI publish pipeline.
 * No runtime schema fetches needed — fully self-sufficient.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '../../lib/utils';

interface ColumnSchema {
    name: string;
    type: string | string[];
    nullable: boolean;
    primary_key: boolean;
    default?: any;
    is_foreign?: boolean;
    foreign_table?: string;
    foreign_column?: string;
}

interface FormBinding {
    tableName?: string;
    dataSourceId?: string;
    datasourceId?: string;
    columns?: ColumnSchema[];
    foreignKeys?: any[];
    fieldOverrides?: Record<string, any>;
    fieldOrder?: string[];
    excludeColumns?: string[];
    dataRequest?: any;
}

interface FormProps {
    binding?: FormBinding;
    tableName?: string;
    dataSourceId?: string;
    fieldOverrides?: Record<string, any>;
    fieldOrder?: string[];
    title?: string;
    showCard?: boolean;
    className?: string;
}

/** Detect field input type from column metadata and overrides */
function detectFieldType(column: ColumnSchema, override?: any): string {
    if (override?.type) {
        switch (override.type) {
            case 'textarea': return 'textarea';
            case 'number': return 'number';
            case 'boolean':
            case 'checkbox': return 'checkbox';
            case 'date': return 'date';
            case 'datetime': return 'datetime-local';
            case 'email': return 'email';
            case 'phone': return 'tel';
            case 'select':
            case 'dropdown': return 'select';
            case 'image': return 'url';
        }
    }

    // Auto-detect from column metadata
    const name = column.name.toLowerCase();
    const sqlType = (typeof column.type === 'string' ? column.type : (column.type?.[0] || '')).toLowerCase();

    if (name.includes('email')) return 'email';
    if (name.includes('phone') || name.includes('mobile')) return 'tel';
    if (column.is_foreign && column.foreign_table) return 'select';
    if (sqlType.includes('bool') || sqlType === 'tinyint(1)') return 'checkbox';
    if (sqlType.includes('int') || sqlType === 'serial' || sqlType === 'bigserial') return 'number';
    if (sqlType.includes('decimal') || sqlType.includes('numeric') || sqlType.includes('float') || sqlType.includes('double')) return 'number';
    if (sqlType === 'date') return 'date';
    if (sqlType.includes('datetime') || sqlType.includes('timestamp')) return 'datetime-local';

    const textareaNames = ['description', 'notes', 'content', 'body', 'bio', 'summary', 'comment', 'message'];
    if (textareaNames.some(n => name.includes(n))) return 'textarea';

    return 'text';
}

/** Format column name to human-readable label */
function columnToLabel(name: string): string {
    return name
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
}

export function Form({ binding, tableName: propTableName, dataSourceId: propDsId, fieldOverrides: propOverrides, fieldOrder: propOrder, title, showCard = true, className }: FormProps) {
    const tableName = binding?.tableName || propTableName || '';
    const fieldOverrides = binding?.fieldOverrides || propOverrides || {};
    const fieldOrder = binding?.fieldOrder || propOrder || [];
    const rawColumns = binding?.columns || [];

    const [formData, setFormData] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Derive visible, ordered columns from binding data (all computed at render, no fetches)
    const columns = useMemo(() => {
        let cols = [...rawColumns];

        // Sort by fieldOrder if configured
        if (fieldOrder.length > 0) {
            const colMap = new Map(cols.map(c => [c.name, c]));
            const sorted: ColumnSchema[] = [];
            const seen = new Set<string>();
            for (const name of fieldOrder) {
                if (colMap.has(name)) { sorted.push(colMap.get(name)!); seen.add(name); }
            }
            for (const c of cols) { if (!seen.has(c.name)) sorted.push(c); }
            cols = sorted;
        }

        // Filter out hidden and excluded fields
        cols = cols.filter(c =>
            !c.primary_key &&
            !fieldOverrides[c.name]?.hidden
        );

        return cols;
    }, [rawColumns, fieldOrder, fieldOverrides]);

    // Handle submit via edge /api/data/execute proxy
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        setSubmitting(true);
        setError(null);
        setSuccess(false);

        try {
            // Use the edge data API for insert
            const res = await fetch(`/api/data/${tableName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                throw new Error(err.error || err.detail || 'Failed to create record');
            }

            setSuccess(true);
            setFormData({});
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save record');
        } finally {
            setSubmitting(false);
        }
    };

    // No columns baked in — show helpful message
    if (rawColumns.length === 0) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm p-6", className)}>
                <p className="text-sm text-muted-foreground">
                    {tableName
                        ? `No schema available for "${tableName}". Try re-publishing the page.`
                        : 'Select a table to generate form.'
                    }
                </p>
            </div>
        );
    }

    const formTitle = title || `New ${tableName}`;

    const formContent = (
        <form onSubmit={handleSubmit} className="space-y-4">
            {columns.map(column => {
                const override = fieldOverrides[column.name] || {};
                const inputType = detectFieldType(column, override);
                const label = override.label || columnToLabel(column.name);
                const isRequired = override.validation?.required !== undefined
                    ? override.validation.required
                    : (!column.nullable && !column.primary_key);

                return (
                    <div key={column.name} className="space-y-1.5">
                        <label
                            htmlFor={`field-${column.name}`}
                            className="text-sm font-medium leading-none"
                        >
                            {label}
                            {isRequired && <span className="text-red-500 ml-0.5">*</span>}
                        </label>

                        {inputType === 'textarea' ? (
                            <textarea
                                id={`field-${column.name}`}
                                value={formData[column.name] || ''}
                                onChange={e => setFormData(prev => ({ ...prev, [column.name]: e.target.value }))}
                                required={isRequired}
                                rows={4}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                        ) : inputType === 'checkbox' ? (
                            <div className="flex items-center gap-2">
                                <input
                                    id={`field-${column.name}`}
                                    type="checkbox"
                                    checked={!!formData[column.name]}
                                    onChange={e => setFormData(prev => ({ ...prev, [column.name]: e.target.checked }))}
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                            </div>
                        ) : inputType === 'select' ? (
                            <select
                                id={`field-${column.name}`}
                                value={formData[column.name] || ''}
                                onChange={e => setFormData(prev => ({ ...prev, [column.name]: e.target.value }))}
                                required={isRequired}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                                <option value="">Select...</option>
                                {/* Static options from override, or FK display */}
                                {override.options?.map((opt: string, i: number) => (
                                    <option key={i} value={opt}>{opt}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                id={`field-${column.name}`}
                                type={inputType}
                                value={formData[column.name] || ''}
                                onChange={e => setFormData(prev => ({
                                    ...prev,
                                    [column.name]: inputType === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value
                                }))}
                                required={isRequired}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                        )}
                    </div>
                );
            })}

            {/* Status messages */}
            {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}
            {success && (
                <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                    Record created successfully!
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {submitting ? (
                        <svg className="mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                    )}
                    Create
                </button>
            </div>
        </form>
    );

    if (showCard) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}>
                <div className="flex flex-col space-y-1.5 p-6 pb-4">
                    <h3 className="text-lg font-semibold leading-none tracking-tight">{formTitle}</h3>
                </div>
                <div className="p-6 pt-0">
                    {formContent}
                </div>
            </div>
        );
    }

    return <div className={className}>{formContent}</div>;
}

export default Form;
