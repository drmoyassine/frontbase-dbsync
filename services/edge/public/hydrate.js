/**
 * Client Hydration Bundle
 * 
 * Minimal hydration script for SSR pages.
 * Initializes interactive components and data fetching.
 */

(function () {
    'use strict';

    console.log('🔄 Hydrating Frontbase page...');

    // Initialize variable store from server-rendered state
    const initialState = window.__INITIAL_STATE__ || {};
    const pageData = window.__PAGE_DATA__ || {};

    // Simple variable store
    const variableStore = {
        page: { ...initialState.pageVariables },
        session: { ...initialState.sessionVariables },
        cookies: { ...initialState.cookies },

        setPageVariable(key, value) {
            this.page[key] = value;
        },

        getPageVariable(key) {
            return this.page[key];
        }
    };

    // Load session variables from localStorage
    try {
        const stored = localStorage.getItem('fb_session_variables');
        if (stored) {
            Object.assign(variableStore.session, JSON.parse(stored));
        }
    } catch (e) {
        console.warn('Failed to load session variables:', e);
    }

    // Find component props from layoutData by component ID
    function findComponentById(components, componentId) {
        if (!components) return null;
        for (const comp of components) {
            if (comp.id === componentId) return comp;
            if (comp.children) {
                const found = findComponentById(comp.children, componentId);
                if (found) return found;
            }
        }
        return null;
    }

    // Get binding for a component from pageData.layoutData
    function getComponentBinding(componentId) {
        const layoutData = pageData.layoutData;
        if (!layoutData || !layoutData.content) return null;
        const component = findComponentById(layoutData.content, componentId);
        return component?.binding || null;
    }

    // Hydration handlers
    const handlers = {
        button(el, props) {
            el.addEventListener('click', () => {
                console.log('Button clicked:', props.onClick);
                if (props.onClick) {
                    handleAction(props.onClick, props);
                }
            });
        },

        tabs(el, props) {
            const buttons = el.querySelectorAll('.fb-tab-button');
            const panels = el.querySelectorAll('.fb-tab-panel');

            buttons.forEach((btn) => {
                btn.addEventListener('click', () => {
                    const tabId = btn.getAttribute('data-tab-id');

                    buttons.forEach((b) => {
                        const isActive = b.getAttribute('data-tab-id') === tabId;
                        b.style.borderBottom = isActive ? '2px solid #3b82f6' : '2px solid transparent';
                        b.style.color = isActive ? '#3b82f6' : '#6b7280';
                    });

                    panels.forEach((panel) => {
                        panel.style.display = panel.getAttribute('data-tab-id') === tabId ? '' : 'none';
                    });
                });
            });
        },

        accordion(el, props) {
            const allowMultiple = el.getAttribute('data-allow-multiple') === 'true';
            const triggers = el.querySelectorAll('.fb-accordion-trigger');

            triggers.forEach((trigger) => {
                trigger.addEventListener('click', () => {
                    const item = trigger.closest('.fb-accordion-item');
                    if (!item) return;

                    const content = item.querySelector('.fb-accordion-content');
                    const arrow = trigger.querySelector('span');
                    const isOpen = content.style.display !== 'none';

                    if (!allowMultiple && !isOpen) {
                        el.querySelectorAll('.fb-accordion-content').forEach((c) => {
                            c.style.display = 'none';
                        });
                        el.querySelectorAll('.fb-accordion-trigger span').forEach((a) => {
                            a.style.transform = 'rotate(0deg)';
                        });
                    }

                    content.style.display = isOpen ? 'none' : '';
                    if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
                });
            });
        },

        modal(el, props) {
            const closeBtn = el.querySelector('.fb-modal-close');

            closeBtn?.addEventListener('click', () => {
                el.style.display = 'none';
            });

            el.addEventListener('click', (e) => {
                if (e.target === el) {
                    el.style.display = 'none';
                }
            });
        },

        toggle(el, props) {
            const input = el.querySelector('input');
            const track = el.querySelector('.fb-toggle-track');
            const thumb = el.querySelector('.fb-toggle-thumb');

            el.addEventListener('click', () => {
                if (input.disabled) return;

                input.checked = !input.checked;
                track.style.background = input.checked ? '#3b82f6' : '#d1d5db';
                thumb.style.left = input.checked ? '22px' : '2px';

                if (props.variable) {
                    variableStore.setPageVariable(props.variable, input.checked);
                }
            });
        },

        datatable(el, props) {
            // Get component ID from element to lookup binding from pageData.layoutData
            const componentId = el.id || el.getAttribute('data-component-id');

            // Try to get binding from props first, then lookup from pageData.layoutData
            let binding = props.binding || {};

            // If binding doesn't have dataRequest, try to get it from layoutData
            if (!binding.dataRequest && componentId) {
                const layoutBinding = getComponentBinding(componentId);
                if (layoutBinding) {
                    console.log('[Hydration] Found binding in layoutData for:', componentId);
                    binding = { ...binding, ...layoutBinding };
                }
            }

            const tableName = binding.tableName || props.tableName || props.table;
            const dataRequest = binding.dataRequest;

            if (!tableName && !dataRequest) {
                console.warn('[Hydration] DataTable missing tableName and dataRequest in props:', props, 'binding:', binding);
                return;
            }
            console.log('[Hydration] DataTable hydrating:', tableName, 'hasDataRequest:', !!dataRequest);

            el.querySelector('.fb-loading')?.classList.remove('fb-loading');

            // NEW: Use pre-computed dataRequest if available
            if (dataRequest && dataRequest.url) {
                console.log('[Hydration] Using dataRequest:', dataRequest.url.substring(0, 60) + '...');
                executeDataRequest(dataRequest)
                    .then(data => renderTable(el, data, { ...props, binding }))
                    .catch(err => console.error('DataTable execute error:', err));
            } else {
                // FALLBACK: Legacy approach - fetch from simple data API
                fetchData(`/api/data/${tableName}`)
                    .then(data => renderTable(el, data, { ...props, binding }))
                    .catch(err => console.error('DataTable fetch error:', err));
            }
        },

        form(el, props) {
            el.querySelector('.fb-loading')?.classList.remove('fb-loading');

            el.addEventListener('submit', async (e) => {
                e.preventDefault();
                console.log('Form submitted:', props);
            });
        },

        infolist(el, props) {
            el.querySelector('.fb-loading')?.classList.remove('fb-loading');
        }
    };

    // Action handler
    function handleAction(action, props) {
        console.log('Action:', action, props);
    }

    // Data fetching helper - uses same origin (Hono server)
    const API_BASE = window.location.origin;

    async function fetchData(endpoint) {
        const url = API_BASE + endpoint;
        console.log('[Hydrate] Fetching:', url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const result = await response.json();
        return result.data || [];
    }

    // Execute pre-computed DataRequest via POST /api/data/execute
    async function executeDataRequest(dataRequest) {
        const url = API_BASE + '/api/data/execute';
        console.log('[Hydrate] Executing DataRequest via:', url);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataRequest })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Execute failed');
        }

        return result.data || [];
    }

    // Table renderer
    function renderTable(el, data, props) {
        const thead = el.querySelector('thead tr');
        const tbody = el.querySelector('tbody');
        if (!tbody) return;

        // Get columns from props.binding or auto-detect from data
        const binding = props.binding || {};
        let columns = binding.columns || props.columns || [];

        // If no columns config, auto-detect from first data row
        if ((!columns || columns.length === 0) && data.length > 0) {
            columns = Object.keys(data[0]).map(key => ({
                key: key,
                label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            }));
        }

        // Update header row with actual column names
        if (thead && columns.length > 0) {
            thead.innerHTML = columns.map(col =>
                `<th style="padding:0.75rem 1rem;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600">${col.label || col.key}</th>`
            ).join('');
        }

        if (!data.length) {
            const colCount = columns.length || 3;
            tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:2rem">No data</td></tr>`;
            return;
        }

        // Render data rows using column config
        tbody.innerHTML = data.map(row => {
            const cells = columns.map(col => {
                const value = row[col.key] ?? '';
                return `<td style="padding:0.75rem 1rem;border-bottom:1px solid #f3f4f6">${value}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        // Remove any remaining skeleton classes
        el.querySelectorAll('.fb-skeleton').forEach(s => s.classList.remove('fb-skeleton'));
    }

    // Hydrate all marked elements
    function hydrate() {
        const elements = document.querySelectorAll('[data-fb-hydrate]');

        elements.forEach((el) => {
            const type = el.getAttribute('data-fb-hydrate');
            const propsStr = el.getAttribute('data-fb-props');

            let props = {};
            try {
                if (propsStr) props = JSON.parse(propsStr);
            } catch (e) {
                console.warn('Failed to parse props:', e);
            }

            const handler = handlers[type?.toLowerCase()];
            if (handler) {
                handler(el, props);
            }
        });

        // Initialize smooth scrolling for data-scroll-to elements
        initSmoothScroll();

        // Initialize navigation for data-navigate-to elements
        initNavigation();

        console.log('✅ Hydration complete');
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

    // Run hydration
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hydrate);
    } else {
        hydrate();
    }

    // Expose for debugging
    window.__FB_STORE__ = variableStore;
})();
