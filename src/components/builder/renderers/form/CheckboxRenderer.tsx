import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';

export const CheckboxRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <div className={cn('flex items-center space-x-2', combinedClassName)} style={inlineStyles}>
        <Checkbox id={`checkbox-${Math.random()}`} />
        <label htmlFor={`checkbox-${Math.random()}`} className="text-sm">
            {effectiveProps.label || 'Checkbox'}
        </label>
    </div>
);
