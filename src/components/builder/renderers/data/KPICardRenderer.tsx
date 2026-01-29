import React from 'react';
import { KPICard } from '@/components/data-binding/KPICard';
import { RendererProps } from '../types';

export const KPICardRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, componentId }) => (
    <KPICard
        componentId={componentId || 'kpicard'}
        binding={effectiveProps.binding}
        className={combinedClassName}
    />
);
