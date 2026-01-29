import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';

export const LinkRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, createEditableText }) => (
    <a
        href={effectiveProps.href || '#'}
        target={effectiveProps.target || '_self'}
        className={cn('text-primary hover:underline', combinedClassName)}
        style={inlineStyles}
    >
        {createEditableText(effectiveProps.text || 'Link', 'text', 'text-primary hover:underline', inlineStyles)}
    </a>
);
