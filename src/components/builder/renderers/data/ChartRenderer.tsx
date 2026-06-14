import React from 'react';
import { Chart } from '@frontbase/chart';
import { RendererProps } from '../types';
import { useResolvedBinding } from './useResolvedBinding';

export const ChartRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, componentId, onConfigureBinding }) => {
    const binding = useResolvedBinding(componentId, effectiveProps.binding);
    return (
        <Chart
            mode="builder"
            componentId={componentId || 'chart'}
            binding={binding}
            className={combinedClassName}
            style={inlineStyles}
            chartType={effectiveProps.chartType || 'bar'}
            onConfigureBinding={onConfigureBinding}
        />
    );
};
