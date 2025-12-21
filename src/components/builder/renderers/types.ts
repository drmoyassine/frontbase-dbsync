import React from 'react';

export interface RendererProps {
    effectiveProps: any;
    combinedClassName: string;
    inlineStyles: React.CSSProperties;
    createEditableText: (text: string, textProperty: string, className: string, style?: React.CSSProperties) => React.ReactNode;
    children?: React.ReactNode;
    componentId?: string;
    onConfigureBinding?: any;
    onColumnOverrideChange?: (columnName: string, updates: any) => void;
    styles?: any;
}
