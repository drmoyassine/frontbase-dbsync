/**
 * useIframeSelection — wires click / hover / dblclick on the iframe
 * `contentDocument` to the builder store.
 *
 * Mirrors the framework SelectionTracker._attachIframeListeners AND preserves
 * the legacy BuilderCanvas click semantics:
 *  - scroll-target selection mode redirects the click to its callback;
 *  - element-picker mode redirects to its callback;
 *  - preview mode ignores selection;
 *  - click on empty body clears the selection.
 *
 * Listeners are attached on the CAPTURE phase so we intercept before any
 * in-page handler runs. Because every srcdoc swap replaces the document, this
 * attach function must be re-invoked from the iframe `load` handler; it
 * returns a cleanup that the caller stores and runs before re-attaching.
 */

import type { ComponentRect } from '@/lib/builder/iframeTypes';
import { INLINE_TEXT_TYPES } from '@/lib/builder/iframeTypes';
import { findComponentId } from '@/lib/builder/iframeBridge';
import { useBuilderStore } from '@/stores/builder';
import { startInlineEdit } from './iframeInlineEdit';

export interface SelectionHandlers {
    /** Hovered component id (null when over empty canvas). Debounced ~50ms. */
    onHoveredId: (id: string | null) => void;
    /** Fired after each click resolution with the rect map (for overlay sync). */
    onAfterSelect?: (rects: ComponentRect[]) => void;
}

const HOVER_DEBOUNCE_MS = 50;

/**
 * Attach capture-phase click / mousemove / dblclick listeners to a document.
 * Returns a cleanup function. Pure (no React) — the store is read via
 * `useBuilderStore.getState()` so handlers always see fresh state without
 * re-binding.
 */
export function attachIframeSelection(
    doc: Document,
    handlers: SelectionHandlers,
): () => void {
    const cleanups: Array<() => void> = [];
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;

    const onClick = (e: Event) => {
        const target = e.target as HTMLElement | null;
        const state = useBuilderStore.getState();

        // 1. Scroll-target selection mode: hand the id + type to the callback.
        if (state.scrollTargetSelectionMode && state.scrollTargetCallback) {
            const id = findComponentId(target);
            if (id) {
                e.preventDefault();
                e.stopPropagation();
                const el = doc.getElementById(id);
                const type = el?.getAttribute('data-fb-component') || 'Section';
                state.scrollTargetCallback(id, type);
                state.exitScrollTargetMode();
            }
            return;
        }

        // 2. Element-picker mode: redirect to its callback.
        if (state.elementPickerMode?.active && state.elementPickerMode.callback) {
            const id = findComponentId(target);
            if (id) {
                e.preventDefault();
                e.stopPropagation();
                state.elementPickerMode.callback(id);
                state.cancelElementPicker();
            }
            return;
        }

        // 3. Preview mode: no selection.
        if (state.isPreviewMode) return;

        const id = findComponentId(target);
        e.preventDefault();
        e.stopPropagation();
        if (id) {
            // Toggle selection on repeated click of the same component.
            state.setSelectedComponentId(state.selectedComponentId === id ? null : id);
        } else {
            // Click on empty canvas body → clear selection.
            state.setSelectedComponentId(null);
        }
    };

    const onMouseMove = (e: Event) => {
        const target = e.target as HTMLElement | null;
        const hit = target?.closest('[data-fb-id]') as HTMLElement | null;
        const id = hit?.getAttribute('data-fb-id') ?? null;
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => handlers.onHoveredId(id), HOVER_DEBOUNCE_MS);
    };

    const onDblClick = (e: Event) => {
        const target = e.target as HTMLElement | null;
        const state = useBuilderStore.getState();
        if (state.isPreviewMode) return;

        const id = findComponentId(target);
        if (!id) return;
        const root = doc.getElementById(id);
        if (!root) return;
        const type = root.getAttribute('data-fb-component') || '';
        if (!INLINE_TEXT_TYPES.has(type)) return;

        e.preventDefault();
        e.stopPropagation();
        startInlineEdit(root, id, (commit) => {
            useBuilderStore.getState().updateComponentText(commit.componentId, commit.property, commit.text);
        });
    };

    // Capture phase → intercept before in-page handlers.
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('mousemove', onMouseMove, true);
    doc.addEventListener('dblclick', onDblClick, true);

    cleanups.push(() => {
        doc.removeEventListener('click', onClick, true);
        doc.removeEventListener('mousemove', onMouseMove, true);
        doc.removeEventListener('dblclick', onDblClick, true);
    });
    cleanups.push(() => {
        if (hoverTimer) clearTimeout(hoverTimer);
    });

    return () => cleanups.forEach((fn) => fn());
}
