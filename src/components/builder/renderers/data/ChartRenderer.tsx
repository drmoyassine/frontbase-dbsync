import React from 'react';
import { Chart } from '@/components/data-binding/Chart';
import { RendererProps } from '../types';

export const ChartRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, componentId }) => (
    <Chart
        componentId={componentId || 'chart'}
        binding={effectiveProps.binding}
        className={combinedClassName}
        chartType={effectiveProps.chartType || 'bar'}
    />
);
