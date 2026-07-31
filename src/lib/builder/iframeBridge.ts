/**
 * iframeBridge — pure (non-React) helpers that mediate between the React
 * builder shell and the eSSR iframe canvas.
 *
 * Responsibilities:
 *  - resolveBuilderApiUrl / fetchReRender: POST the layout to the framework
 *    worker's /builder/api/reRender endpoint and return the HTML document.
 *  - buildReRenderRequest: shape the product Page into the request body.
 *  - stampComponentIds: THE load-bearing gap fix. The eSSR renderer emits
 *    `id="${id}"` on every real component root (static.ts getCommonAttributes)
 *    but `data-fb-id` / `data-fb-component` ONLY on unknown-component
 *    fallbacks (PageRenderer). The bridge stamps them itself after every
 *    srcdoc swap so the framework's `closest('[data-fb-id]')` selection logic
 *    works against real components. This mutates ONLY the iframe DOM — the
 *    published HTML stays byte-identical.
 *  - queryComponentRects / findComponentId / findNodeLocation: tree + DOM
 *    geometry helpers shared by the selection and DnD hooks.
 */

import type { ComponentData, Page } from '@/types/builder';
import type {
    ComponentRect,
    NodeLocation,
    PageLayoutLike,
    ReRenderRequest,
    ReRenderResponse,
} from './iframeTypes';

/**
 * Resolve the URL for a builder API call.
 *
 * In production the console is served FROM the framework worker (cf-full,
 * CF-22 system edge), so a relative path (`/builder/api/reRender`) is
 * same-origin and the `fb_session` cookie is sent with `credentials:'include'`.
 *
 * In Vite dev (:5173) `/builder` is NOT proxied (vite.config.ts is outside
 * this phase's allowlist). Callers MAY pass an absolute system-edge URL
 * (`engine.url` where `engine.is_system === true`), which routes the fetch
 * cross-origin — that requires CORS + SameSite=None on `fb_session`. Until
 * infra picks one of the two remedies (see openQuestions), the bridge defaults
 * to the same-origin relative URL, which is correct wherever the console is
 * served from the worker.
 */
export function resolveBuilderApiUrl(path: string, systemEdgeUrl?: string): string {
    if (systemEdgeUrl) {
        const base = systemEdgeUrl.replace(/\/+$/, '');
        return `${base}${path.startsWith('/') ? path : `/${path}`}`;
    }
    return path;
}

export interface FetchReRenderOptions {
    systemEdgeUrl?: string;
    signal?: AbortSignal;
}

/** POST the layout to /builder/api/reRender and return the rendered HTML
 *  document string. Throws on non-2xx or `{ error }` body. */
export async function fetchReRender(
    body: ReRenderRequest,
    opts: FetchReRenderOptions = {},
): Promise<string> {
    const url = resolveBuilderApiUrl('/builder/api/reRender', opts.systemEdgeUrl);
    const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
    });
    if (!res.ok) {
        let detail = '';
        try {
            const data = (await res.json()) as ReRenderResponse;
            detail = data?.error ?? '';
        } catch {
            /* non-JSON error body — ignore */
        }
        throw new Error(`reRender failed (${res.status})${detail ? `: ${detail}` : ''}`);
    }
    const data = (await res.json()) as ReRenderResponse;
    if (data.error) throw new Error(`reRender error: ${data.error}`);
    return data.html;
}

/** Shape the product Page into the POST /builder/api/reRender body. */
export function buildReRenderRequest(page: Page): ReRenderRequest {
    const layout: PageLayoutLike = {
        content: page.layoutData?.content ?? [],
        root: page.layoutData?.root ?? {},
    };
    return {
        layout,
        pageData: {
            title: page.title ?? page.name ?? '',
            slug: page.slug ?? '',
            description: page.description,
        },
    };
}

/** Walk a layout content tree depth-first, invoking the visitor for each node. */
export function walkLayout(
    nodes: ComponentData[],
    visitor: (node: ComponentData, parentId: string | undefined, depth: number) => void,
): void {
    const recurse = (list: ComponentData[], parentId: string | undefined, depth: number) => {
        for (const node of list) {
            visitor(node, parentId, depth);
            if (node.children && node.children.length > 0) {
                recurse(node.children, node.id, depth + 1);
            }
        }
    };
    recurse(nodes, undefined, 0);
}

/**
 * Stamp `data-fb-id` + `data-fb-component` onto every real component root in
 * the iframe document. The eSSR renderer already puts `id="${id}"` on every
 * real root and component ids are unique, so `getElementById` is a direct
 * O(N) lookup. Re-run after EVERY srcdoc swap (the whole document is replaced).
 */
export function stampComponentIds(doc: Document, nodes: ComponentData[]): void {
    walkLayout(nodes, (node) => {
        const el = doc.getElementById(node.id);
        if (el) {
            el.setAttribute('data-fb-id', node.id);
            el.setAttribute('data-fb-component', node.type);
        }
    });
}

/**
 * Query every `[data-fb-id]` element in the iframe and return its rect in the
 * iframe's viewport-local coordinate space. `getBoundingClientRect()` on an
 * element inside `iframe.contentDocument` returns coords relative to the
 * iframe's own viewport (already accounting for internal scroll), which map
 * 1:1 to the sibling overlay's coordinate space.
 */
export function queryComponentRects(doc: Document): ComponentRect[] {
    const out: ComponentRect[] = [];
    const elements = doc.querySelectorAll<HTMLElement>('[data-fb-id]');
    elements.forEach((el) => {
        const id = el.getAttribute('data-fb-id');
        const type = el.getAttribute('data-fb-component');
        if (!id || !type) return;
        const r = el.getBoundingClientRect();
        out.push({
            id,
            type,
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            parentId: findParentId(el),
            depth: computeDepth(el),
        });
    });
    return out;
}

/** Resolve the data-fb-id for an element by walking up to the closest stamp. */
export function findComponentId(el: Element | null): string | null {
    if (!el) return null;
    const hit = el.closest('[data-fb-id]') as HTMLElement | null;
    return hit?.getAttribute('data-fb-id') ?? null;
}

/** Find the immediate stamped parent of an element (undefined at root). */
function findParentId(el: HTMLElement): string | undefined {
    const parent = el.parentElement?.closest('[data-fb-id]') as HTMLElement | undefined;
    return parent?.getAttribute('data-fb-id') ?? undefined;
}

/** Count stamped ancestors (0 at top level). */
function computeDepth(el: HTMLElement): number {
    let depth = 0;
    let current: HTMLElement | null = el.parentElement;
    while (current) {
        if (current.hasAttribute('data-fb-id')) depth++;
        current = current.parentElement;
    }
    return depth;
}

/**
 * Locate a node in the layout tree by id, returning the component, its sibling
 * index, and its immediate parent id. Used to seed @dnd-kit `active.data` for
 * reorder (mirrors the data shape DraggableComponent previously emitted).
 */
export function findNodeLocation(
    nodes: ComponentData[],
    id: string,
    parentId: string | undefined = undefined,
): NodeLocation | null {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.id === id) {
            return { component: node, index: i, parentId };
        }
        if (node.children && node.children.length > 0) {
            const inner = findNodeLocation(node.children, id, node.id);
            if (inner) return inner;
        }
    }
    return null;
}
