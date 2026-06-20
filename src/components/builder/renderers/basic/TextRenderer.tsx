import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';
import { useLiquidPreview } from '@/hooks/useLiquidPreview';

export const TextRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, createEditableText }) => {
    const TextComponent = effectiveProps.size === 'sm' ? 'p' : effectiveProps.size === 'lg' ? 'p' : 'p';
    const textClasses = {
        sm: 'text-sm',
        base: 'text-base',
        lg: 'text-lg'
    };
    const cls = textClasses[effectiveProps.size as keyof typeof textClasses] || 'text-base';
    const rawText = effectiveProps.text || 'Sample text';
    const { text: previewText, error } = useLiquidPreview(rawText);
    return (
        <TextComponent
            className={cn(cls, combinedClassName)}
            style={inlineStyles}
        >
            {createEditableText(rawText, 'text', cls, inlineStyles, previewText, error)}
        </TextComponent>
    );
};
