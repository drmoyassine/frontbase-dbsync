import React from 'react';
import { UniversalDataTable } from '@/components/data-binding/UniversalDataTable';
import { RendererProps } from '../types';

export const DataTableRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, componentId, onColumnOverrideChange }) => (
    <UniversalDataTable
        componentId={componentId || 'datatable'}
        binding={effectiveProps.binding}
        className={combinedClassName}
        style={inlineStyles}
        onColumnOverrideChange={onColumnOverrideChange}
    />
);
