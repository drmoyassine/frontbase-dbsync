// Type definitions for the preset CSS properties system

export type ControlType =
    | 'select'
    | 'number'
    | 'color'
    | 'spacing'
    | 'sizing'
    | 'dimension'
    | 'composite'
    | 'toggle';

export interface PropertyField {
    name: string;
    controlType: ControlType;
    unit?: string;
    options?: string[];
    min?: number;
    max?: number;
    step?: number;
}

export interface CSSPropertyConfig {
    id: string;
    name: string;
    category: string;
    controlType: ControlType;
    defaultValue: any;

    // For select controls
    options?: string[];
    useToggleGroup?: boolean; // Use toggle buttons instead of dropdown

    // For number controls
    unit?: string;
    min?: number;
    max?: number;
    step?: number;

    // For dimension controls (minWidth, maxWidth, etc.)
    dimension?: 'width' | 'height';

    // For composite controls (like box-shadow)
    fields?: PropertyField[];

    // Conversion functions
    toCSSValue: (value: any) => string | Record<string, string>;
    fromCSSValue: (css: string) => any;

    // Optional documentation
    description?: string;
    example?: string;
}

export interface StyleValues {
    [propertyId: string]: any;
}

export interface StylesData {
    activeProperties: string[];
    values: StyleValues;
    stylingMode: 'visual' | 'css';
    rawCSS?: string;
}

export interface SpacingValue {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface BoxShadowValue {
    x: number;
    y: number;
    blur: number;
    spread: number;
    color: string;
}
