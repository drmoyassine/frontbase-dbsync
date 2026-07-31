import React from 'react';

/**
 * DraggableComponent — RETIRED from canvas rendering (Phase D).
 *
 * The builder canvas now renders the eSSR output of POST /builder/api/reRender
 * inside a same-origin iframe (see IframeCanvas) and bridges selection / DnD /
 * inline-edit through the iframe contentDocument + a React overlay
 * (CanvasOverlay). The React DraggableComponent tree that used to render the
 * canvas is no longer exercised.
 *
 * This file is kept as a no-op adapter (rather than deleted) so any latent
 * transitive importer does not break the build. Verified: the only importer
 * was BuilderCanvas, which no longer references it.
 */
export interface DraggableComponentProps {
    component?: unknown;
    index?: number;
    pageId?: string;
    parentId?: string;
    isSelected?: boolean;
    isLastComponent?: boolean;
    onSelect?: (componentId: string, event: React.MouseEvent) => void;
}

export const DraggableComponent: React.FC<DraggableComponentProps> = () => {
    if (process.env.NODE_ENV !== 'production') {
        // Surface accidental re-introduction during development.
        // eslint-disable-next-line no-console
        console.warn(
            '[Frontbase] DraggableComponent is retired (Phase D iframe canvas) and renders nothing.',
        );
    }
    return null;
};
