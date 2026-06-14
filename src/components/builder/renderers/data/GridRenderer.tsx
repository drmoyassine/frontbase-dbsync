import React from 'react';
import { Grid } from '@frontbase/grid';
import { RendererProps } from '../types';
import { useResolvedBinding } from './useResolvedBinding';

export const GridRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, componentId, onConfigureBinding }) => {
    const binding = useResolvedBinding(componentId, effectiveProps.binding);
    return (
        <Grid
            mode="builder"
            componentId={componentId || 'grid'}
            binding={binding}
            className={combinedClassName}
            style={inlineStyles}
            columns={effectiveProps.columns || 3}
            onConfigureBinding={onConfigureBinding}
        />
    );
};
