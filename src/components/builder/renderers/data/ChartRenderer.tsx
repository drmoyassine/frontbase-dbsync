import React from 'react';
import { Chart } from '@frontbase/chart';
import { RendererProps } from '../types';

export const ChartRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, componentId }) => (
    <Chart
        mode="builder"
        componentId={componentId || 'chart'}
        binding={effectiveProps.binding}
        className={combinedClassName}
        chartType={effectiveProps.chartType || 'bar'}
    />
);
