/**
 * useIframeCanvas — drives the eSSR re-render cycle for the iframe canvas.
 *
 * Subscribes to `page.layoutData`. On every change:
 *  - debounce ~120ms (coalesce rapid mutations: inline-edit typing, Phase C
 *    style-slider drags) so the worker isn't stampeded;
 *  - abort any in-flight request (the layout already superseded it);
 *  - POST /builder/api/reRender and store the returned HTML;
 *  - bump `renderNonce` so consumers can re-run post-load work (stamping,
 *    rect measurement, selection listener attach, selection restore).
 *
 * The iframe element itself (and its `load` handler) is owned by IframeCanvas;
 * this hook only owns the fetch lifecycle and the resulting HTML string.
 */

import { useEffect, useState } from 'react';
import type { Page } from '@/types/builder';
import { buildReRenderRequest, fetchReRender } from '@/lib/builder/iframeBridge';

export type IframeStatus = 'idle' | 'rendering' | 'ready' | 'error';

export interface UseIframeCanvasResult {
    /** The full HTML document string to assign to iframe.srcdoc. */
    html: string;
    status: IframeStatus;
    error: string | null;
    /** Monotonically bumped after each successful render commit. */
    renderNonce: number;
}

const DEBOUNCE_MS = 120;

export function useIframeCanvas(page: Page, systemEdgeUrl?: string): UseIframeCanvasResult {
    const [html, setHtml] = useState('');
    const [status, setStatus] = useState<IframeStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [renderNonce, setRenderNonce] = useState(0);

    // Re-render whenever the layout, page identity, or resolved origin changes.
    // `page.layoutData` is a new reference on every mutation (structural
    // sharing), so this effect re-runs exactly when the canvas should update.
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const controller = new AbortController();

        const issue = async () => {
            setStatus((prev) => (prev === 'ready' ? 'rendering' : prev));
            setError(null);
            try {
                const out = await fetchReRender(buildReRenderRequest(page), {
                    systemEdgeUrl,
                    signal: controller.signal,
                });
                if (cancelled) return;
                setHtml(out);
                setStatus('ready');
                setRenderNonce((n) => n + 1);
            } catch (e: unknown) {
                if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) {
                    return;
                }
                setError(e instanceof Error ? e.message : String(e));
                setStatus('error');
            }
        };

        // Trailing debounce: rapid mutations reset the timer; only the final
        // layout in the burst is actually rendered.
        timer = setTimeout(() => {
            timer = null;
            void issue();
        }, DEBOUNCE_MS);

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            // Abort an in-flight fetch so its stale result never lands.
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page.layoutData, page.id, systemEdgeUrl]);

    return { html, status, error, renderNonce };
}
