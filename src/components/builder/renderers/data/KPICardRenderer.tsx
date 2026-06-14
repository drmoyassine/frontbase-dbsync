import React from 'react';
import { KPICard } from '@frontbase/kpicard';
import { RendererProps } from '../types';

export const KPICardRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, componentId }) => (
    <KPICard
        mode="builder"
        componentId={componentId || 'kpicard'}
        binding={effectiveProps.binding}
        className={combinedClassName}
    />
);
