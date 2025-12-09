import React from 'react';
import { UniversalDataTable } from '@/components/data-binding/UniversalDataTable';
import { KPICard } from '@/components/data-binding/KPICard';
import { Chart } from '@/components/data-binding/Chart';
import { Grid } from '@/components/data-binding/Grid';
import { RendererProps } from './types';

export const DataTableRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, componentId, onConfigureBinding, onColumnOverrideChange }) => (
    <UniversalDataTable
        componentId={componentId || 'datatable'}
        binding={effectiveProps.binding}
        className={combinedClassName}
        onConfigureBinding={onConfigureBinding}
        onColumnOverrideChange={onColumnOverrideChange}
    />
);

export const KPICardRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, componentId, onConfigureBinding }) => (
    <KPICard
        componentId={componentId || 'kpicard'}
        binding={effectiveProps.binding}
        className={combinedClassName}
        onConfigureBinding={onConfigureBinding}
    />
);

export const ChartRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, componentId, onConfigureBinding }) => (
    <Chart
        componentId={componentId || 'chart'}
        binding={effectiveProps.binding}
        className={combinedClassName}
        chartType={effectiveProps.chartType || 'bar'}
        onConfigureBinding={onConfigureBinding}
    />
);

export const GridRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, componentId, onConfigureBinding }) => (
    <Grid
        componentId={componentId || 'grid'}
        binding={effectiveProps.binding}
        className={combinedClassName}
        columns={effectiveProps.columns || 3}
        onConfigureBinding={onConfigureBinding}
    />
);
