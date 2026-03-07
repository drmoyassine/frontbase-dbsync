/**
 * HTML Document Generator
 *
 * Generates the full HTML document shell for SSR-rendered pages.
 * Extracted from routes/pages.ts for single-responsibility compliance.
 */

import { TrackingConfig } from './lib/tracking.js';
import { FALLBACK_CSS } from './baseStyles.js';

// Cache-busting version - update this when hydration scripts change
const HYDRATE_VERSION = '20260205h';

// Default favicon path constant
const DEFAULT_FAVICON = '/static/icon.png';

// Reuse the PageData interface shape from pages route
export interface HtmlPageData {
    id: string;
    slug: string;
    name: string;
    title?: string;
    description?: string;
    keywords?: string;
    layoutData: unknown;
    datasources?: unknown[];
    cssBundle?: string;
}

/**
 * Generate the full HTML document for an SSR-rendered page.
 */
export function generateHtmlDocument(
    page: HtmlPageData,
    bodyHtml: string,
    initialState: Record<string, unknown>,
    trackingConfig: TrackingConfig,
    faviconUrl: string = DEFAULT_FAVICON
): string {
    const title = page.title || page.name;
    const description = page.description || '';
    const keywords = page.keywords || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
    ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
    <meta name="generator" content="Frontbase">
    
    <!-- Favicon -->
    <link rel="icon" type="image/png" href="${faviconUrl}">
    <link rel="apple-touch-icon" href="${faviconUrl}">
    
    <!-- Prefetch hydration bundle -->
    <link rel="modulepreload" href="/static/react/hydrate.js?v=${HYDRATE_VERSION}">

    <!-- Client-Side Visitor Context Enhancement -->
    <script>
    (function() {
        if (sessionStorage.getItem('visitor-enhanced')) return;
        
        // Configuration from advancedVariables
        const adv = ${JSON.stringify(trackingConfig.advancedVariables || {})};
        const data = {};

        // Timezone as UTC offset (+3, -5.5)
        if (adv.timezone?.collect !== false) {
            const offset = -new Date().getTimezoneOffset() / 60;
            data.tz = (offset >= 0 ? '+' : '') + offset;
        }

        // Viewport only
        if (adv.viewport?.collect !== false) {
            data.vp = innerWidth + 'x' + innerHeight;
        }

        // Theme preference
        if (adv.themePreference?.collect !== false) {
            data.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        // Connection type
        if (adv.connectionType?.collect !== false && navigator.connection) {
            data.conn = navigator.connection.effectiveType;
        }

        if (Object.keys(data).length > 0) {
            document.cookie = "visitor-enhanced=" + encodeURIComponent(JSON.stringify(data)) + "; path=/; max-age=31536000; SameSite=Lax";
            sessionStorage.setItem('visitor-enhanced', '1');
        }
    })();
    </script>
    
    <!-- Base styles (from CSS Bundle or fallback) -->
    <style>
        ${page.cssBundle || FALLBACK_CSS}
    </style>
</head>
<body>
    <div id="root">${bodyHtml}</div>
    
    <!-- Initial state for hydration -->
    <script>
        window.__INITIAL_STATE__ = ${safeJsonStringify(initialState)};
        window.__PAGE_DATA__ = ${safeJsonStringify({
        id: page.id,
        slug: page.slug,
        layoutData: page.layoutData,
        datasources: page.datasources
    })};
    </script>
    
    <!-- Hydration bundle (all interactive components) -->
    <script type="module" src="/static/react/hydrate.js?v=${HYDRATE_VERSION}"></script>
</body>
</html>`;
}

/**
 * Safely stringify JSON for embedding in <script> tags.
 * Escapes </script> sequences to prevent user content from breaking the page.
 */
export function safeJsonStringify(obj: unknown): string {
    return JSON.stringify(obj)
        .replace(/<\/script>/gi, '<\\/script>')
        .replace(/<!--/g, '<\\!--');
}

/**
 * Escape HTML special characters for safe attribute embedding.
 */
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
