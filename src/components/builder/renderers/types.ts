import React from 'react';

export interface RendererProps {
    effectiveProps: any;
    combinedClassName: string;
    inlineStyles: React.CSSProperties;
    createEditableText: (
        text: string,
        textProperty: string,
        className: string,
        style?: React.CSSProperties,
        displayText?: string,
        error?: string | null,
    ) => React.ReactNode;
    children?: React.ReactNode;
    componentId?: string;
    onColumnOverrideChange?: (columnName: string, updates: any) => void;
    /** Opens the data-binding modal for this component (data components only). */
    onConfigureBinding?: () => void;
    styles?: any;
    /**
     * Raw child component definitions (the design-time tree), for renderers that
     * need to re-render the subtree themselves (e.g. the Repeater repeating its
     * template per row). Optional — most renderers use the rendered `children`.
     */
    rawChildren?: any[];
}
