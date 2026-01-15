/**
 * DataTable Utility Functions
 */

import React from 'react';
import type { ColumnOverride } from './types';

/**
 * Get cell value - handles both flat RPC results and nested PostgREST results
 */
export function getCellValue(row: Record<string, any>, col: string): any {
    // 1. Direct key match (flat result like RPC with aliased columns)
    if (col in row) {
        return row[col];
    }

    // 2. Nested object (PostgREST embedded result like row.countries.country)
    if (col.includes('.')) {
        const parts = col.split('.');
        let value = row;
        for (const part of parts) {
            if (value == null) return undefined;
            value = value[part];
        }
        if (value !== undefined) return value;

        // 3. Last part only (RPC returns SELECT countries.country as just "country" in result)
        const lastPart = parts[parts.length - 1];
        if (lastPart in row) {
            return row[lastPart];
        }
    }

    return undefined;
}

/**
 * Cell renderer based on displayType
 */
export function renderCell(value: any, displayType?: string, columnKey?: string): React.ReactNode {
    if (value === null || value === undefined) {
        return <span className="text-muted-foreground">—</span>;
    }

    switch (displayType) {
        case 'image':
            return (
                <img
                    src={String(value)}
                    alt=""
                    className="h-10 w-10 object-cover rounded-md"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            );
        case 'link':
            return (
                <a
                    href={String(value)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate max-w-xs block"
                >
                    {String(value)}
                </a>
            );
        case 'badge':
            return (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    {String(value)}
                </span>
            );
        default:
            // Check if it looks like an image URL
            const strValue = String(value);
            if (strValue.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ||
                strValue.includes('supabase.co/storage')) {
                return (
                    <img
                        src={strValue}
                        alt=""
                        className="h-10 w-10 object-cover rounded-md"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                );
            }
            return <span className="truncate max-w-xs block">{strValue}</span>;
    }
}

/**
 * Format column header
 */
export function formatHeader(key: string, override?: ColumnOverride): string {
    // Check for custom label (builder uses 'displayName', alias 'label')
    if (override?.displayName) return override.displayName;
    if (override?.label) return override.label;

    // Auto-format: countries.flag → Countries › Flag
    return key
        .replace(/\./g, ' › ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
