/**
 * Client Hydration Bundle (Phase 4)
 * 
 * This is the entry point for client-side hydration.
 * It initializes React, React Query, and the variable store,
 * then hydrates interactive and data-driven components.
 */

import { hydrateRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// @ts-ignore - This file is compiled separately for the browser bundle
import { createClientStore, VariableStore } from '../src/ssr/store.js';

// Global state
let queryClient: QueryClient;
let variableStore: VariableStore;

// Initialize React Query client
function initQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000, // 1 minute
                refetchOnWindowFocus: false,
                retry: 1,
            },
        },
    });
}

// Initialize variable store from server-rendered state
function initVariableStore(): VariableStore {
    const initialState = (window as any).__INITIAL_STATE__ || {};
    return createClientStore(initialState);
}

// ============================================================================
// Component Hydration Handlers
// ============================================================================

type HydrateHandler = (element: HTMLElement, props: Record<string, unknown>) => void;

const hydrateHandlers: Record<string, HydrateHandler> = {
    // Interactive components
    button: hydrateButton,
    link: hydrateLink,
    tabs: hydrateTabs,
    accordion: hydrateAccordion,
    modal: hydrateModal,
    dropdown: hydrateDropdown,
    toggle: hydrateToggle,
    checkbox: hydrateCheckbox,
    radio: hydrateRadio,
    tooltip: hydrateTooltip,

    // Data components (React Query powered)
    datatable: hydrateDataTable,
    form: hydrateForm,
    infolist: hydrateInfoList,
    chart: hydrateChart,
    datacard: hydrateDataCard,
    repeater: hydrateRepeater,
    datagrid: hydrateDataGrid,
};

// ============================================================================
// Interactive Component Hydration
// ============================================================================

function hydrateButton(element: HTMLElement, props: Record<string, unknown>) {
    const onClick = props.onClick as string;
    if (onClick) {
        element.addEventListener('click', () => {
            // Handle onClick action - could be variable update, navigation, etc.
            handleAction(onClick, props);
        });
    }

    // Handle loading state
    if (props.loading) {
        element.classList.add('fb-loading');
    }
}

function hydrateLink(element: HTMLElement, props: Record<string, unknown>) {
    // Links already work, but we can add SPA navigation
    const href = props.href as string || props.to as string;
    if (href && !href.startsWith('http')) {
        element.addEventListener('click', (e) => {
            e.preventDefault();
            window.history.pushState({}, '', href);
            // Trigger page load or navigation handler
        });
    }
}

function hydrateTabs(element: HTMLElement, props: Record<string, unknown>) {
    const buttons = element.querySelectorAll('.fb-tab-button');
    const panels = element.querySelectorAll('.fb-tab-panel');

    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab-id');

            // Update button states
            buttons.forEach((b) => {
                const isActive = b.getAttribute('data-tab-id') === tabId;
                (b as HTMLElement).style.borderBottom = isActive ? '2px solid #3b82f6' : '2px solid transparent';
                (b as HTMLElement).style.color = isActive ? '#3b82f6' : '#6b7280';
            });

            // Show/hide panels
            panels.forEach((panel) => {
                const isActive = panel.getAttribute('data-tab-id') === tabId;
                (panel as HTMLElement).style.display = isActive ? '' : 'none';
            });
        });
    });
}

function hydrateAccordion(element: HTMLElement, props: Record<string, unknown>) {
    const allowMultiple = element.getAttribute('data-allow-multiple') === 'true';
    const triggers = element.querySelectorAll('.fb-accordion-trigger');

    triggers.forEach((trigger) => {
        trigger.addEventListener('click', () => {
            const item = trigger.closest('.fb-accordion-item');
            if (!item) return;

            const content = item.querySelector('.fb-accordion-content') as HTMLElement;
            const arrow = trigger.querySelector('span') as HTMLElement;
            const isOpen = content.style.display !== 'none';

            // Close others if not allowMultiple
            if (!allowMultiple && !isOpen) {
                element.querySelectorAll('.fb-accordion-content').forEach((c) => {
                    (c as HTMLElement).style.display = 'none';
                });
                element.querySelectorAll('.fb-accordion-trigger span').forEach((a) => {
                    (a as HTMLElement).style.transform = 'rotate(0deg)';
                });
            }

            // Toggle current
            content.style.display = isOpen ? 'none' : '';
            arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    });
}

function hydrateModal(element: HTMLElement, props: Record<string, unknown>) {
    const closeBtn = element.querySelector('.fb-modal-close');

    // Close on button click
    closeBtn?.addEventListener('click', () => {
        element.style.display = 'none';
    });

    // Close on backdrop click
    element.addEventListener('click', (e) => {
        if (e.target === element) {
            element.style.display = 'none';
        }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && element.style.display !== 'none') {
            element.style.display = 'none';
        }
    });
}

function hydrateDropdown(element: HTMLElement, props: Record<string, unknown>) {
    const trigger = element.querySelector('.fb-dropdown-trigger');
    const menu = element.querySelector('.fb-dropdown-menu') as HTMLElement;
    const items = element.querySelectorAll('.fb-dropdown-item');

    // Toggle menu
    trigger?.addEventListener('click', () => {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    // Handle item clicks
    items.forEach((item) => {
        item.addEventListener('click', () => {
            const itemId = item.getAttribute('data-item-id');
            // Trigger onSelect callback
            menu.style.display = 'none';
        });
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!element.contains(e.target as Node)) {
            menu.style.display = 'none';
        }
    });
}

function hydrateToggle(element: HTMLElement, props: Record<string, unknown>) {
    const input = element.querySelector('input') as HTMLInputElement;
    const track = element.querySelector('.fb-toggle-track') as HTMLElement;
    const thumb = element.querySelector('.fb-toggle-thumb') as HTMLElement;

    element.addEventListener('click', () => {
        if (input.disabled) return;

        input.checked = !input.checked;
        track.style.background = input.checked ? '#3b82f6' : '#d1d5db';
        thumb.style.left = input.checked ? '22px' : '2px';

        // Update variable if bound
        if (props.variable) {
            variableStore.setPageVariable(props.variable as string, input.checked);
        }
    });
}

function hydrateCheckbox(element: HTMLElement, props: Record<string, unknown>) {
    const input = element.querySelector('input') as HTMLInputElement;
    const box = element.querySelector('.fb-checkbox-box') as HTMLElement;

    element.addEventListener('click', () => {
        if (input.disabled) return;

        input.checked = !input.checked;
        box.style.borderColor = input.checked ? '#3b82f6' : '#d1d5db';
        box.style.background = input.checked ? '#3b82f6' : 'transparent';
        box.innerHTML = input.checked ? '<span style="color:#fff;font-size:12px">✓</span>' : '';
    });
}

function hydrateRadio(element: HTMLElement, props: Record<string, unknown>) {
    const input = element.querySelector('input') as HTMLInputElement;

    element.addEventListener('click', () => {
        if (input.disabled) return;

        // Uncheck other radios in same group
        const name = input.name;
        document.querySelectorAll(`.fb-radio input[name="${name}"]`).forEach((r) => {
            const radio = r as HTMLInputElement;
            const parent = radio.closest('.fb-radio');
            const circle = parent?.querySelector('.fb-radio-circle') as HTMLElement;

            radio.checked = r === input;
            if (circle) {
                circle.style.borderColor = radio.checked ? '#3b82f6' : '#d1d5db';
                circle.innerHTML = radio.checked ? '<span style="width:10px;height:10px;background:#3b82f6;border-radius:50%"></span>' : '';
            }
        });
    });
}

function hydrateTooltip(element: HTMLElement, props: Record<string, unknown>) {
    const content = element.querySelector('.fb-tooltip-content') as HTMLElement;

    element.addEventListener('mouseenter', () => {
        content.style.display = 'block';
    });

    element.addEventListener('mouseleave', () => {
        content.style.display = 'none';
    });
}

// ============================================================================
// Data Component Hydration (React Query)
// ============================================================================

function hydrateDataTable(element: HTMLElement, props: Record<string, unknown>) {
    // Check both direct props and binding object (SSR uses binding.tableName)
    const binding = props.binding as Record<string, unknown> | undefined;
    const tableName = binding?.tableName as string || props.tableName as string || props.table as string;
    if (!tableName) {
        console.warn('[Hydration] DataTable missing tableName in props:', props);
        return;
    }
    console.log('[Hydration] DataTable hydrating:', tableName);

    // Remove loading state
    element.querySelector('.fb-loading')?.classList.remove('fb-loading');

    // Fetch data using React Query
    fetchTableData(tableName, props).then((data) => {
        renderTableData(element, data, props);
    });
}

function hydrateForm(element: HTMLElement, props: Record<string, unknown>) {
    // Check both direct props and binding object (SSR uses binding.tableName)
    const binding = props.binding as Record<string, unknown> | undefined;
    const tableName = binding?.tableName as string || props.tableName as string || props.table as string;
    const mode = props.mode as string || 'create';
    const recordId = binding?.recordId as string || props.recordId as string;

    // Remove loading state
    element.querySelector('.fb-loading')?.classList.remove('fb-loading');

    // If edit mode, fetch existing data
    if (mode === 'edit' && recordId) {
        fetchRecordData(tableName, recordId).then((data) => {
            populateFormFields(element, data);
        });
    }

    // Handle form submission
    element.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Handle form submission based on mode
    });
}

function hydrateInfoList(element: HTMLElement, props: Record<string, unknown>) {
    // Check both direct props and binding object (SSR uses binding.tableName)
    const binding = props.binding as Record<string, unknown> | undefined;
    const tableName = binding?.tableName as string || props.tableName as string || props.table as string;
    const recordId = binding?.recordId as string || props.recordId as string;

    if (tableName && recordId) {
        fetchRecordData(tableName, recordId).then((data) => {
            renderInfoListData(element, data, props);
        });
    }

    element.querySelector('.fb-loading')?.classList.remove('fb-loading');
}

function hydrateChart(element: HTMLElement, props: Record<string, unknown>) {
    // Chart hydration would require a charting library
    element.querySelector('.fb-skeleton')?.classList.remove('fb-skeleton');
    console.log('Chart hydration requires chart library integration');
}

function hydrateDataCard(element: HTMLElement, props: Record<string, unknown>) {
    element.querySelector('.fb-skeleton')?.classList.remove('fb-skeleton');
}

function hydrateRepeater(element: HTMLElement, props: Record<string, unknown>) {
    element.querySelector('.fb-loading')?.classList.remove('fb-loading');
}

function hydrateDataGrid(element: HTMLElement, props: Record<string, unknown>) {
    element.querySelectorAll('.fb-skeleton').forEach((el) => el.classList.remove('fb-skeleton'));
}

// ============================================================================
// Data Fetching Helpers
// ============================================================================

async function fetchTableData(tableName: string, props: Record<string, unknown>): Promise<any[]> {
    const apiBase = (window as any).__API_BASE__ || '';
    try {
        const response = await fetch(`${apiBase}/api/data/${tableName}`);
        const result = await response.json();
        return result.data || [];
    } catch (error) {
        console.error('Failed to fetch table data:', error);
        return [];
    }
}

async function fetchRecordData(tableName: string, recordId: string): Promise<any> {
    const apiBase = (window as any).__API_BASE__ || '';
    try {
        const response = await fetch(`${apiBase}/api/data/${tableName}/${recordId}`);
        const result = await response.json();
        return result.data || null;
    } catch (error) {
        console.error('Failed to fetch record data:', error);
        return null;
    }
}

// ============================================================================
// Rendering Helpers
// ============================================================================

function renderTableData(element: HTMLElement, data: any[], props: Record<string, unknown>) {
    const tbody = element.querySelector('tbody');
    if (!tbody) return;

    const columns = props.columns as Array<{ key: string; label: string }> || [];

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length || 3}" style="text-align:center;padding:2rem;color:#6b7280">No data found</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((row) => {
        const cells = columns.length > 0
            ? columns.map((col) => `<td style="padding:0.75rem 1rem;border-bottom:1px solid #f3f4f6">${row[col.key] ?? ''}</td>`).join('')
            : Object.values(row).map((val) => `<td style="padding:0.75rem 1rem;border-bottom:1px solid #f3f4f6">${val ?? ''}</td>`).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
}

function populateFormFields(element: HTMLElement, data: any) {
    // Populate form fields with record data
    const fields = element.querySelectorAll('input, select, textarea');
    fields.forEach((field) => {
        const name = field.getAttribute('name');
        if (name && data[name] !== undefined) {
            (field as HTMLInputElement).value = data[name];
        }
    });
}

function renderInfoListData(element: HTMLElement, data: any, props: Record<string, unknown>) {
    const items = element.querySelector('.fb-infolist-items');
    if (!items || !data) return;

    const fields = props.fields as Array<{ key: string; label: string }> || Object.keys(data).map(k => ({ key: k, label: k }));

    items.innerHTML = fields.map((field) => `
        <div class="fb-infolist-item" style="display:flex;flex-direction:column;padding:0.75rem 0;border-bottom:1px solid #f3f4f6">
            <span style="font-size:0.875rem;color:#6b7280">${field.label}</span>
            <span style="font-weight:500">${data[field.key] ?? '-'}</span>
        </div>
    `).join('');
}

// ============================================================================
// Action Handlers
// ============================================================================

function handleAction(actionName: string, props: Record<string, unknown>) {
    console.log('Action triggered:', actionName, props);
    // Handle various actions: navigate, setVariable, submit, etc.
}

// ============================================================================
// Main Hydration Entry Point
// ============================================================================

function hydrateApp() {
    console.log('🔄 Hydrating Frontbase page...');

    // Initialize global state
    queryClient = initQueryClient();
    variableStore = initVariableStore();

    // Find all elements marked for hydration
    const hydrateElements = document.querySelectorAll('[data-fb-hydrate]');

    hydrateElements.forEach((element) => {
        const hydrateType = element.getAttribute('data-fb-hydrate');
        const propsStr = element.getAttribute('data-fb-props');

        if (!hydrateType) return;

        let props: Record<string, unknown> = {};
        try {
            if (propsStr) {
                props = JSON.parse(propsStr);
            }
        } catch (e) {
            console.warn('Failed to parse props for element:', element);
        }

        const handler = hydrateHandlers[hydrateType.toLowerCase()];
        if (handler) {
            handler(element as HTMLElement, props);
        } else {
            console.warn('No hydration handler for:', hydrateType);
        }
    });

    console.log('✅ Hydration complete');
}

// Run hydration when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateApp);
} else {
    hydrateApp();
}

export { hydrateApp, queryClient, variableStore };
