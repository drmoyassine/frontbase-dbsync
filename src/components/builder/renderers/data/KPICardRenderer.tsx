import React from 'react';
import { KPICard } from '@frontbase/kpicard';
import { RendererProps } from '../types';
import { useResolvedBinding } from './useResolvedBinding';

export const KPICardRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, componentId, onConfigureBinding }) => {
    const binding = useResolvedBinding(componentId, effectiveProps.binding);
    return (
        <KPICard
            mode="builder"
            componentId={componentId || 'kpicard'}
            binding={binding}
            className={combinedClassName}
            style={inlineStyles}
            onConfigureBinding={onConfigureBinding}
        />
    );
};
