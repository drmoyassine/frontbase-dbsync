import React from 'react';
import { DataTable } from '@frontbase/datatable';
import { ColumnSettingsPopover } from '@/components/data-binding/table/ColumnSettingsPopover';
import { RendererProps } from '../types';
import { useResolvedBinding } from './useResolvedBinding';

export const DataTableRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, componentId, onColumnOverrideChange }) => {
    // Shared resolution: prefer props.binding, fall back to the data-binding store.
    const binding = useResolvedBinding(componentId || 'datatable', effectiveProps.binding);

    return (
        <DataTable
            mode="builder"
            componentId={componentId || 'datatable'}
            binding={binding}
            className={combinedClassName}
            style={inlineStyles}
            onColumnOverrideChange={onColumnOverrideChange}
            headerCellWrapper={(columnName, children) => (
                <ColumnSettingsPopover
                    columnName={columnName}
                    columnConfig={binding?.columnOverrides?.[columnName]}
                    onColumnOverrideChange={onColumnOverrideChange!}
                    isBuilderMode={true}
                    isHeader={true}
                >
                    {children}
                </ColumnSettingsPopover>
            )}
        />
    );
};
