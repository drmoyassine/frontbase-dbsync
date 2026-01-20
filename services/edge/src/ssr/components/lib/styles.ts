/**
 * Styles utilities for SSR components
 */

export interface StylesData {
    activeProperties?: string[];
    values?: Record<string, any>;
    stylingMode?: 'visual' | 'css';
    rawCSS?: string;
}

/**
 * Convert StylesData to inline CSS string
 */
export function stylesDataToCSS(stylesData?: StylesData): string {
    if (!stylesData) return '';

    // Handle raw CSS mode
    if (stylesData.stylingMode === 'css' && stylesData.rawCSS) {
        return stylesData.rawCSS;
    }

    // Handle visual mode with values
    if (!stylesData.values) return '';

    const styleParts: string[] = [];

    for (const [prop, value] of Object.entries(stylesData.values)) {
        if (value !== undefined && value !== null && value !== '') {
            // Convert camelCase to kebab-case
            const cssKey = prop.replace(/([A-Z])/g, '-$1').toLowerCase();

            // Handle special value types
            if (typeof value === 'object') {
                // Handle spacing/sizing objects
                if ('top' in value && 'right' in value && 'bottom' in value && 'left' in value) {
                    styleParts.push(`${cssKey}: ${value.top}px ${value.right}px ${value.bottom}px ${value.left}px`);
                }
            } else {
                styleParts.push(`${cssKey}: ${value}`);
            }
        }
    }

    return styleParts.join('; ');
}
