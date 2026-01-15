import React from 'react';
import type { ColumnOverride } from '../types';
import { getCellValue } from '../utils/getCellValue';
import { renderCell } from '../utils/renderCell';
import { cn } from '../lib/utils';

interface TableBodyProps {
    data: any[];
    columns: string[];
    columnOverrides?: Record<string, ColumnOverride>;
    className?: string;
}

/**
 * Table body component with cell rendering
 */
export function TableBody({
    data,
    columns,
    columnOverrides,
    className,
}: TableBodyProps) {
    if (data.length === 0) {
        return (
            <tbody className={className}>
                <tr>
                    <td
                        colSpan={columns.length}
                        className="px-4 py-8 text-center text-muted-foreground"
                    >
                        No data available
                    </td>
                </tr>
            </tbody>
        );
    }

    return (
        <tbody className={className}>
            {data.map((row, index) => (
                <tr
                    key={row.id || index}
                    className="border-t hover:bg-muted/50"
                >
                    {columns.map((col) => {
                        const override = columnOverrides?.[col];
                        const value = getCellValue(row, col);

                        return (
                            <td key={col} className="px-4 py-3">
                                {renderCell(value, override?.displayType, col)}
                            </td>
                        );
                    })}
                </tr>
            ))}
        </tbody>
    );
}
