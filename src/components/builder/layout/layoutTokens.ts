/**
 * Structural Layout Tokens
 *
 * Spatial layout (align, margin, padding, size) is kept on a dedicated
 * `LayoutShell` wrapper, SEPARATE from a component's aesthetic styles (color,
 * typography, borders), which stay on the component's own element.
 *
 * Components that establish their own layout context (Container, Row, Column,
 * …) are NEVER wrapped — wrapping them would insert an intermediate box that
 * overrides their flex/grid layout.
 */

import type { CSSProperties } from 'react';

/**
 * Component types that own their layout and must not be wrapped in a
 * LayoutShell. Mirrors the container set handled specially in
 * DraggableComponent / ContainerComponent.
 */
export const LAYOUT_COMPONENT_TYPES = new Set<string>([
    'Container',
    'Row',
    'Column',
    'Section',
    'Card',
    'Repeater',
    'Tabs',
    'Accordion',
]);

/**
 * Spatial layout tokens applied by the LayoutShell. These are the OUTER box
 * concerns (how the component takes space and aligns within its parent); all
 * inner/aesthetic styling remains on the component itself.
 *
 * Populated via `component.layout` (a dedicated channel), keeping layout data
 * out of `styles`/`stylesData`.
 */
export interface LayoutTokens {
    /** Outer spacing (CSS shorthand or per-side object). */
    margin?: string | { top?: string | number; right?: string | number; bottom?: string | number; left?: string | number };
    /** Inner spacing of the shell box. */
    padding?: string | { top?: string | number; right?: string | number; bottom?: string | number; left?: string | number };
    width?: string | number;
    minWidth?: string | number;
    maxWidth?: string | number;
    height?: string | number;
    minHeight?: string | number;
    /** Horizontal text/content alignment within the shell. */
    align?: 'start' | 'center' | 'end' | 'stretch';
    /** Self-alignment when the shell is a flex/grid item. */
    alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch';
}

const ALIGN_MAP: Record<NonNullable<LayoutTokens['align']>, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
};

function resolveBox(value: LayoutTokens['margin'] | LayoutTokens['padding']): string | undefined {
    if (value == null) return undefined;
    if (typeof value === 'string') return value;
    const { top = 0, right = 0, bottom = 0, left = 0 } = value;
    const norm = (v: string | number | undefined) => (typeof v === 'number' ? `${v}px` : v);
    return `${norm(top)} ${norm(right)} ${norm(bottom)} ${norm(left)}`;
}

/**
 * True when the component carries any spatial layout tokens worth rendering a
 * real box for. When false, the shell renders layout-transparent
 * (display: contents) so it has zero effect on the page.
 */
export function hasLayoutTokens(layout?: LayoutTokens | null): layout is LayoutTokens {
    if (!layout) return false;
    return (
        layout.margin != null ||
        layout.padding != null ||
        layout.width != null ||
        layout.minWidth != null ||
        layout.maxWidth != null ||
        layout.height != null ||
        layout.minHeight != null ||
        layout.align != null ||
        layout.alignSelf != null
    );
}

/**
 * Convert LayoutTokens into a React style object for the shell. Returns an
 * empty object (no box) when there is nothing spatial to apply.
 */
export function layoutTokensToStyle(layout?: LayoutTokens | null): CSSProperties {
    if (!hasLayoutTokens(layout)) return {};
    const style: CSSProperties = {};
    const margin = resolveBox(layout.margin);
    if (margin) style.margin = margin;
    const padding = resolveBox(layout.padding);
    if (padding) style.padding = padding;
    if (layout.width != null) style.width = layout.width as string | number;
    if (layout.minWidth != null) style.minWidth = layout.minWidth as string | number;
    if (layout.maxWidth != null) style.maxWidth = layout.maxWidth as string | number;
    if (layout.height != null) style.height = layout.height as string | number;
    if (layout.minHeight != null) style.minHeight = layout.minHeight as string | number;
    if (layout.align) {
        style.display = 'flex';
        style.flexDirection = 'column';
        style.alignItems = ALIGN_MAP[layout.align];
    }
    if (layout.alignSelf) style.alignSelf = layout.alignSelf;
    return style;
}
