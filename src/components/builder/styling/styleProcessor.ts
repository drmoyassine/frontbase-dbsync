import React from 'react';

/**
 * Style Processor
 * 
 * Extracts and processes component styles from the new stylesData format
 * used by the visual styling panel. This is separate from lib/styleUtils.ts
 * which handles the legacy ComponentStyles format.
 * 
 * @see lib/styleUtils.ts for legacy style processing
 */

/**
 * Process stylesData format (new visual styling panel format).
 * Converts stylesData values to React inline styles with viewport overrides.
 * 
 * @param stylesData - The stylesData object from component
 * @param currentViewport - Current viewport (desktop, tablet, mobile)
 * @returns React.CSSProperties object
 */
export function processStylesData(
    stylesData: any,
    currentViewport: 'desktop' | 'tablet' | 'mobile'
): React.CSSProperties {
    if (!stylesData?.values) return {};

    // Merge base values with viewport overrides
    const baseValues = stylesData.values;
    const viewportOverrides = currentViewport !== 'desktop'
        ? stylesData.viewportOverrides?.[currentViewport] || {}
        : {};
    const values = { ...baseValues, ...viewportOverrides };

    const cssStyles: Record<string, any> = {};

    // Map property values to CSS
    Object.entries(values).forEach(([key, value]) => {
        if (key === 'padding' && typeof value === 'object') {
            cssStyles.paddingTop = `${(value as any).top}px`;
            cssStyles.paddingRight = `${(value as any).right}px`;
            cssStyles.paddingBottom = `${(value as any).bottom}px`;
            cssStyles.paddingLeft = `${(value as any).left}px`;
        } else if (key === 'margin' && typeof value === 'object') {
            cssStyles.marginTop = `${(value as any).top}px`;
            cssStyles.marginRight = `${(value as any).right}px`;
            cssStyles.marginBottom = `${(value as any).bottom}px`;
            cssStyles.marginLeft = `${(value as any).left}px`;
        } else if (key === 'size' && typeof value === 'object') {
            const sizeVal = value as any;
            if (sizeVal.width !== 'auto' && sizeVal.width !== undefined) {
                const widthUnit = sizeVal.widthUnit || 'px';
                cssStyles.width = `${sizeVal.width}${widthUnit}`;
            }
            if (sizeVal.height !== 'auto' && sizeVal.height !== undefined) {
                const heightUnit = sizeVal.heightUnit || 'px';
                cssStyles.height = `${sizeVal.height}${heightUnit}`;
            }
        } else if ((key === 'minWidth' || key === 'maxWidth' || key === 'minHeight' || key === 'maxHeight') && typeof value === 'object') {
            // Handle dimension format: { value, unit }
            const dimVal = value as { value: number | 'auto' | 'none'; unit: string };
            if (dimVal.value !== 'auto' && dimVal.value !== 'none' && dimVal.value !== undefined) {
                cssStyles[key] = `${dimVal.value}${dimVal.unit || 'px'}`;
            } else if (dimVal.value === 'none') {
                cssStyles[key] = 'none';
            }
        } else if (key === 'gap' && typeof value === 'number') {
            cssStyles.gap = `${value}px`;
        } else if (key === 'fontSize' && typeof value === 'number') {
            cssStyles.fontSize = `${value}px`;
        } else if (key === 'borderRadius' && typeof value === 'number') {
            cssStyles.borderRadius = `${value}px`;
        } else if (key === 'opacity' && typeof value === 'number') {
            cssStyles.opacity = value / 100;
        } else if (key === 'horizontalAlign' && typeof value === 'string') {
            // Handle horizontal alignment via auto margins
            // Also set display: block and width: fit-content to match SSR behavior
            // This is needed because margin auto doesn't work on inline-flex elements
            cssStyles.display = 'block';
            cssStyles.width = 'fit-content';
            if (value === 'center') {
                cssStyles.marginLeft = 'auto';
                cssStyles.marginRight = 'auto';
            } else if (value === 'right') {
                cssStyles.marginLeft = 'auto';
                cssStyles.marginRight = '0';
            } else {
                cssStyles.marginLeft = '0';
                cssStyles.marginRight = 'auto';
            }
        } else if (typeof value === 'string') {
            // Direct CSS property (flexDirection, backgroundColor, etc.)
            cssStyles[key] = value;
        }
    });

    return cssStyles;
}

/**
 * Process legacy styles format (flat object or old StylesData format).
 * Handles both flat format and nested values format.
 * 
 * @param styles - The styles object from component
 * @returns React.CSSProperties object
 */
export function processLegacyStyles(
    styles: any
): React.CSSProperties {
    if (!styles || typeof styles !== 'object') return {};

    const cssStyles: Record<string, any> = {};

    // Check for NEW StylesData format: { activeProperties: [...], values: {...} }
    if ('values' in styles && typeof (styles as any).values === 'object') {
        const values = (styles as any).values;
        Object.entries(values).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;

            // Handle horizontalAlign - convert to margin auto like SSR does
            if (key === 'horizontalAlign' && typeof value === 'string') {
                if (value === 'center') {
                    cssStyles.marginLeft = 'auto';
                    cssStyles.marginRight = 'auto';
                } else if (value === 'right') {
                    cssStyles.marginLeft = 'auto';
                    cssStyles.marginRight = '0';
                } else {
                    cssStyles.marginLeft = '0';
                    cssStyles.marginRight = 'auto';
                }
            } else if (key === 'padding' && typeof value === 'object') {
                cssStyles.paddingTop = `${(value as any).top}px`;
                cssStyles.paddingRight = `${(value as any).right}px`;
                cssStyles.paddingBottom = `${(value as any).bottom}px`;
                cssStyles.paddingLeft = `${(value as any).left}px`;
            } else if (key === 'margin' && typeof value === 'object') {
                cssStyles.marginTop = `${(value as any).top}px`;
                cssStyles.marginRight = `${(value as any).right}px`;
                cssStyles.marginBottom = `${(value as any).bottom}px`;
                cssStyles.marginLeft = `${(value as any).left}px`;
            } else if (key === 'size' && typeof value === 'object') {
                const sizeVal = value as any;
                if (sizeVal.width !== 'auto' && sizeVal.width !== undefined) {
                    const widthUnit = sizeVal.widthUnit || 'px';
                    cssStyles.width = `${sizeVal.width}${widthUnit}`;
                }
                if (sizeVal.height !== 'auto' && sizeVal.height !== undefined) {
                    const heightUnit = sizeVal.heightUnit || 'px';
                    cssStyles.height = `${sizeVal.height}${heightUnit}`;
                }
            } else if (typeof value === 'string' || typeof value === 'number') {
                cssStyles[key] = value;
            }
        });
    } else {
        // Legacy flat format - process horizontalAlign and other special properties
        Object.entries(styles).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;

            // Handle horizontalAlign - convert to margin auto like SSR does
            // Also set display: block and width: fit-content to match SSR behavior
            if (key === 'horizontalAlign' && typeof value === 'string') {
                cssStyles.display = 'block';
                cssStyles.width = 'fit-content';
                if (value === 'center') {
                    cssStyles.marginLeft = 'auto';
                    cssStyles.marginRight = 'auto';
                } else if (value === 'right') {
                    cssStyles.marginLeft = 'auto';
                    cssStyles.marginRight = '0';
                } else {
                    cssStyles.marginLeft = '0';
                    cssStyles.marginRight = 'auto';
                }
            } else {
                // Pass through other properties
                cssStyles[key] = value;
            }
        });
    }

    return cssStyles;
}
