import React from 'react';
import { Input } from '@/components/ui/input';
import { RendererProps } from '../types';

export const InputRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <Input
        placeholder={effectiveProps.placeholder || 'Enter text...'}
        type={effectiveProps.type || 'text'}
        className={combinedClassName}
        style={inlineStyles}
        readOnly
    />
);
