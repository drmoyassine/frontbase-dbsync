import React from 'react';
import { DataTable } from '@frontbase/datatable';
import { ColumnSettingsPopover } from '@/components/data-binding/table/ColumnSettingsPopover';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { RendererProps } from '../types';

export const DataTableRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, componentId, onColumnOverrideChange }) => {
    // Get binding from store as fallback if effectiveProps.binding doesn't have it
    const { getComponentBinding } = useDataBindingStore();
    const binding = effectiveProps.binding || getComponentBinding(componentId || 'datatable');

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
