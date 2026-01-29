import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';

export const ColumnRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, children, styles }) => {
    // Column is a vertical flex container
    const columnClassName = cn(
        combinedClassName,
        'min-h-[100px] transition-all duration-200',
        !combinedClassName.includes('border') && !styles?.borderWidth ? 'border border-dashed border-border/50' : '',
        !combinedClassName.includes('rounded') && !styles?.borderRadius ? 'rounded-md' : ''
    );

    // Merge default column styles with user styles
    const columnStyles: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        ...inlineStyles
    };

    return (
        <div className={columnClassName} style={columnStyles}>
            {children ? children : (
                <p className="text-muted-foreground text-center">Column - Drop components here</p>
            )}
        </div>
    );
};
