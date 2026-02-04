/**
 * Variable Store - 3 Scope State Management
 *
 * Provides unified state management for SSR pages:
 * - Page Variables: In-memory, temporary UI state (cleared on refresh)
 * - Session Variables: localStorage sync, cleared on logout
 * - Cookies: Persistent, server-readable (auth, theme, consent)
 *
 * Edge-compatible: Uses vanilla patterns, no Node.js dependencies.
 */
/**
 * Create a new variable store instance.
 * For SSR, this is created per-request.
 * For client hydration, this syncs with localStorage.
 */
export function createVariableStore(initialState) {
    // Internal state
    const pageVariables = { ...initialState?.pageVariables };
    const sessionVariables = { ...initialState?.sessionVariables };
    const cookies = { ...initialState?.cookies };
    // Cookie options storage (for client-side setting)
    const cookieOptions = {};
    return {
        // =========================================================================
        // Page Variables (In-memory, cleared on refresh)
        // =========================================================================
        getPageVariable(key) {
            return pageVariables[key];
        },
        setPageVariable(key, value) {
            pageVariables[key] = value;
        },
        getPageVariables() {
            return { ...pageVariables };
        },
        // =========================================================================
        // Session Variables (localStorage sync, cleared on logout)
        // =========================================================================
        getSessionVariable(key) {
            return sessionVariables[key];
        },
        setSessionVariable(key, value) {
            sessionVariables[key] = value;
        },
        getSessionVariables() {
            return { ...sessionVariables };
        },
        // =========================================================================
        // Cookies (Persistent, server-readable)
        // =========================================================================
        getCookie(key) {
            return cookies[key];
        },
        setCookie(key, value, options) {
            cookies[key] = value;
            if (options) {
                cookieOptions[key] = options;
            }
        },
        getCookies() {
            return { ...cookies };
        },
        // =========================================================================
        // Variable Resolution (for dynamic binding in components)
        // =========================================================================
        /**
         * Resolve a variable expression.
         * Supports prefixed notation:
         * - `page.variableName` → Page variable
         * - `session.variableName` → Session variable
         * - `cookie.cookieName` → Cookie value
         * - `variableName` → Auto-search (page → session → cookie)
         */
        resolveVariable(expression) {
            if (!expression)
                return undefined;
            // Handle prefixed access
            if (expression.startsWith('page.')) {
                return pageVariables[expression.slice(5)];
            }
            if (expression.startsWith('session.')) {
                return sessionVariables[expression.slice(8)];
            }
            if (expression.startsWith('cookie.')) {
                return cookies[expression.slice(7)];
            }
            // Auto-search: page → session → cookie
            if (expression in pageVariables) {
                return pageVariables[expression];
            }
            if (expression in sessionVariables) {
                return sessionVariables[expression];
            }
            if (expression in cookies) {
                return cookies[expression];
            }
            return undefined;
        },
        // =========================================================================
        // Utility
        // =========================================================================
        clearSessionVariables() {
            Object.keys(sessionVariables).forEach(key => delete sessionVariables[key]);
        },
    };
}
/**
 * Client-side store initialization.
 * Creates a store that syncs with localStorage for session variables.
 */
export function createClientStore(initialState) {
    // Load session variables from localStorage
    let storedSession = {};
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            const stored = localStorage.getItem('fb_session_variables');
            if (stored) {
                storedSession = JSON.parse(stored);
            }
        }
        catch (e) {
            console.warn('Failed to load session variables from localStorage:', e);
        }
    }
    // Merge initial state with stored session
    const mergedSession = { ...storedSession, ...initialState?.sessionVariables };
    // Create base store
    const store = createVariableStore({
        ...initialState,
        sessionVariables: mergedSession,
    });
    // Wrap setSessionVariable to sync with localStorage
    const originalSetSession = store.setSessionVariable.bind(store);
    store.setSessionVariable = (key, value) => {
        originalSetSession(key, value);
        // Sync to localStorage
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                const current = store.getSessionVariables();
                localStorage.setItem('fb_session_variables', JSON.stringify(current));
            }
            catch (e) {
                console.warn('Failed to save session variable to localStorage:', e);
            }
        }
    };
    // Wrap clearSessionVariables to clear localStorage
    const originalClear = store.clearSessionVariables.bind(store);
    store.clearSessionVariables = () => {
        originalClear();
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                localStorage.removeItem('fb_session_variables');
            }
            catch (e) {
                console.warn('Failed to clear session variables from localStorage:', e);
            }
        }
    };
    return store;
}
