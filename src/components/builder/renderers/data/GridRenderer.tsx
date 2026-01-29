import React from 'react';
import { Grid } from '@/components/data-binding/Grid';
import { RendererProps } from '../types';

export const GridRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, componentId }) => (
    <Grid
        componentId={componentId || 'grid'}
        binding={effectiveProps.binding}
        className={combinedClassName}
        columns={effectiveProps.columns || 3}
    />
);
