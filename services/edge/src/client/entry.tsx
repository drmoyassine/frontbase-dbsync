/**
 * React Hydration Entry Point with React Query
 * 
 * Selectively hydrates React components on SSR pages.
 * Includes QueryClientProvider for @frontbase/datatable caching.
 */

import { hydrateRoot, createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataTable } from '../components/datatable';
import { Form } from '../components/form/Form';
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
};

// Hydrate all React components
function hydrateReactComponents() {
    console.log('🔄 React hydration starting...');

    // Find all elements marked for React hydration
    const elements = document.querySelectorAll('[data-react-component], [data-fb-hydrate="datatable"], [data-fb-hydrate="form"]');

    elements.forEach((element) => {
        // Handle both new data-react-component and legacy data-fb-hydrate
        const hydrateType = element.getAttribute('data-fb-hydrate');
        const componentName = element.getAttribute('data-react-component') ||
            (hydrateType === 'datatable' ? 'DataTable' : hydrateType === 'form' ? 'Form' : null);

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

            // Form uses createRoot (SSR is a skeleton placeholder, not matching client)
            // DataTable uses hydrateRoot (SSR matches client render)
            if (componentName === 'Form' || componentName === 'form') {
                // Clear SSR skeleton before mounting
                element.innerHTML = '';
                const root = createRoot(element);
                root.render(reactTree);
            } else {
                hydrateRoot(element, reactTree);
            }
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
            initSmoothScroll();
            initNavigation();
        });
    } else {
        hydrateReactComponents();
        initMobileMenuToggle();
        initSmoothScroll();
        initNavigation();
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
