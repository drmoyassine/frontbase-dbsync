/**
 * HTML Document Generator
 *
 * Generates the full HTML document shell for SSR-rendered pages.
 * Extracted from routes/pages.ts for single-responsibility compliance.
 */

import { TrackingConfig } from './lib/tracking.js';
import { FALLBACK_CSS } from './baseStyles.js';

// Cache-busting version - update this when hydration scripts change
const HYDRATE_VERSION = '20260404a';

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

/** Auth config for client-side SDK (Realtime subscription + signOut) */
export interface AuthConfig {
    url: string;              // Supabase project URL
    anonKey: string;          // Supabase anon key
    contactsTable: string;    // Table name for contact records
    authUserIdColumn: string; // Column to match auth user ID
    accessToken?: string;     // User's JWT for RLS-authenticated Realtime
}

/**
 * Generate the full HTML document for an SSR-rendered page.
 */
export function generateHtmlDocument(
    page: HtmlPageData,
    bodyHtml: string,
    initialState: Record<string, unknown>,
    trackingConfig: TrackingConfig,
    faviconUrl: string = DEFAULT_FAVICON,
    authConfig?: AuthConfig | null
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
    
    <!-- Frontbase Client SDK -->
    <script>
        // Initialize window.frontbase SDK
        (function() {
            var STORAGE_KEY = 'frontbase_user';

            // Sync SSR user state to localStorage
            try {
                var state = window.__INITIAL_STATE__;
                if (state && state.user) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.user));
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                }
            } catch (e) {
                console.warn('[Frontbase] Failed to sync user to localStorage:', e);
            }

            // Public SDK
            window.frontbase = {
                _channel: null,
                _supabase: null,

                get user() {
                    try {
                        var raw = localStorage.getItem(STORAGE_KEY);
                        return raw ? JSON.parse(raw) : null;
                    } catch (e) { return null; }
                },

                signOut: function(redirectTo) {
                    // 1. Unsubscribe Realtime
                    if (this._channel && this._supabase) {
                        this._supabase.removeChannel(this._channel);
                        this._channel = null;
                    }
                    // 2. Clear localStorage
                    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
                    // 3. POST to logout endpoint
                    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
                        .finally(function() {
                            window.location.href = redirectTo || '/';
                        });
                }
            };
        })();
    </script>
${authConfig ? `
    <!-- Supabase Realtime (async, only for logged-in users) -->
    <script>
    (function() {
        var user = window.__INITIAL_STATE__ && window.__INITIAL_STATE__.user;
        if (!user) return;

        var cfg = ${safeJsonStringify(authConfig)};
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        script.async = true;
        script.onload = function() {
            try {
                var sb = supabase.createClient(cfg.url, cfg.anonKey);
                window.frontbase._supabase = sb;

                // Set authenticated session so Realtime has RLS permissions
                if (cfg.accessToken) {
                    sb.realtime.setAuth(cfg.accessToken);
                }

                var channel = sb.channel('user-contact-' + user.id)
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: cfg.contactsTable,
                        filter: cfg.authUserIdColumn + '=eq.' + user.id
                    }, function(payload) {
                        console.log('[Frontbase] Realtime UPDATE:', payload.new);
                        var current = window.frontbase.user || {};
                        var merged = Object.assign({}, current, payload.new);
                        try {
                            localStorage.setItem('frontbase_user', JSON.stringify(merged));
                        } catch (e) {}

                        // Soft refresh: re-fetch page and swap #root content
                        fetch(window.location.href, { credentials: 'same-origin' })
                            .then(function(r) { return r.text(); })
                            .then(function(html) {
                                var parser = new DOMParser();
                                var doc = parser.parseFromString(html, 'text/html');
                                var newRoot = doc.getElementById('root');
                                var oldRoot = document.getElementById('root');
                                if (newRoot && oldRoot) {
                                    oldRoot.innerHTML = newRoot.innerHTML;
                                    console.log('[Frontbase] Page content refreshed with new user data');
                                }
                            })
                            .catch(function(err) {
                                console.warn('[Frontbase] Soft refresh failed:', err);
                            });

                        window.dispatchEvent(new CustomEvent('frontbase:user-updated', { detail: merged }));
                    })
                    .subscribe(function(status) {
                        console.log('[Frontbase] Realtime status:', status);
                    });

                window.frontbase._channel = channel;
            } catch (err) {
                console.warn('[Frontbase] Realtime setup failed:', err);
            }
        };
        document.head.appendChild(script);
    })();
    </script>
` : ''}
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
