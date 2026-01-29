import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';

export const HeadingRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, createEditableText }) => {
    // Handle both 'h4' format and '4' format - strip 'h' prefix if present
    const levelStr = String(effectiveProps.level || '2').replace(/^h/i, '');
    const HeadingTag = `h${levelStr}` as keyof JSX.IntrinsicElements;
    const headingClasses = {
        '1': 'text-4xl font-bold',
        '2': 'text-3xl font-semibold',
        '3': 'text-2xl font-semibold',
        '4': 'text-xl font-semibold',
        '5': 'text-lg font-semibold',
        '6': 'text-base font-semibold'
    };
    return (
        <HeadingTag
            className={cn(headingClasses[levelStr as keyof typeof headingClasses] || 'text-2xl font-semibold', combinedClassName)}
            style={inlineStyles}
        >
            {createEditableText(effectiveProps.text || 'Heading', 'text', headingClasses[levelStr as keyof typeof headingClasses] || 'text-2xl font-semibold', inlineStyles)}
        </HeadingTag>
    );
};
