import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';

export const ContainerRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, children, styles }) => {
    // Check if this container uses grid layout
    const isGrid = inlineStyles?.display === 'grid' || styles?.display === 'grid';

    // Determine grid columns for responsive data attribute
    const gridCols = (() => {
        const colsStyle = styles?.gridTemplateColumns || inlineStyles?.gridTemplateColumns || '';
        if (typeof colsStyle === 'string') {
            const match = colsStyle.match(/repeat\((\d+)/);
            if (match) return match[1];
        }
        return '2'; // Default assumption
    })();

    // For containers, merge styling classes with default container styling
    const containerClassName = cn(
        'fb-container', // Enable container queries
        combinedClassName,
        'min-h-[100px] transition-all duration-200',
        isGrid ? 'fb-grid' : '', // Add responsive grid class
        // Only add default styling if no custom styling is applied
        !combinedClassName.includes('p-') && !styles?.padding ? 'p-6' : '',
        !combinedClassName.includes('border') && !styles?.borderWidth ? 'border border-border' : '',
        !combinedClassName.includes('rounded') && !styles?.borderRadius ? 'rounded-lg' : ''
    );

    // Apply margin:0 auto for centering the container itself
    // Note: text-align should be controlled by user via styles, not forced
    const mergedStyles: React.CSSProperties = {
        margin: '0 auto',
        ...inlineStyles
    };

    return (
        <div
            className={containerClassName}
            style={mergedStyles}
            data-cols={isGrid ? gridCols : undefined}
        >
            {children ? children : (
                <p className="text-muted-foreground text-center">Container - Drop components here</p>
            )}
        </div>
    );
};
