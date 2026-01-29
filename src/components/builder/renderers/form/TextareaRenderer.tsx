import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { RendererProps } from '../types';

export const TextareaRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <Textarea
        placeholder={effectiveProps.placeholder || 'Enter text...'}
        className={combinedClassName}
        style={inlineStyles}
        rows={effectiveProps.rows || 3}
        readOnly
    />
);
