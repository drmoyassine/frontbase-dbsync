/**
 * Data Component Renderers
 * 
 * Renders data-driven components (DataTable, Form, InfoList) with skeleton placeholders.
 * These components show loading state on SSR and hydrate with React Query for data fetching.
 */

/**
 * Escape HTML special characters for safe rendering.
 */
function escapeHtml(str: string | undefined): string {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Helper to build common attributes (id, class, style, data-*)
 */
function getCommonAttributes(
    id: string,
    baseClass: string,
    props: Record<string, unknown>,
    extraStyle: string,
    hydrateType: string,
    propsJson: string,
    extraAttrs: string = ''
): string {
    // Merge base class with prop className (e.g. Tailwind classes)
    const className = [baseClass, props.className].filter(Boolean).join(' ');

    // Merge extra inline styles with prop styles
    const propStyle = props.style as Record<string, any> || {};
    const propStyleString = Object.entries(propStyle)
        .map(([k, v]) => {
            const key = k.replace(/([A-Z])/g, '-$1').toLowerCase();
            return `${key}:${v}`;
        })
        .join(';');

    const finalStyle = [extraStyle, propStyleString].filter(Boolean).join(';');

    return `id="${id}" class="${className}" style="${finalStyle}" data-fb-hydrate="${hydrateType}" data-fb-props="${escapeHtml(propsJson)}" ${extraAttrs}`;
}

/**
 * Render data-driven components with hydration markers.
 */
export function renderDataComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    childrenHtml: string
): string {
    // Serialize props for client hydration  
    const propsJson = JSON.stringify(props).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    switch (type) {
        case 'DataTable':
            return renderDataTable(id, props, propsJson);

        case 'Form':
            return renderForm(id, props, childrenHtml, propsJson);

        case 'InfoList':
            return renderInfoList(id, props, propsJson);

        case 'Chart':
            return renderChart(id, props, propsJson);

        case 'Card':
        case 'DataCard':
            return renderDataCard(id, props, childrenHtml, propsJson);

        case 'Repeater':
        case 'List':
            return renderRepeater(id, props, childrenHtml, propsJson);

        case 'Grid':
            return renderDataGrid(id, props, propsJson);

        default:
            // Fallback for unknown data components
            return `<div data-fb-id="${id}" data-fb-type="${type}" data-fb-hydrate="data" data-fb-props="${escapeHtml(propsJson)}" class="fb-data-component">
                <div class="fb-skeleton" style="height:200px;border-radius:0.5rem">&nbsp;</div>
                ${childrenHtml}
            </div>`;
    }
}

// =============================================================================
// Individual Component Renderers
// =============================================================================

function renderDataTable(id: string, props: Record<string, unknown>, propsJson: string): string {
    const binding = props.binding as Record<string, unknown> || {};
    // Read tableName from binding first (where the builder stores it), then fallback to props
    const tableName = (binding.tableName as string) || props.tableName as string || props.table as string || '';
    const columns = binding.columnOrder as string[] || props.columns as string[] || [];
    const title = escapeHtml(String(props.title || `Table: ${tableName}`));
    const showPagination = (binding.pagination as any)?.enabled !== false;
    const pageSize = (binding.pagination as any)?.pageSize || (props.pageSize as number) || 10;

    // For React hydration, we output a simpler container that React will take over
    // Include binding in props for the React component
    const reactProps = {
        binding: binding,
        tableName: tableName,
    };
    const reactPropsJson = JSON.stringify(reactProps).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    // Generate skeleton header row (shown before React hydrates)
    const headerCells = columns.length > 0
        ? columns.slice(0, 5).map(col => {
            const label = col.replace(/\./g, ' › ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return `<th style="padding:0.75rem 1rem;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:600">${escapeHtml(label)}</th>`;
        }).join('')
        : '<th style="padding:0.75rem 1rem">Column 1</th><th style="padding:0.75rem 1rem">Column 2</th><th style="padding:0.75rem 1rem">Column 3</th>';

    // Generate skeleton data rows
    const numCols = columns.length > 0 ? Math.min(columns.length, 5) : 3;
    const skeletonRows = Array(Math.min(pageSize, 5)).fill(0).map(() => {
        return `<tr>${Array(numCols).fill(0).map(() =>
            '<td style="padding:0.75rem 1rem;border-bottom:1px solid #f3f4f6"><div class="fb-skeleton" style="height:1rem;width:80%;border-radius:0.25rem">&nbsp;</div></td>'
        ).join('')}</tr>`;
    }).join('');

    // Use data-react-component for React hydration instead of data-fb-hydrate
    return `<div id="${id}" class="fb-datatable" data-react-component="DataTable" data-react-props="${escapeHtml(reactPropsJson)}" data-component-id="${id}">
        <div class="fb-datatable-container" style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:0.5rem">
            <table style="width:100%;border-collapse:collapse">
                <thead style="background:#f9fafb">
                    <tr>${headerCells}</tr>
                </thead>
                <tbody class="fb-loading">
                    ${skeletonRows}
                </tbody>
            </table>
        </div>
        ${showPagination ? `<div class="fb-datatable-pagination" style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;padding:0.5rem 0">
            <span class="fb-skeleton" style="width:100px;height:1rem">&nbsp;</span>
            <div style="display:flex;gap:0.25rem">
                <button class="fb-skeleton" style="width:32px;height:32px;border-radius:0.25rem">&nbsp;</button>
                <button class="fb-skeleton" style="width:32px;height:32px;border-radius:0.25rem">&nbsp;</button>
            </div>
        </div>` : ''}
    </div>`;
}

function renderForm(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const title = escapeHtml(String(props.title || 'Form'));
    const mode = props.mode as string || 'create'; // create, edit
    const tableName = props.tableName as string || props.table as string || '';
    const fields = props.fields as Array<{ name: string; label: string; type: string }> || [];

    // Render form fields or skeleton
    const formFields = fields.length > 0
        ? fields.map(field => `
            <div class="fb-form-field" style="margin-bottom:1rem">
                <label style="display:block;font-weight:500;margin-bottom:0.25rem">${escapeHtml(field.label)}</label>
                <div class="fb-skeleton" style="height:40px;border-radius:0.375rem">&nbsp;</div>
            </div>
        `).join('')
        : `
            <div class="fb-form-field" style="margin-bottom:1rem">
                <div class="fb-skeleton" style="height:16px;width:60px;margin-bottom:0.25rem">&nbsp;</div>
                <div class="fb-skeleton" style="height:40px;border-radius:0.375rem">&nbsp;</div>
            </div>
            <div class="fb-form-field" style="margin-bottom:1rem">
                <div class="fb-skeleton" style="height:16px;width:80px;margin-bottom:0.25rem">&nbsp;</div>
                <div class="fb-skeleton" style="height:40px;border-radius:0.375rem">&nbsp;</div>
            </div>
        `;

    const attrs = getCommonAttributes(id, 'fb-form', props, '', 'form', propsJson, `data-table="${escapeHtml(tableName)}" data-mode="${mode}"`);

    return `<form ${attrs}>
        ${title ? `<h3 style="margin:0 0 1.5rem 0;font-size:1.125rem;font-weight:600">${title}</h3>` : ''}
        <div class="fb-form-fields fb-loading">
            ${formFields}
            ${childrenHtml}
        </div>
        <div class="fb-form-actions" style="display:flex;gap:0.75rem;margin-top:1.5rem">
            <button type="submit" class="fb-skeleton" style="padding:0.5rem 1.5rem;border-radius:0.375rem;width:100px">&nbsp;</button>
            <button type="button" class="fb-skeleton" style="padding:0.5rem 1rem;border-radius:0.375rem;width:80px">&nbsp;</button>
        </div>
    </form>`;
}

function renderInfoList(id: string, props: Record<string, unknown>, propsJson: string): string {
    const title = escapeHtml(String(props.title || ''));
    const items = props.items as Array<{ label: string; value?: string }> || [];
    const columns = (props.columns as number) || 1;

    const attrs = getCommonAttributes(id, 'fb-infolist', props, '', 'infolist', propsJson);

    // Render items or skeleton
    const listItems = items.length > 0
        ? items.map(item => `
            <div class="fb-infolist-item" style="display:flex;flex-direction:column;padding:0.75rem 0;border-bottom:1px solid #f3f4f6">
                <span style="font-size:0.875rem;color:#6b7280">${escapeHtml(item.label)}</span>
                <span style="font-weight:500">${item.value !== undefined ? escapeHtml(String(item.value)) : '<span class="fb-skeleton" style="display:inline-block;width:120px;height:1rem">&nbsp;</span>'}</span>
            </div>
        `).join('')
        : Array(4).fill(0).map(() => `
            <div class="fb-infolist-item" style="display:flex;flex-direction:column;padding:0.75rem 0;border-bottom:1px solid #f3f4f6">
                <span class="fb-skeleton" style="height:0.875rem;width:80px;margin-bottom:0.25rem">&nbsp;</span>
                <span class="fb-skeleton" style="height:1rem;width:150px">&nbsp;</span>
            </div>
        `).join('');

    return `<div ${attrs}>
        ${title ? `<h4 style="margin:0 0 1rem 0;font-size:1rem;font-weight:600">${title}</h4>` : ''}
        <div class="fb-infolist-items fb-loading" style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:0 2rem">
            ${listItems}
        </div>
    </div>`;
}

function renderChart(id: string, props: Record<string, unknown>, propsJson: string): string {
    const title = escapeHtml(String(props.title || 'Chart'));
    const chartType = props.type as string || props.chartType as string || 'bar';
    const height = props.height as string || '300px';

    const attrs = getCommonAttributes(id, 'fb-chart', props, '', 'chart', propsJson, `data-chart-type="${chartType}"`);

    return `<div ${attrs}>
        ${title ? `<h4 style="margin:0 0 1rem 0;font-size:1rem;font-weight:600">${title}</h4>` : ''}
        <div class="fb-chart-container fb-skeleton" style="height:${height};border-radius:0.5rem;display:flex;align-items:center;justify-content:center">
            <span style="color:#9ca3af">Loading chart...</span>
        </div>
    </div>`;
}

function renderDataCard(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const title = escapeHtml(String(props.title || ''));
    const subtitle = escapeHtml(String(props.subtitle || ''));
    const image = props.image as string || props.imageUrl as string || '';

    const style = `border:1px solid #e5e7eb;border-radius:0.5rem;overflow:hidden`;
    const attrs = getCommonAttributes(id, 'fb-datacard', props, style, 'datacard', propsJson);

    return `<div ${attrs}>
        ${image ? `<div class="fb-datacard-image" style="height:160px;background:#f3f4f6">
            <img src="${escapeHtml(image)}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" />
        </div>` : ''}
        <div class="fb-datacard-content" style="padding:1rem">
            ${title ? `<h4 style="margin:0 0 0.25rem 0;font-weight:600">${title}</h4>` : '<div class="fb-skeleton" style="height:1.25rem;width:60%;margin-bottom:0.5rem">&nbsp;</div>'}
            ${subtitle ? `<p style="margin:0;color:#6b7280;font-size:0.875rem">${subtitle}</p>` : '<div class="fb-skeleton" style="height:0.875rem;width:80%">&nbsp;</div>'}
            ${childrenHtml}
        </div>
    </div>`;
}

function renderRepeater(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const columns = (props.columns as number) || 1;
    const gap = props.gap as string || '1rem';
    const itemCount = (props.itemCount as number) || 3;

    // Generate skeleton items
    const skeletonItems = Array(itemCount).fill(0).map(() =>
        `<div class="fb-repeater-item fb-skeleton" style="min-height:100px;border-radius:0.5rem">&nbsp;</div>`
    ).join('');

    const style = `display:grid;grid-template-columns:repeat(${columns},1fr);gap:${gap}`;
    const attrs = getCommonAttributes(id, 'fb-repeater', props, style, 'repeater', propsJson);

    return `<div ${attrs}>
        <div class="fb-repeater-items fb-loading">
            ${skeletonItems}
        </div>
        ${childrenHtml}
    </div>`;
}

function renderDataGrid(id: string, props: Record<string, unknown>, propsJson: string): string {
    const columns = (props.columns as number) || 3;
    const rows = (props.rows as number) || 3;
    const gap = props.gap as string || '1rem';

    // Generate skeleton grid cells
    const cellCount = columns * rows;
    const skeletonCells = Array(cellCount).fill(0).map(() =>
        `<div class="fb-datagrid-cell fb-skeleton" style="min-height:80px;border-radius:0.375rem">&nbsp;</div>`
    ).join('');

    const style = `display:grid;grid-template-columns:repeat(${columns},1fr);gap:${gap}`;
    const attrs = getCommonAttributes(id, 'fb-datagrid', props, style, 'datagrid', propsJson);

    return `<div ${attrs}>
        ${skeletonCells}
    </div>`;
}
