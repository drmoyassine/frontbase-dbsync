import React from 'react';
import { Grid } from '@frontbase/grid';
import { RendererProps } from '../types';

export const GridRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, componentId }) => (
    <Grid
        mode="builder"
        componentId={componentId || 'grid'}
        binding={effectiveProps.binding}
        className={combinedClassName}
        columns={effectiveProps.columns || 3}
    />
);
