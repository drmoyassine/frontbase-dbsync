/**
 * InfoList Smart Block - Builder Wrapper
 * 
 * Thin wrapper around the pure @frontbase/infolist component.
 * Injects the Builder-specific FieldSettingsPopover so users can configure
 * each field individually without polluting the pure presentation logic.
 */

import React from 'react';
import { InfoList as PureInfoList, type InfoListBinding } from '@frontbase/infolist';
import { FieldSettingsPopover } from '@/components/builder/form/FieldSettingsPopover';
import { useDataBindingStore } from '@/stores/data-binding-simple';

export interface InfoListProps {
    componentId?: string;
    dataSourceId?: string;
    tableName?: string;
    recordId?: string;
    title?: string;
    excludeColumns?: string[];
    showCard?: boolean;
    className?: string;
    style?: React.CSSProperties;
    fieldOverrides?: Record<string, any>;
    isBuilderMode?: boolean;
    onFieldOverrideChange?: (fieldName: string, updates: any) => void;
    layout?: 'list' | '1' | '2' | '3';
    fieldSpacing?: 'compact' | 'normal' | 'relaxed';
    columns?: number;
    // Binding is optionally passed down
    binding?: InfoListBinding;
}

export const InfoList: React.FC<InfoListProps> = ({
    componentId,
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
    fieldSpacing = 'normal',
    columns,
    binding: propBinding
}) => {
    // Get binding from store as fallback
    const { getComponentBinding } = useDataBindingStore();
    const binding = propBinding || getComponentBinding(componentId || 'infolist') || {};

    // Reconstruct the unified binding object for the pure component
    const unifiedBinding: InfoListBinding = {
        ...binding,
        dataSourceId: dataSourceId || binding.dataSourceId || binding.datasourceId,
        tableName: tableName || binding.tableName,
        recordId: recordId || binding.recordId,
        fieldOverrides: Object.keys(fieldOverrides).length > 0 ? fieldOverrides : binding.fieldOverrides,
        excludeColumns: excludeColumns.length > 0 ? excludeColumns : binding.excludeColumns,
    };

    return (
        <PureInfoList
            mode={isBuilderMode ? 'builder' : 'edge'}
            binding={unifiedBinding}
            title={title}
            showCard={showCard}
            className={className}
            style={style}
            layout={layout}
            fieldSpacing={fieldSpacing}
            columns={columns}
            // IoC Integration: Wrap each individual field with the Settings Popover
            fieldWrapper={
                isBuilderMode && onFieldOverrideChange 
                ? (fieldName, children) => (
                    <FieldSettingsPopover
                        key={fieldName}
                        fieldName={fieldName}
                        settings={unifiedBinding.fieldOverrides?.[fieldName] || {}}
                        onSave={(updates) => onFieldOverrideChange(fieldName, updates)}
                        componentType="InfoList"
                        isBuilderMode={true}
                    >
                        {children}
                    </FieldSettingsPopover>
                )
                : undefined
            }
        />
    );
};

export default InfoList;
