import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';

export const RowRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, children, styles }) => {
    // Row is a horizontal flex container
    const rowClassName = cn(
        combinedClassName,
        'min-h-[50px] transition-all duration-200',
        !combinedClassName.includes('border') && !styles?.borderWidth ? 'border border-dashed border-border/50' : '',
        !combinedClassName.includes('rounded') && !styles?.borderRadius ? 'rounded-md' : ''
    );

    // Merge default row styles with user styles
    const rowStyles: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'row',
        gap: '16px',
        alignItems: 'stretch',
        width: '100%',
        ...inlineStyles
    };

    return (
        <div className={rowClassName} style={rowStyles}>
            {children ? children : (
                <p className="text-muted-foreground text-center w-full">Row - Drop components here</p>
            )}
        </div>
    );
};
