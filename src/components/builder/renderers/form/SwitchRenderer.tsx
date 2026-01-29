import React from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';

export const SwitchRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <div className={cn('flex items-center space-x-2', combinedClassName)} style={inlineStyles}>
        <Switch />
        <label className="text-sm">
            {effectiveProps.label || 'Toggle'}
        </label>
    </div>
);
