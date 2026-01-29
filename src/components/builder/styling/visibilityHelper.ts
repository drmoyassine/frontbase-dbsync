import React from 'react';

/**
 * Visibility Helper
 * 
 * Handles viewport-specific component visibility in the builder.
 * Components can be hidden on specific viewports while remaining
 * visible in the builder for editing.
 */

export interface ViewportVisibility {
    mobile: boolean;
    tablet: boolean;
    desktop: boolean;
}

/**
 * Check if a component is hidden for the current viewport.
 * 
 * @param visibility - Viewport visibility settings
 * @param currentViewport - Current viewport
 * @returns true if component is hidden for current viewport
 */
export function isHiddenForViewport(
    visibility: ViewportVisibility | undefined,
    currentViewport: 'desktop' | 'tablet' | 'mobile'
): boolean {
    const visibilitySettings = visibility || { mobile: true, tablet: true, desktop: true };
    return visibilitySettings[currentViewport] === false;
}

/**
 * Get styles to apply to hidden components in the builder.
 * Makes them semi-transparent with a dashed outline so they're
 * still visible and editable.
 * 
 * @returns React.CSSProperties for hidden components
 */
export function getHiddenComponentStyles(): React.CSSProperties {
    return {
        opacity: 0.3,
        outline: '2px dashed var(--muted-foreground)',
        outlineOffset: '-2px',
        position: 'relative' as const,
    };
}
