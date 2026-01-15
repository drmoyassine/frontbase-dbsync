import React from 'react';
import { ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import type { ColumnOverride } from '../types';
import { formatHeader } from '../utils/formatHeader';
import { cn } from '../lib/utils';

interface TableHeaderProps {
    columns: string[];
    columnOverrides?: Record<string, ColumnOverride>;
    sortingEnabled?: boolean;
    sortColumn?: string | null;
    sortDirection?: 'asc' | 'desc';
    onSort?: (column: string) => void;
    className?: string;
}

/**
 * Table header component with sortable columns
 */
export function TableHeader({
    columns,
    columnOverrides,
    sortingEnabled = false,
    sortColumn,
    sortDirection,
    onSort,
    className,
}: TableHeaderProps) {
    return (
        <thead className={cn('bg-muted/50', className)}>
            <tr>
                {columns.map((col) => {
                    const override = columnOverrides?.[col];
                    const isSorted = sortColumn === col;

                    return (
                        <th
                            key={col}
                            onClick={() => sortingEnabled && onSort?.(col)}
                            className={cn(
                                'px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap',
                                sortingEnabled && 'cursor-pointer hover:bg-muted/80 select-none'
                            )}
                        >
                            <div className="flex items-center gap-1">
                                <span>{formatHeader(col, override)}</span>
                                {sortingEnabled && (
                                    <>
                                        {isSorted ? (
                                            sortDirection === 'asc' ? (
                                                <ChevronUp className="h-4 w-4" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4" />
                                            )
                                        ) : (
                                            <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50" />
                                        )}
                                    </>
                                )}
                            </div>
                        </th>
                    );
                })}
            </tr>
        </thead>
    );
}
