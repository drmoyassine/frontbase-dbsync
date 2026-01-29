import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';

export const ImageRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <img
        src={effectiveProps.src || '/placeholder.svg'}
        alt={effectiveProps.alt || 'Image'}
        className={cn('rounded-lg object-cover', combinedClassName)}
        style={{
            width: effectiveProps.width || '200px',
            height: effectiveProps.height || '200px',
            ...inlineStyles
        }}
    />
);
