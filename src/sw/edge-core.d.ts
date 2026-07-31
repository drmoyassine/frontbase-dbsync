/**
 * Ambient type shim for @frontbase/edge-core — Phase E SW build only.
 *
 * WHY THIS EXISTS
 * @frontbase/edge-core is NOT a dependency of this product repo and is not on
 * tsconfig.app.json `paths`. The SW source (builder-sw.ts) imports the bare
 * specifier `@frontbase/edge-core` to mirror the framework cf-full worker's
 * import (HARD RULE: version-pin to the SAME workspace package). At BUNDLE
 * time, the vite `builderSwPlugin` esbuild pass resolves that specifier via an
 * `alias` to the framework workspace's compiled
 * packages/edge-core/dist/index.js — so the shipped SW contains the REAL
 * edge-core code, byte-identical to what the worker serves. esbuild ignores
 * this .d.ts entirely.
 *
 * This shim exists ONLY so `tsc --noEmit -p tsconfig.app.json` can type-check
 * builder-sw.ts against the signatures the SW actually calls. It declares the
 * exact surface the SW uses (verified against
 * frontbase-framework/packages/edge-core/src/{ssr/PageRenderer,shell}.ts).
 * It will never conflict with the real package because tsc cannot resolve the
 * real module here (so this is the sole declaration source).
 *
 * If edge-core's renderPage/renderDocument signatures change, update BOTH this
 * shim AND re-verify byte-parity vs /builder/api/reRender.
 */

declare module '@frontbase/edge-core' {
    export interface PageComponent {
        id: string;
        type: string;
        props?: Record<string, unknown>;
        styles?: Record<string, unknown>;
        stylesData?: Record<string, unknown>;
        binding?: Record<string, unknown>;
        visibility?: { mobile: boolean; tablet: boolean; desktop: boolean };
        visibilityCondition?: string;
        children?: PageComponent[];
        [key: string]: unknown;
    }

    export interface PageLayoutData {
        content: PageComponent[];
        root?: Record<string, unknown>;
    }

    export interface ShellOptions {
        environment: string;
        /** Emit the /sw.js registration script (edge path only). */
        registerServiceWorker: boolean;
        /** Minified behaviors runtime inlined before </body>. */
        behaviorsBundle?: string;
    }

    export type PageEntry = {
        title: string;
        slug: string;
        description?: string;
        layout: PageLayoutData;
        cssBundle?: string;
    };

    /**
     * Render a page layout to an HTML body string. Pure string renderer — no
     * DOM/window access (safe in a ServiceWorkerGlobalScope).
     */
    export function renderPage(
        layoutData: PageLayoutData,
        context: Record<string, unknown>,
    ): Promise<string>;

    /**
     * Wrap a rendered body in the full HTML document shell (FALLBACK_CSS,
     * <head>, #root). Pure string renderer.
     */
    export function renderDocument(
        page: PageEntry,
        bodyHtml: string,
        opts: ShellOptions,
    ): string;
}
