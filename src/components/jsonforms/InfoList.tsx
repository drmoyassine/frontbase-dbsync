/**
 * InfoList Smart Block - Read-only display of a record as key-value pairs.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { columnToLabel } from '@/lib/schemaToJsonSchema';
import type { ColumnSchema, TableSchema } from '@/types/schema';
import { format, parseISO } from 'date-fns';
import { FieldSettingsPopover } from '@/components/builder/form/FieldSettingsPopover';

export interface InfoListProps {
    /** Datasource ID for external databases */
    dataSourceId?: string;
    /** Table name */
    tableName?: string;
    /** Record ID to display */
    recordId?: string;
    /** Title override */
    title?: string;
    /** Columns to exclude from display */
    excludeColumns?: string[];
    /** Show card wrapper */
    showCard?: boolean;
    /** Class name for container */
    className?: string;
    /** Inline styles */
    style?: React.CSSProperties;
    /** Field overrides for visibility, label, rendering, etc. */
    fieldOverrides?: Record<string, any>;
    /** Builder mode - enables inline field settings popover */
    isBuilderMode?: boolean;
    /** Callback when field overrides change (for builder mode) */
    onFieldOverrideChange?: (fieldName: string, updates: any) => void;
    /** Layout - controls number of columns: 'list' | '1' | '2' | '3' */
    layout?: 'list' | '1' | '2' | '3';
    /** Field spacing for list layout: 'compact' | 'normal' | 'relaxed' */
    fieldSpacing?: 'compact' | 'normal' | 'relaxed';
}

export const InfoList: React.FC<InfoListProps> = ({
    dataSourceId,
    tableName,
    recordId,
    title,
    excludeColumns = [],
    showCard = true,
    className,
    style,
    fieldOverrides = {},
    isBuilderMode = false,
    onFieldOverrideChange,
    layout = '2',
    fieldSpacing = 'normal'
}) => {
    const [schema, setSchema] = useState<ColumnSchema[]>([]);
    const [record, setRecord] = useState<Record<string, any> | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch schema and record
    useEffect(() => {
        if (!tableName || !recordId) {
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch schema
                const schemaEndpoint = dataSourceId && dataSourceId !== 'backend'
                    ? `/api/sync/datasources/${dataSourceId}/tables/${tableName}/schema`
                    : `/api/database/tables/${tableName}/schema`;

                const schemaResponse = await fetch(schemaEndpoint);
                if (!schemaResponse.ok) throw new Error('Failed to fetch schema');
                const tableSchema: TableSchema = await schemaResponse.json();
                setSchema(tableSchema.columns);

                // Fetch record
                const dataEndpoint = dataSourceId && dataSourceId !== 'backend'
                    ? `/api/sync/datasources/${dataSourceId}/tables/${tableName}/data?filters=${encodeURIComponent(JSON.stringify([{ field: 'id', operator: '==', value: recordId }]))}&limit=1`
                    : `/api/database/tables/${tableName}/data?filters=${encodeURIComponent(JSON.stringify([{ field: 'id', operator: '==', value: recordId }]))}&limit=1`;

                const dataResponse = await fetch(dataEndpoint);
                if (!dataResponse.ok) throw new Error('Failed to fetch record');

                const result = await dataResponse.json();
                const rec = result.records?.[0] || result.rows?.[0];
                setRecord(rec || null);
            } catch (error) {
                console.error('Failed to fetch data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [tableName, recordId, dataSourceId]);

    // Format value based on column type
    const formatValue = (column: ColumnSchema, value: any): React.ReactNode => {
        if (value === null || value === undefined) {
            return <span className="text-muted-foreground italic">—</span>;
        }

        // Check override type or fallback to column type
        const override = fieldOverrides[column.name] || {};
        const type = override.type || (typeof column.type === 'string' ? column.type : column.type[0] || '').toLowerCase();

        // Image
        if (type === 'image') {
            return (
                <img
                    src={value}
                    alt={column.name}
                    className="object-cover rounded-md border"
                    style={{
                        width: override.width || '100px',
                        height: override.height || 'auto'
                    }}
                />
            );
        }

        // Badge(s) - auto-detect single or array, with colorful variants
        if (type === 'badge') {
            const badgeColors = [
                'bg-blue-100 text-blue-800 border-blue-200',
                'bg-green-100 text-green-800 border-green-200',
                'bg-purple-100 text-purple-800 border-purple-200',
                'bg-orange-100 text-orange-800 border-orange-200',
                'bg-pink-100 text-pink-800 border-pink-200',
                'bg-cyan-100 text-cyan-800 border-cyan-200',
                'bg-yellow-100 text-yellow-800 border-yellow-200',
                'bg-red-100 text-red-800 border-red-200',
            ];

            // Hash function for consistent color assignment
            const getColorIndex = (str: string) => {
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    hash = str.charCodeAt(i) + ((hash << 5) - hash);
                }
                return Math.abs(hash) % badgeColors.length;
            };

            // Handle array values
            if (Array.isArray(value)) {
                return (
                    <div className="flex flex-wrap gap-1">
                        {value.map((item, i) => (
                            <Badge
                                key={i}
                                variant="outline"
                                className={badgeColors[getColorIndex(String(item))]}
                            >
                                {String(item)}
                            </Badge>
                        ))}
                    </div>
                );
            }

            // Handle comma-separated string values
            if (typeof value === 'string' && value.includes(',')) {
                const items = value.split(',').map(s => s.trim()).filter(Boolean);
                return (
                    <div className="flex flex-wrap gap-1">
                        {items.map((item, i) => (
                            <Badge
                                key={i}
                                variant="outline"
                                className={badgeColors[getColorIndex(item)]}
                            >
                                {item}
                            </Badge>
                        ))}
                    </div>
                );
            }

            // Single value
            return (
                <Badge variant="outline" className={badgeColors[getColorIndex(String(value))]}>
                    {String(value)}
                </Badge>
            );
        }

        // Link
        if (type === 'link') {
            return (
                <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    {value}
                </a>
            );
        }

        const sqlType = type.toLowerCase();

        // Boolean
        if (sqlType.includes('bool')) {
            return (
                <Badge variant={value ? 'default' : 'secondary'}>
                    {value ? 'Yes' : 'No'}
                </Badge>
            );
        }

        // Date
        if (sqlType === 'date') {
            try {
                return format(parseISO(value), 'PPP');
            } catch {
                return String(value);
            }
        }

        // DateTime
        if (sqlType.includes('datetime') || sqlType.includes('timestamp')) {
            try {
                return format(parseISO(value), 'PPP p');
            } catch {
                return String(value);
            }
        }

        // JSON array
        if (Array.isArray(value)) {
            return (
                <div className="flex flex-wrap gap-1">
                    {value.map((item, i) => (
                        <Badge key={i} variant="outline">{String(item)}</Badge>
                    ))}
                </div>
            );
        }

        // JSON object
        if (typeof value === 'object') {
            return <pre className="text-xs bg-muted p-2 rounded">{JSON.stringify(value, null, 2)}</pre>;
        }

        // Email link
        const name = column.name.toLowerCase();
        if (name.includes('email')) {
            return <a href={`mailto:${value}`} className="text-primary underline">{value}</a>;
        }

        // Phone link
        if (name.includes('phone') || name.includes('mobile')) {
            return <a href={`tel:${value}`} className="text-primary underline">{value}</a>;
        }

        // URL link
        if (name.includes('url') || name.includes('website') || name.includes('link')) {
            return <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary underline">{value}</a>;
        }

        return String(value);
    };

    // Render loading state
    if (loading) {
        return (
            <div className={`flex items-center justify-center p-8 ${className}`}>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Render placeholder
    if (!tableName || !recordId) {
        return (
            <div className={`flex items-center justify-center p-8 text-muted-foreground ${className}`}>
                Select a table and record to display
            </div>
        );
    }

    if (!record) {
        return (
            <div className={`flex items-center justify-center p-8 text-muted-foreground ${className}`}>
                Record not found
            </div>
        );
    }

    const displayTitle = title || `${tableName} Details`;
    const excludeSet = new Set(excludeColumns);

    // Spacing classes for list layout
    const spacingClasses = {
        'compact': 'gap-x-4 gap-y-1',
        'normal': 'gap-x-6 gap-y-2',
        'relaxed': 'gap-x-10 gap-y-3',
    };

    // Grid classes based on layout
    const gridClasses = {
        'list': `flex flex-wrap items-baseline ${spacingClasses[fieldSpacing] || spacingClasses['normal']}`,
        '1': 'grid grid-cols-1 gap-4',
        '2': 'grid grid-cols-1 gap-4 sm:grid-cols-2',
        '3': 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3',
    };

    const content = (
        <dl className={gridClasses[layout] || gridClasses['2']}>
            {schema
                .filter(col => !excludeSet.has(col.name) && fieldOverrides[col.name]?.hidden !== true)
                .map(column => {
                    const isListLayout = layout === 'list';
                    const fieldContent = (
                        <div key={column.name} className={isListLayout ? 'flex items-baseline gap-1.5' : 'space-y-1'}>
                            <dt className={`text-sm font-medium text-muted-foreground ${isListLayout ? '' : ''}`}>
                                {fieldOverrides[column.name]?.label || columnToLabel(column.name)}{isListLayout ? ':' : ''}
                            </dt>
                            <dd className="text-sm">
                                {formatValue(column, record[column.name])}
                            </dd>
                        </div>
                    );

                    // Wrap with popover in builder mode
                    if (isBuilderMode && onFieldOverrideChange) {
                        return (
                            <FieldSettingsPopover
                                key={column.name}
                                fieldName={column.name}
                                settings={fieldOverrides[column.name] || {}}
                                onSave={(updates) => onFieldOverrideChange(column.name, updates)}
                                componentType="InfoList"
                                isBuilderMode={true}
                            >
                                {fieldContent}
                            </FieldSettingsPopover>
                        );
                    }

                    return fieldContent;
                })}
        </dl>
    );

    if (showCard) {
        return (
            <Card className={className} style={style}>
                <CardHeader>
                    <CardTitle>{displayTitle}</CardTitle>
                </CardHeader>
                <CardContent>{content}</CardContent>
            </Card>
        );
    }

    return <div className={className} style={style}>{content}</div>;
};

export default InfoList;
