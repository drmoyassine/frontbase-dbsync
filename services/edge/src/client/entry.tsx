/**
 * React Hydration Entry Point with React Query
 * 
 * Selectively hydrates React components on SSR pages.
 * Includes QueryClientProvider for @frontbase/datatable caching.
 */

import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataTable } from '../components/UnifiedDataTable';
import { Form } from '../components/form/Form';
import { InfoList } from '../components/infolist/InfoList';
import './globals.css';

// Create QueryClient with sensible defaults for SSR hydration
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60_000, // 1 minute
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

// Component registry
const components: Record<string, React.ComponentType<any>> = {
    DataTable,
    datatable: DataTable, // lowercase alias
    Form,
    form: Form, // lowercase alias
    InfoList,
    infolist: InfoList, // lowercase alias
};

// Hydrate all React components
function hydrateReactComponents() {
    console.log('🔄 React hydration starting...');

    // Find all elements marked for React hydration
    const elements = document.querySelectorAll('[data-react-component], [data-fb-hydrate="datatable"], [data-fb-hydrate="form"], [data-fb-hydrate="infolist"]');

    elements.forEach((element) => {
        // Handle both new data-react-component and legacy data-fb-hydrate
        const hydrateType = element.getAttribute('data-fb-hydrate');
        const componentName = element.getAttribute('data-react-component') ||
            (hydrateType === 'datatable' ? 'DataTable' : hydrateType === 'form' ? 'Form' : hydrateType === 'infolist' ? 'InfoList' : null);

        const propsAttr = element.getAttribute('data-react-props') || element.getAttribute('data-fb-props');

        if (!componentName) return;

        const Component = components[componentName] || components[componentName.toLowerCase()];

        if (!Component) {
            console.warn(`[React Hydrate] Unknown component: ${componentName}`);
            return;
        }

        try {
            const props = propsAttr ? JSON.parse(propsAttr) : {};

            // Also try to get binding from __PAGE_DATA__
            const pageData = (window as any).__PAGE_DATA__;
            if (pageData?.layoutData?.content) {
                const componentId = element.id || element.getAttribute('data-component-id') || element.getAttribute('data-fb-id');
                if (componentId) {
                    const componentDef = findComponentById(pageData.layoutData.content, componentId);
                    // Check binding in root (correct) or props (legacy)
                    const binding = componentDef?.binding || componentDef?.props?.binding;
                    if (binding) {
                        props.binding = { ...props.binding, ...binding };
                    }
                }
            }

            console.log(`[React Hydrate] Hydrating ${componentName}`, props);

            const reactTree = (
                <StrictMode>
                    <QueryClientProvider client={queryClient}>
                        <Component {...props} />
                    </QueryClientProvider>
                </StrictMode>
            );

            // SSR outputs skeleton placeholders, not matching React renders.
            // Always use createRoot to replace skeleton with interactive component.
            element.innerHTML = '';
            const root = createRoot(element);
            root.render(reactTree);
        } catch (err) {
            console.error(`[React Hydrate] Failed to hydrate ${componentName}:`, err);
        }
    });

    console.log('✅ React hydration complete');
}

// Helper to find component by ID in layout
function findComponentById(components: any[], id: string): any {
    for (const comp of components) {
        if (comp.id === id) return comp;
        if (comp.children) {
            const found = findComponentById(comp.children, id);
            if (found) return found;
        }
    }
    return null;
}

// Run hydration when DOM is ready
if (typeof window !== 'undefined') {
    const initAll = () => {
        hydrateReactComponents();
        initMobileMenuToggle();
        initSmoothScroll();
        initNavigation();
        
        // Initialize Variable Store & Action Delegation
        const store = new VariableStore();
        (window as any).__VARIABLE_STORE__ = store;
        if ((window as any).frontbase) {
            (window as any).frontbase.variableStore = store;
        }
        
        // Listen for store changes to toggle visibility
        store.subscribe(() => {
            updateVisibilityToggles(store);
        });
        
        // Initial run
        updateVisibilityToggles(store);
        
        // Delegate button clicks and success handlers
        initActionDelegation(store);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
    } else {
        initAll();
    }
}

// Initialize mobile menu toggle for SSR Navbar
function initMobileMenuToggle() {
    const toggleButtons = document.querySelectorAll('[data-fb-mobile-menu-toggle]');

    toggleButtons.forEach((button) => {
        const navbar = button.closest('header');
        const mobileMenu = navbar?.querySelector('[data-fb-mobile-menu]');

        if (!mobileMenu) return;

        button.addEventListener('click', () => {
            const isHidden = mobileMenu.classList.contains('hidden');

            if (isHidden) {
                mobileMenu.classList.remove('hidden');
                // Swap hamburger icon to X
                button.innerHTML = `
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                `;
            } else {
                mobileMenu.classList.add('hidden');
                // Swap X icon back to hamburger
                button.innerHTML = `
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                    </svg>
                `;
            }
        });
    });

    console.log(`📱 Mobile menu toggle initialized for ${toggleButtons.length} navbar(s)`);
}

// Initialize smooth scrolling for data-scroll-to links
function initSmoothScroll() {
    const scrollLinks = document.querySelectorAll('[data-scroll-to]');

    scrollLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('data-scroll-to');
            if (!targetId) return;

            // Remove # prefix if present for getElementById
            const cleanId = targetId.startsWith('#') ? targetId.slice(1) : targetId;

            // Use getElementById to avoid CSS selector issues with numeric IDs
            const target = document.getElementById(cleanId);

            if (target) {
                e.preventDefault();

                // Close mobile menu if open
                const mobileMenu = document.querySelector('[data-fb-mobile-menu]');
                if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                    mobileMenu.classList.add('hidden');

                    // Reset hamburger icon if possible
                    const toggleBtn = document.querySelector('[data-fb-mobile-menu-toggle]');
                    if (toggleBtn) {
                        toggleBtn.innerHTML = `
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                            </svg>
                        `;
                    }
                }

                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });

                // Update URL hash without jumping
                history.pushState(null, '', '#' + cleanId);
            } else {
                console.warn('[SmoothScroll] Target not found:', cleanId);
            }
        });
    });

    console.log(`✨ Smooth scroll initialized for ${scrollLinks.length} links`);
}

// Initialize navigation for data-navigate-to buttons
function initNavigation() {
    const navButtons = document.querySelectorAll('[data-navigate-to]');

    navButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const url = button.getAttribute('data-navigate-to');
            if (!url) return;

            e.preventDefault();

            const openInNewTab = button.getAttribute('data-navigate-new-tab') === 'true';

            if (openInNewTab) {
                window.open(url, '_blank', 'noopener,noreferrer');
            } else {
                window.location.href = url;
            }
        });
    });

    console.log(`🔗 Navigation initialized for ${navButtons.length} buttons`);
}

// Expose for debugging
if (typeof window !== 'undefined') {
    (window as any).__REACT_COMPONENTS__ = components;
    (window as any).__REACT_QUERY_CLIENT__ = queryClient;
}

class VariableStore {
    local: Record<string, any> = {};
    session: Record<string, any> = {};
    cookies: Record<string, any> = {};
    url: Record<string, any> = {};
    app: Record<string, any> = {};
    listeners: Set<() => void> = new Set();

    constructor() {
        this.hydrate();
    }

    hydrate() {
        const pageData = (window as any).__PAGE_DATA__;
        const root = pageData?.layoutData?.root || {};

        // 1. Hydrate URL parameters
        if (typeof window !== 'undefined') {
            const searchParams = new URLSearchParams(window.location.search);
            for (const [key, value] of searchParams.entries()) {
                this.url[key] = value;
            }
        }

        // 2. Hydrate cookies
        if (typeof document !== 'undefined') {
            const rawCookies = document.cookie.split(';');
            for (const cookie of rawCookies) {
                const parts = cookie.split('=');
                if (parts.length === 2) {
                    const key = parts[0].trim();
                    const value = decodeURIComponent(parts[1].trim());
                    this.cookies[key] = value;
                }
            }
        }

        // 3. Hydrate app variables (baked at publish time)
        if (pageData && pageData.appVariables) {
            this.app = { ...pageData.appVariables };
        }

        // 4. Hydrate session variables (from sessionStorage or defaults)
        const sessionDefs = root.sessionVariables || {};
        for (const [name, def] of Object.entries(sessionDefs)) {
            const saved = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`fb_session:${name}`) : null;
            if (saved !== null) {
                this.session[name] = this.castValue(saved, (def as any).type);
            } else {
                this.session[name] = (def as any).defaultValue;
            }
        }

        // 5. Hydrate local variables (page state, initialized with defaults)
        const localDefs = root.localVariables || {};
        for (const [name, def] of Object.entries(localDefs)) {
            this.local[name] = (def as any).defaultValue;
        }
    }

    castValue(val: any, type: string): any {
        if (val === null || val === undefined) return val;
        if (type === 'boolean') {
            return String(val) === 'true';
        }
        if (type === 'number') {
            const num = Number(val);
            return isNaN(num) ? 0 : num;
        }
        return String(val);
    }

    get(scope: string, key: string): any {
        if (scope === 'local') return this.local[key];
        if (scope === 'session') return this.session[key];
        if (scope === 'cookies') return this.cookies[key];
        if (scope === 'url') return this.url[key];
        if (scope === 'app') return this.app[key];
        return undefined;
    }

    set(scope: string, key: string, value: any) {
        let changed = false;

        if (scope === 'local') {
            const prev = this.local[key];
            this.local[key] = value;
            changed = prev !== value;
        } else if (scope === 'session') {
            const prev = this.session[key];
            this.session[key] = value;
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(`fb_session:${key}`, String(value));
            }
            changed = prev !== value;
        } else if (scope === 'cookies') {
            const prev = this.cookies[key];
            this.cookies[key] = value;
            if (typeof document !== 'undefined') {
                document.cookie = `${key}=${encodeURIComponent(String(value))}; path=/; max-age=31536000; SameSite=Lax`;
            }
            changed = prev !== value;
        } else if (scope === 'url') {
            const prev = this.url[key];
            this.url[key] = value;
            if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set(key, String(value));
                window.history.replaceState(null, '', url.pathname + url.search);
            }
            changed = prev !== value;
        }

        if (changed) {
            this.notify();
        }
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    notify() {
        for (const listener of this.listeners) {
            listener();
        }
    }
}

function getPath(obj: any, path: string): any {
    const parts = path.trim().split('.');
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }
    return current;
}

function normalizeExpression(expr: string): string {
    return expr
        .replace(/\[['"]([^'"]+)['"]\]/g, '.$1')
        .replace(/\[(\d+)\]/g, '.$1');
}

function safeEval(expression: string, data: Record<string, any>): any {
    expression = normalizeExpression(expression.trim());

    if (expression === 'true') return true;
    if (expression === 'false') return false;
    if (expression === 'null') return null;
    if (expression === 'undefined') return undefined;

    if (/^\d+(\.\d+)?$/.test(expression)) {
        return Number(expression);
    }

    const stringMatch = expression.match(/^['"](.*)['"]$/);
    if (stringMatch) {
        return stringMatch[1];
    }

    if (expression.startsWith('!')) {
        return !safeEval(expression.substring(1), data);
    }

    if (expression.includes('||')) {
        const parts = expression.split('||');
        for (const part of parts) {
            const val = safeEval(part, data);
            if (val) return val;
        }
        return safeEval(parts[parts.length - 1], data);
    }

    if (expression.includes('&&')) {
        const parts = expression.split('&&');
        let val: any = true;
        for (const part of parts) {
            val = safeEval(part, data);
            if (!val) return val;
        }
        return val;
    }

    const operators = ['===', '!==', '==', '!=', '>=', '<=', '>', '<', ' contains '];
    for (const op of operators) {
        if (expression.includes(op)) {
            const parts = expression.split(op).map(p => p.trim());
            if (parts.length === 2) {
                const left = safeEval(parts[0], data);
                const right = safeEval(parts[1], data);
                switch (op.trim()) {
                    case '===':
                    case '==':
                        return left === right;
                    case '!==':
                    case '!=':
                        return left !== right;
                    case '>=':
                        return left >= right;
                    case '<=':
                        return left <= right;
                    case '>':
                        return left > right;
                    case '<':
                        return left < right;
                    case 'contains':
                        if (Array.isArray(left)) {
                            return left.includes(right);
                        }
                        if (typeof left === 'string') {
                            return left.includes(String(right));
                        }
                        return false;
                }
            }
        }
    }

    return getPath(data, expression);
}

function evaluateCondition(condition: string, store: VariableStore): boolean {
    if (!condition) return true;
    try {
        const evalData = {
            local: store.local,
            session: store.session,
            cookies: store.cookies,
            url: store.url,
            app: store.app,
            page: (window as any).__PAGE_DATA__ || {},
            user: (window as any).__USER_CONTEXT__ || {}
        };
        return !!safeEval(condition, evalData);
    } catch (err) {
        console.warn(`[Visibility Evaluator] Error evaluating condition "${condition}":`, err);
        return true; 
    }
}

function updateVisibilityToggles(store: VariableStore) {
    const elements = document.querySelectorAll('[data-show-if]');
    elements.forEach((element) => {
        const condition = element.getAttribute('data-show-if');
        if (!condition) return;

        const isVisible = evaluateCondition(condition, store);
        if (isVisible) {
            if ((element as HTMLElement).style.display === 'none') {
                (element as HTMLElement).style.display = '';
            }
        } else {
            (element as HTMLElement).style.display = 'none';
        }
    });
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    let container = document.getElementById('fb-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'fb-toast-container';
        container.style.cssText = 'position:fixed;bottom:24px;left:24px;display:flex;flex-direction:column;gap:12px;z-index:99999;pointer-events:none;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bg = type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(24, 24, 27, 0.9)';
    const borderColor = type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)';
    toast.style.cssText = `
        background:${bg};
        backdrop-filter:blur(8px);
        color:white;
        padding:12px 20px;
        border-radius:8px;
        border:1px solid ${borderColor};
        box-shadow:0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        font-family:system-ui, -apple-system, sans-serif;
        font-size:14px;
        font-weight:500;
        pointer-events:auto;
        transform:translateY(100px);
        opacity:0;
        transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        display:flex;
        align-items:center;
        gap:8px;
    `;

    const icon = type === 'error' ? '❌' : '✨';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    toast.offsetHeight;

    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.transform = 'translateY(-20px)';
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

function initActionDelegation(store: VariableStore) {
    document.addEventListener('click', async (e) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (btn?.hasAttribute('disabled')) {
            e.preventDefault();
            return;
        }

        const target = (e.target as HTMLElement).closest('[data-action-set-var-name], [data-action-run-workflow]');
        if (!target) return;

        e.preventDefault();

        // 1. Simple Set Variable Action
        const setVarName = target.getAttribute('data-action-set-var-name');
        if (setVarName) {
            const scope = target.getAttribute('data-action-set-var-scope') || 'local';
            const valueStr = target.getAttribute('data-action-set-var-value') || '';
            
            let value: any = valueStr;
            if (valueStr === 'true') value = true;
            else if (valueStr === 'false') value = false;
            else if (valueStr === 'null') value = null;
            else if (/^\d+$/.test(valueStr)) value = Number(valueStr);
            
            store.set(scope, setVarName, value);
            console.log(`[Action] Variable set: ${scope}.${setVarName} =`, value);
            return;
        }

        // 2. Run Workflow Action
        const workflowId = target.getAttribute('data-action-run-workflow');
        if (workflowId) {
            const originalHtml = target.innerHTML;
            target.setAttribute('disabled', 'true');
            target.innerHTML = `<span class="fb-spinner" style="margin-right:0.5rem">⏳</span> Running...`;

            try {
                const response = await fetch(`/api/execute/${workflowId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parameters: {
                            local: store.local,
                            session: store.session,
                            cookies: store.cookies,
                            url: store.url,
                            app: store.app
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`Workflow execution failed: ${response.statusText}`);
                }

                const data = await response.json();
                console.log('[Workflow Action] Execution completed:', data);

                // 2a. Apply returned server-side variable mutations
                if (data.variableMutations && Array.isArray(data.variableMutations)) {
                    for (const mut of data.variableMutations) {
                        store.set(mut.scope, mut.key, mut.value);
                    }
                }

                // 2b. Execute onSuccess handler
                const onSuccessType = target.getAttribute('data-action-onsuccess');
                if (onSuccessType) {
                    if (onSuccessType === 'toast') {
                        const msg = target.getAttribute('data-action-onsuccess-toast-message') || 'Success!';
                        showToast(msg, 'success');
                    } else if (onSuccessType === 'redirect') {
                        const url = target.getAttribute('data-action-onsuccess-redirect-url');
                        if (url) {
                            window.location.href = url;
                        }
                    } else if (onSuccessType === 'setVariable') {
                        const sScope = target.getAttribute('data-action-onsuccess-var-scope') || 'local';
                        const sName = target.getAttribute('data-action-onsuccess-var-name');
                        const sPath = target.getAttribute('data-action-onsuccess-result-path') || '';
                        
                        if (sName) {
                            const resultObj = data.result || {};
                            let value = resultObj;
                            if (sPath) {
                                const parts = sPath.split('.');
                                for (const part of parts) {
                                    if (value) value = value[part];
                                }
                            }
                            store.set(sScope, sName, value);
                        }
                    }
                }
            } catch (err: any) {
                console.error('[Workflow Action] Error:', err);
                showToast(err.message || 'Workflow execution failed', 'error');
            } finally {
                target.removeAttribute('disabled');
                target.innerHTML = originalHtml;
            }
        }
    });
}
