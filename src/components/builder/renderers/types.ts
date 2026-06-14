import React from 'react';

export interface RendererProps {
    effectiveProps: any;
    combinedClassName: string;
    inlineStyles: React.CSSProperties;
    createEditableText: (text: string, textProperty: string, className: string, style?: React.CSSProperties) => React.ReactNode;
    children?: React.ReactNode;
    componentId?: string;
    onColumnOverrideChange?: (columnName: string, updates: any) => void;
    /** Opens the data-binding modal for this component (data components only). */
    onConfigureBinding?: () => void;
    styles?: any;
}
