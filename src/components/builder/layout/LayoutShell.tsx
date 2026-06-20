/**
 * LayoutShell — the structural layout wrapper applied around non-layout
 * component renderer output.
 *
 * It carries SPATIAL tokens (margin, padding, width, alignment, …) from
 * `component.layout`, keeping them separate from the component's aesthetic
 * styles. When no spatial tokens are present it renders with
 * `display: contents`, so it generates no box and has zero effect on layout —
 * the component renders exactly as it did without the shell.
 *
 * Layout components (Container, Row, Column, …) bypass the shell entirely
 * (see ComponentRenderer) so their flex/grid layout is never double-wrapped.
 */

import React from 'react';
import { hasLayoutTokens, layoutTokensToStyle, type LayoutTokens } from './layoutTokens';

interface LayoutShellProps {
    /**
     * Spatial layout tokens from `component.layout`.
     *
     * Note: the shell intentionally does NOT carry the `fb-<id>` class — that
     * hook belongs to the component's own element (and is used for user raw-CSS
     * scoping). Duplicating it here would let user CSS unintentionally mutate
     * the shell and override its `display: contents` default.
     */
    layout?: LayoutTokens | null;
    children: React.ReactNode;
}

export const LayoutShell: React.FC<LayoutShellProps> = ({ layout, children }) => {
    const active = hasLayoutTokens(layout);
    const style: React.CSSProperties = active
        ? layoutTokensToStyle(layout)
        : { display: 'contents' };

    return (
        <div className="fb-layout-shell" style={style}>
            {children}
        </div>
    );
};
