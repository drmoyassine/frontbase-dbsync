/**
 * IframeCanvas — the eSSR presentation surface.
 *
 * Renders a same-origin <iframe> whose `srcdoc` is the HTML returned by
 * POST /builder/api/reRender (byte-identical to a published page). On every
 * `load` event (one per srcdoc swap) it:
 *   1. stamps data-fb-id / data-fb-component onto real component roots,
 *   2. measures viewport-local rects and pushes them to the parent overlay,
 *   3. re-attaches capture-phase click / hover / dblclick listeners,
 *   4. restores the current selection (selectedComponentId survives swaps;
 *      the overlay simply looks up its rect — if the node was deleted, no rect
 *      is found and nothing is drawn).
 *
 * The overlay (CanvasOverlay) is rendered as a SIBLING by BuilderCanvas,
 * inside the same transform-scaled viewport wrapper, so iframe-local coords
 * map directly to overlay coords.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '@/types/builder';
import { queryComponentRects, stampComponentIds } from '@/lib/builder/iframeBridge';
import type { ComponentRect } from '@/lib/builder/iframeTypes';
import { attachIframeSelection } from './useIframeSelection';
import { useIframePointerRouting } from './useIframeDnd';
import { useIframeCanvas } from './useIframeCanvas';

interface IframeCanvasProps {
    page: Page;
    /** Absolute system-edge URL for cross-origin dev reRender (production uses relative). */
    systemEdgeUrl?: string;
    /** Pushed up to BuilderCanvas so CanvasOverlay can consume the rects. */
    onRects?: (rects: ComponentRect[]) => void;
    onHoveredId?: (id: string | null) => void;
}

export const IframeCanvas: React.FC<IframeCanvasProps> = ({
    page,
    systemEdgeUrl,
    onRects,
    onHoveredId,
}) => {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const { html, status, error, renderNonce } = useIframeCanvas(page, systemEdgeUrl);
    const [rects, setRects] = useState<ComponentRect[]>([]);

    // Keep latest callbacks in refs so the load handler (which is stable apart
    // from page.layoutData) doesn't tear down/re-attach listeners on every
    // parent re-render.
    const onRectsRef = useRef(onRects);
    const onHoveredIdRef = useRef(onHoveredId);
    onRectsRef.current = onRects;
    onHoveredIdRef.current = onHoveredId;

    const selectionCleanup = useRef<(() => void) | null>(null);

    const refreshRects = useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;
        const next = queryComponentRects(doc);
        setRects(next);
        onRectsRef.current?.(next);
    }, []);

    // The content nodes used for the data-fb-id stamping pass. Stable per layout.
    const contentNodes = page.layoutData?.content ?? [];

    const handleLoad = useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;

        // 1. Stamp data-fb-id so [data-fb-id] selection resolves real components.
        stampComponentIds(doc, contentNodes);
        // 2. Measure + publish rects to the overlay.
        refreshRects();
        // 3. Re-attach selection listeners (the document was just replaced).
        selectionCleanup.current?.();
        selectionCleanup.current = attachIframeSelection(doc, {
            onHoveredId: (id) => onHoveredIdRef.current?.(id),
        });
    }, [contentNodes, refreshRects]);

    // Re-query rects on internal scroll / resize so the overlay follows the
    // content. Re-subscribes after each successful render (renderNonce).
    useEffect(() => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        let raf = 0;
        const schedule = () => {
            if (raf) return;
            raf = win.requestAnimationFrame(() => {
                raf = 0;
                refreshRects();
            });
        };
        win.addEventListener('scroll', schedule, true);
        win.addEventListener('resize', schedule);
        return () => {
            win.removeEventListener('scroll', schedule, true);
            win.removeEventListener('resize', schedule);
            if (raf) win.cancelAnimationFrame(raf);
        };
    }, [renderNonce, refreshRects]);

    // Tear down selection listeners on unmount.
    useEffect(() => () => selectionCleanup.current?.(), []);

    // Route pointer events to the parent during active DnD.
    useIframePointerRouting(iframeRef);

    return (
        <>
            <iframe
                ref={iframeRef}
                title="Frontbase Builder Canvas"
                // srcDoc (React) maps to the srcdoc attribute; same-origin, and
                // contentDocument is accessible from the parent. Undefined on
                // first paint so the iframe stays blank until the first render.
                srcDoc={html || undefined}
                onLoad={handleLoad}
                style={{
                    border: 'none',
                    display: 'block',
                    width: '100%',
                    minHeight: '100%',
                    background: '#ffffff',
                }}
            />
            {status === 'error' && (
                <div className="absolute inset-0 z-30 flex items-center justify-center p-8 text-center bg-background/80">
                    <div className="max-w-md">
                        <p className="text-sm font-semibold text-destructive mb-1">
                            Canvas failed to render
                        </p>
                        <p className="text-xs text-muted-foreground break-all">{error}</p>
                    </div>
                </div>
            )}
        </>
    );
};
