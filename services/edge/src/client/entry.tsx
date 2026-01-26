/**
 * React Hydration Entry Point with React Query
 * 
 * Selectively hydrates React components on SSR pages.
 * Includes QueryClientProvider for @frontbase/datatable caching.
 */

import { hydrateRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataTable } from '../components/datatable';
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
};

// Hydrate all React components
function hydrateReactComponents() {
    console.log('🔄 React hydration starting...');

    // Find all elements marked for React hydration
    const elements = document.querySelectorAll('[data-react-component]');

    elements.forEach((element) => {
        const componentName = element.getAttribute('data-react-component');
        const propsAttr = element.getAttribute('data-react-props');

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
                const componentId = element.id || element.getAttribute('data-component-id');
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

            // Wrap in QueryClientProvider for React Query caching support
            hydrateRoot(
                element,
                <StrictMode>
                    <QueryClientProvider client={queryClient}>
                        <Component {...props} />
                    </QueryClientProvider>
                </StrictMode>
            );
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
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            hydrateReactComponents();
            initMobileMenuToggle();
        });
    } else {
        hydrateReactComponents();
        initMobileMenuToggle();
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

// Expose for debugging
if (typeof window !== 'undefined') {
    (window as any).__REACT_COMPONENTS__ = components;
    (window as any).__REACT_QUERY_CLIENT__ = queryClient;
}
