import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';

export const TextRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, createEditableText }) => {
    const TextComponent = effectiveProps.size === 'sm' ? 'p' : effectiveProps.size === 'lg' ? 'p' : 'p';
    const textClasses = {
        sm: 'text-sm',
        base: 'text-base',
        lg: 'text-lg'
    };
    return (
        <TextComponent
            className={cn(textClasses[effectiveProps.size as keyof typeof textClasses] || 'text-base', combinedClassName)}
            style={inlineStyles}
        >
            {createEditableText(effectiveProps.text || 'Sample text', 'text', textClasses[effectiveProps.size as keyof typeof textClasses] || 'text-base', inlineStyles)}
        </TextComponent>
    );
};
