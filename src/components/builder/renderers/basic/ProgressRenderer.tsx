import React from 'react';
import { Progress } from '@/components/ui/progress';
import { RendererProps } from '../types';

export const ProgressRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <Progress
        value={effectiveProps.value || 50}
        className={combinedClassName}
        style={inlineStyles}
    />
);
