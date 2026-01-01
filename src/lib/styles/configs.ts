import type { CSSPropertyConfig } from './types';

// Comprehensive CSS property configurations
export const CSS_PROPERTY_CONFIGS: Record<string, CSSPropertyConfig> = {
    // ===== LAYOUT =====
    display: {
        id: 'display',
        name: 'Display',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'block',
        options: ['block', 'inline', 'flex', 'grid', 'inline-block', 'inline-flex', 'none'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Sets the display behavior of an element'
    },

    position: {
        id: 'position',
        name: 'Position',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'static',
        options: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim(),
        description: 'Sets the positioning method'
    },

    flexDirection: {
        id: 'flexDirection',
        name: 'Flex Direction',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'row',
        options: ['row', 'column'],
        useToggleGroup: true,
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim()
    },

    justifyContent: {
        id: 'justifyContent',
        name: 'Justify Content',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'flex-start',
        options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'],
        useToggleGroup: true,
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim()
    },

    alignItems: {
        id: 'alignItems',
        name: 'Align Items',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'flex-start',
        options: ['flex-start', 'center', 'flex-end', 'stretch'],
        useToggleGroup: true,
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim()
    },

    flexWrap: {
        id: 'flexWrap',
        name: 'Flex Wrap',
        category: 'Layout',
        controlType: 'select',
        defaultValue: 'nowrap',
        options: ['nowrap', 'wrap', 'wrap-reverse'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim()
    },

    // ===== SPACING =====
    padding: {
        id: 'padding',
        name: 'Padding',
        category: 'Spacing',
        controlType: 'spacing',
        defaultValue: { top: 50, right: 50, bottom: 50, left: 50 },
        toCSSValue: ({ top, right, bottom, left }) =>
            `${top}px ${right}px ${bottom}px ${left}px`,
        fromCSSValue: (css) => {
            const parts = css.split(/\s+/).map(p => parseInt(p) || 0);
            return {
                top: parts[0] || 0,
                right: parts[1] || parts[0] || 0,
                bottom: parts[2] || parts[0] || 0,
                left: parts[3] || parts[1] || parts[0] || 0
            };
        }
    },

    margin: {
        id: 'margin',
        name: 'Margin',
        category: 'Spacing',
        controlType: 'spacing',
        defaultValue: { top: 0, right: 0, bottom: 0, left: 0 },
        toCSSValue: ({ top, right, bottom, left }) =>
            `${top}px ${right}px ${bottom}px ${left}px`,
        fromCSSValue: (css) => {
            const parts = css.split(/\s+/).map(p => parseInt(p) || 0);
            return {
                top: parts[0] || 0,
                right: parts[1] || parts[0] || 0,
                bottom: parts[2] || parts[0] || 0,
                left: parts[3] || parts[1] || parts[0] || 0
            };
        }
    },

    gap: {
        id: 'gap',
        name: 'Gap',
        category: 'Spacing',
        controlType: 'number',
        defaultValue: 30,
        unit: 'px',
        min: 0,
        step: 1,
        toCSSValue: (value) => `${value}px`,
        fromCSSValue: (css) => parseInt(css) || 0
    },

    // ===== SIZING =====
    width: {
        id: 'width',
        name: 'Width',
        category: 'Sizing',
        controlType: 'number',
        defaultValue: 'auto',
        unit: 'px',
        min: 0,
        toCSSValue: (value) => value === 'auto' ? 'auto' : `${value}px`,
        fromCSSValue: (css) => css === 'auto' ? 'auto' : parseInt(css) || 0
    },

    height: {
        id: 'height',
        name: 'Height',
        category: 'Sizing',
        controlType: 'number',
        defaultValue: 'auto',
        unit: 'px',
        min: 0,
        toCSSValue: (value) => value === 'auto' ? 'auto' : `${value}px`,
        fromCSSValue: (css) => css === 'auto' ? 'auto' : parseInt(css) || 0
    },

    minWidth: {
        id: 'minWidth',
        name: 'Min Width',
        category: 'Sizing',
        controlType: 'number',
        defaultValue: 0,
        unit: 'px',
        min: 0,
        toCSSValue: (value) => `${value}px`,
        fromCSSValue: (css) => parseInt(css) || 0
    },

    maxWidth: {
        id: 'maxWidth',
        name: 'Max Width',
        category: 'Sizing',
        controlType: 'number',
        defaultValue: 'none',
        unit: 'px',
        min: 0,
        toCSSValue: (value) => value === 'none' ? 'none' : `${value}px`,
        fromCSSValue: (css) => css === 'none' ? 'none' : parseInt(css) || 0
    },

    // ===== TYPOGRAPHY =====
    fontSize: {
        id: 'fontSize',
        name: 'Font Size',
        category: 'Typography',
        controlType: 'number',
        defaultValue: 16,
        unit: 'px',
        min: 8,
        max: 72,
        step: 1,
        toCSSValue: (value) => `${value}px`,
        fromCSSValue: (css) => parseInt(css) || 16
    },

    fontWeight: {
        id: 'fontWeight',
        name: 'Font Weight',
        category: 'Typography',
        controlType: 'select',
        defaultValue: '400',
        options: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim()
    },

    lineHeight: {
        id: 'lineHeight',
        name: 'Line Height',
        category: 'Typography',
        controlType: 'number',
        defaultValue: 1.5,
        min: 1,
        max: 3,
        step: 0.1,
        toCSSValue: (value) => String(value),
        fromCSSValue: (css) => parseFloat(css) || 1.5
    },

    textAlign: {
        id: 'textAlign',
        name: 'Text Align',
        category: 'Typography',
        controlType: 'select',
        defaultValue: 'left',
        options: ['left', 'center', 'right', 'justify'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim()
    },

    // ===== COLORS =====
    color: {
        id: 'color',
        name: 'Text Color',
        category: 'Colors',
        controlType: 'color',
        defaultValue: '#000000',
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim()
    },

    backgroundColor: {
        id: 'backgroundColor',
        name: 'Background Color',
        category: 'Colors',
        controlType: 'color',
        defaultValue: 'transparent',
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim()
    },

    borderColor: {
        id: 'borderColor',
        name: 'Border Color',
        category: 'Colors',
        controlType: 'color',
        defaultValue: '#000000',
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim()
    },

    // ===== EFFECTS =====
    opacity: {
        id: 'opacity',
        name: 'Opacity',
        category: 'Effects',
        controlType: 'number',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        toCSSValue: (value) => String(value),
        fromCSSValue: (css) => parseFloat(css) || 1
    },

    borderRadius: {
        id: 'borderRadius',
        name: 'Border Radius',
        category: 'Effects',
        controlType: 'number',
        defaultValue: 0,
        unit: 'px',
        min: 0,
        toCSSValue: (value) => `${value}px`,
        fromCSSValue: (css) => parseInt(css) || 0
    },

    boxShadow: {
        id: 'boxShadow',
        name: 'Box Shadow',
        category: 'Effects',
        controlType: 'composite',
        defaultValue: { x: 0, y: 0, blur: 0, spread: 0, color: 'rgba(0,0,0,0.3)' },
        fields: [
            { name: 'x', controlType: 'number', unit: 'px' },
            { name: 'y', controlType: 'number', unit: 'px' },
            { name: 'blur', controlType: 'number', unit: 'px', min: 0 },
            { name: 'spread', controlType: 'number', unit: 'px' },
            { name: 'color', controlType: 'color' }
        ],
        toCSSValue: ({ x, y, blur, spread, color }) =>
            `${x}px ${y}px ${blur}px ${spread}px ${color}`,
        fromCSSValue: (css) => {
            const parts = css.trim().split(/\s+/);
            return {
                x: parseInt(parts[0]) || 0,
                y: parseInt(parts[1]) || 0,
                blur: parseInt(parts[2]) || 0,
                spread: parseInt(parts[3]) || 0,
                color: parts.slice(4).join(' ') || 'rgba(0,0,0,0.3)'
            };
        }
    },

    borderWidth: {
        id: 'borderWidth',
        name: 'Border Width',
        category: 'Effects',
        controlType: 'number',
        defaultValue: 0,
        unit: 'px',
        min: 0,
        toCSSValue: (value) => `${value}px`,
        fromCSSValue: (css) => parseInt(css) || 0
    },

    borderStyle: {
        id: 'borderStyle',
        name: 'Border Style',
        category: 'Effects',
        controlType: 'select',
        defaultValue: 'solid',
        options: ['none', 'solid', 'dashed', 'dotted', 'double'],
        toCSSValue: (value) => value,
        fromCSSValue: (css) => css.trim()
    }
};

// Category organization
export const CSS_CATEGORIES = {
    'Layout': ['display', 'position', 'flexDirection', 'justifyContent', 'alignItems', 'flexWrap'],
    'Spacing': ['padding', 'margin', 'gap'],
    'Sizing': ['width', 'height', 'minWidth', 'maxWidth'],
    'Typography': ['fontSize', 'fontWeight', 'lineHeight', 'textAlign'],
    'Colors': ['color', 'backgroundColor', 'borderColor'],
    'Effects': ['opacity', 'borderRadius', 'boxShadow', 'borderWidth', 'borderStyle']
};

// Helper to get all properties by category
export const getPropertiesByCategory = (category: string): CSSPropertyConfig[] => {
    const propertyIds = CSS_CATEGORIES[category as keyof typeof CSS_CATEGORIES] || [];
    return propertyIds.map(id => CSS_PROPERTY_CONFIGS[id]).filter(Boolean);
};

// Helper to get all categories
export const getAllCategories = (): string[] => {
    return Object.keys(CSS_CATEGORIES);
};
