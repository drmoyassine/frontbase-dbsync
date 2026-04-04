/**
 * Edge InfoList Component - React SSR Hydration
 * 
 * Read-only display of a single record as key-value pairs.
 * All field metadata (columns, types, FK info) is baked into the binding
 * at publish time by the FastAPI publish pipeline.
 * Data is fetched via the binding's dataRequest (fetchStrategy routing).
 */

import React, { useState, useEffect, useMemo } from 'react';
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

interface InfoListBinding {
    tableName?: string;
    dataSourceId?: string;
    datasourceId?: string;
    columns?: ColumnSchema[];
    foreignKeys?: any[];
    fieldOverrides?: Record<string, any>;
    fieldOrder?: string[];
    excludeColumns?: string[];
    recordId?: string;
    dataRequest?: any;
}

interface InfoListProps {
    binding?: InfoListBinding;
    tableName?: string;
    recordId?: string;
    title?: string;
    showCard?: boolean;
    className?: string;
    layout?: 'list' | '1' | '2' | '3';
    fieldSpacing?: 'compact' | 'normal' | 'relaxed';
    fieldOverrides?: Record<string, any>;
    columns?: number;
}

/** Format column name to human-readable label */
function columnToLabel(name: string): string {
    return name
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/** Get nested value from record supporting dotted paths */
function getNestedValue(rec: Record<string, any>, columnName: string): any {
    if (!columnName.includes('.')) {
        return rec[columnName];
    }
    // Flattened key format (e.g. "providers.name")
    if (rec[columnName] !== undefined) {
        return rec[columnName];
    }
    // Nested object format
    const parts = columnName.split('.');
    let value: any = rec;
    for (const part of parts) {
        if (value == null) return undefined;
        if (Array.isArray(value)) value = value[0];
        value = value[part];
        // Case-insensitive fallback
        if (value === undefined && typeof value === 'object') {
            const key = Object.keys(value).find(k => k.toLowerCase() === part.toLowerCase());
            if (key) value = value[key];
        }
    }
    return value;
}

/** Format a value for display based on column type */
function formatValue(column: ColumnSchema, value: any, override?: any): React.ReactNode {
    if (value === null || value === undefined) {
        return <span className="text-muted-foreground italic">—</span>;
    }

    const type = override?.type || (typeof column.type === 'string' ? column.type : (column.type?.[0] || '')).toLowerCase();

    // Boolean display
    if (type.includes('bool') || type === 'tinyint(1)') {
        return (
            <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                value ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
            )}>
                {value ? 'Yes' : 'No'}
            </span>
        );
    }

    // Date/datetime formatting
    if (type.includes('date') || type.includes('timestamp')) {
        try {
            const d = new Date(value);
            if (!isNaN(d.getTime())) {
                return type === 'date'
                    ? d.toLocaleDateString()
                    : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        } catch { /* fall through */ }
    }

    // Long text truncation
    const str = String(value);
    if (str.length > 200) {
        return <span title={str}>{str.slice(0, 200)}…</span>;
    }

    return str;
}

export function InfoList({
    binding,
    tableName: propTableName,
    recordId: propRecordId,
    title,
    showCard = true,
    className,
    layout = '2',
    fieldSpacing = 'normal',
    fieldOverrides: propOverrides,
    columns: propColumns,
}: InfoListProps) {
    const tableName = binding?.tableName || propTableName || '';
    const recordId = binding?.recordId || propRecordId || '';
    const fieldOverrides = binding?.fieldOverrides || propOverrides || {};
    const rawColumns = binding?.columns || [];
    const dataRequest = binding?.dataRequest;

    const [record, setRecord] = useState<Record<string, any> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Grid columns from layout or explicit prop
    const gridColumns = propColumns || (layout === 'list' || layout === '1' ? 1 : layout === '3' ? 3 : 2);

    // Spacing classes
    const spacingClass = fieldSpacing === 'compact' ? 'py-1.5' : fieldSpacing === 'relaxed' ? 'py-3' : 'py-2';

    // Derive visible columns (skip PKs and hidden fields)
    const visibleColumns = useMemo(() => {
        let cols = [...rawColumns];

        // Sort by fieldOrder if configured
        const fieldOrder = binding?.fieldOrder || [];
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

        // Filter out hidden fields and PKs 
        cols = cols.filter(c =>
            !c.primary_key &&
            !fieldOverrides[c.name]?.hidden
        );

        // Exclude columns
        const excludes = binding?.excludeColumns || [];
        if (excludes.length > 0) {
            const excludeSet = new Set(excludes);
            cols = cols.filter(c => !excludeSet.has(c.name));
        }

        return cols;
    }, [rawColumns, binding?.fieldOrder, fieldOverrides, binding?.excludeColumns]);

    // Fetch record data using binding's dataRequest
    useEffect(() => {
        if (!tableName || !recordId) {
            setLoading(false);
            return;
        }

        const fetchRecord = async () => {
            setLoading(true);
            setError(null);

            try {
                if (dataRequest && (dataRequest.url || dataRequest.fetchStrategy === 'proxy')) {
                    // Use pre-baked dataRequest (fetchStrategy routing)
                    if (dataRequest.fetchStrategy === 'proxy') {
                        // Proxy: send full dataRequest to edge /api/data/execute
                        const res = await fetch('/api/data/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                ...dataRequest,
                                body: {
                                    ...dataRequest.body,
                                    query: `SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1`,
                                    params: [recordId],
                                },
                            }),
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const result = await res.json();
                        const rows = result.rows || result.data || [];
                        setRecord(rows[0] || null);
                    } else {
                        // Direct: use the pre-baked URL (e.g., Supabase PostgREST)
                        const res = await fetch(dataRequest.url, {
                            method: dataRequest.method || 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(dataRequest.headers || {}),
                            },
                            body: JSON.stringify({
                                ...dataRequest.body,
                                filters: [{ column: 'id', filterType: 'equal', value: recordId }],
                                page_size: 1,
                            }),
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const result = await res.json();
                        const rows = result.rows || result.data || [];
                        setRecord(rows[0] || null);
                    }
                } else {
                    // Fallback: use edge data API (only works locally / with auth)
                    const res = await fetch(`/api/data/${tableName}/${recordId}`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const result = await res.json();
                    setRecord(result.data || result || null);
                }
            } catch (err) {
                console.error('[InfoList] Failed to fetch record:', err);
                setError(err instanceof Error ? err.message : 'Failed to load record');
            } finally {
                setLoading(false);
            }
        };

        fetchRecord();
    }, [tableName, recordId, dataRequest]);

    // No columns baked — show helpful message
    if (rawColumns.length === 0 && !loading) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm p-6", className)}>
                <p className="text-sm text-muted-foreground">
                    {tableName
                        ? `No schema available for "${tableName}". Try re-publishing the page.`
                        : 'Select a table and record to display.'
                    }
                </p>
            </div>
        );
    }

    // Loading / skeleton
    if (loading) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm p-6", className)}>
                {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
                <div className="space-y-3 animate-pulse" style={{ display: 'grid', gridTemplateColumns: `repeat(${gridColumns}, 1fr)`, gap: '0 2rem' }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={spacingClass} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                            <div className="h-3 bg-muted rounded w-20 mb-1.5"></div>
                            <div className="h-4 bg-muted rounded w-32"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm p-6", className)}>
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    Failed to load record: {error}
                </div>
            </div>
        );
    }

    // Render record fields
    const content = (
        <div
            style={{ display: 'grid', gridTemplateColumns: `repeat(${gridColumns}, 1fr)`, gap: '0 2rem' }}
        >
            {visibleColumns.map(column => {
                const override = fieldOverrides[column.name] || {};
                const label = override.label || columnToLabel(column.name);
                const value = record ? getNestedValue(record, column.name) : undefined;

                return (
                    <div
                        key={column.name}
                        className={cn(spacingClass, "border-b")}
                        style={{ borderColor: 'hsl(var(--border))' }}
                    >
                        <dt className="text-sm text-muted-foreground mb-0.5">{label}</dt>
                        <dd className="text-sm font-medium">{formatValue(column, value, override)}</dd>
                    </div>
                );
            })}
        </div>
    );

    if (showCard) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}>
                {title && (
                    <div className="flex flex-col space-y-1.5 p-6 pb-4">
                        <h3 className="text-lg font-semibold leading-none tracking-tight">{title}</h3>
                    </div>
                )}
                <div className="p-6 pt-0">
                    {content}
                </div>
            </div>
        );
    }

    return <div className={className}>{content}</div>;
}

export default InfoList;
