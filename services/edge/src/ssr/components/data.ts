/**
 * Data Component Renderers
 * 
 * Renders data-driven components (DataTable, Form, InfoList) with skeleton placeholders.
 * These components show loading state on SSR and hydrate with React Query for data fetching.
 */

import { renderIcon as renderIconPrimitive } from './static';

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
    let className = [baseClass, props.className].filter(Boolean).join(' ');

    let propStyleString = '';

    const propStyle = props.style as any || {};

    // Handle NEW StylesData format: { activeProperties: [...], values: {...} } or just { values: {...} }
    if (propStyle && typeof propStyle === 'object' && ('values' in propStyle || 'activeProperties' in propStyle)) {
        if (propStyle.values) {
            const { values } = propStyle;
            const styleParts: string[] = [];

            // Apply ALL styles from values
            for (const [prop, value] of Object.entries(values)) {
                if (value === undefined || value === null || value === '' || prop === 'className') {
                    continue;
                }

                // Handle special 'size' object: { width, widthUnit, height, heightUnit }
                if (prop === 'size' && typeof value === 'object') {
                    const sizeObj = value as any;
                    if (sizeObj.width !== undefined && sizeObj.width !== 'auto') {
                        const widthUnit = sizeObj.widthUnit || 'px';
                        styleParts.push(`width:${sizeObj.width}${widthUnit}`);
                    }
                    if (sizeObj.height !== undefined && sizeObj.height !== 'auto') {
                        const heightUnit = sizeObj.heightUnit || 'px';
                        styleParts.push(`height:${sizeObj.height}${heightUnit}`);
                    }
                    continue;
                }

                // Handle padding/margin objects: { top, right, bottom, left }
                if ((prop === 'padding' || prop === 'margin') && typeof value === 'object') {
                    const boxObj = value as any;
                    if (boxObj.top !== undefined) styleParts.push(`${prop}-top:${boxObj.top}px`);
                    if (boxObj.right !== undefined) styleParts.push(`${prop}-right:${boxObj.right}px`);
                    if (boxObj.bottom !== undefined) styleParts.push(`${prop}-bottom:${boxObj.bottom}px`);
                    if (boxObj.left !== undefined) styleParts.push(`${prop}-left:${boxObj.left}px`);
                    continue;
                }

                // Handle horizontalAlign: converts to margin-left/right auto
                if (prop === 'horizontalAlign' && typeof value === 'string') {
                    if (value === 'center') {
                        styleParts.push('margin-left:auto');
                        styleParts.push('margin-right:auto');
                    } else if (value === 'right') {
                        styleParts.push('margin-left:auto');
                        styleParts.push('margin-right:0');
                    } else {
                        styleParts.push('margin-left:0');
                        styleParts.push('margin-right:auto');
                    }
                    continue;
                }

                // Skip any remaining object values (would become [object Object])
                if (typeof value === 'object') {
                    continue;
                }

                // Convert camelCase to kebab-case for CSS
                const cssKey = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                styleParts.push(`${cssKey}:${value}`);
            }

            // Check for className in values
            if (values.className) {
                className = [className, values.className].filter(Boolean).join(' ');
            }

            propStyleString = styleParts.join(';');
        }
    }
    // Handle standard style object
    else {
        propStyleString = Object.entries(propStyle)
            .map(([k, v]) => {
                // Skip object values
                if (typeof v === 'object') return '';
                const key = k.replace(/([A-Z])/g, '-$1').toLowerCase();
                return `${key}:${v}`;
            })
            .filter(Boolean)
            .join(';');
    }

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
    
    // Column resolution chain: binding.columnOrder → props._columnOrder → queryConfig parse
    let columns = (binding.columnOrder as string[]) || (props._columnOrder as string[]) || (props.columns as string[]) || [];
    
    // Fallback: parse column names from dataRequest queryConfig SQL string
    if (columns.length === 0) {
        const queryConfig = (binding.dataRequest as any)?.queryConfig;
        if (queryConfig?.columns && typeof queryConfig.columns === 'string') {
            columns = (queryConfig.columns as string).split(',')
                .map((c: string) => c.trim())
                .map((c: string) => {
                    // Extract column name from: "table"."col" AS "alias", "table"."col", col
                    const aliasMatch = c.match(/AS\s+"(.+)"/i);
                    if (aliasMatch) return aliasMatch[1];
                    const quotedMatch = c.match(/"[^"]*"\."([^"]+)"/);
                    if (quotedMatch) return quotedMatch[1];
                    return c.replace(/"/g, '').replace(/^\w+\./, '');
                })
                .filter((c: string) => c && c !== '*');
        }
    }
    
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
        ? columns.slice(0, 8).map(col => {
            const label = col.replace(/\./g, ' › ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return `<th>${escapeHtml(label)}</th>`;
        }).join('')
        : '<th>Column 1</th><th>Column 2</th><th>Column 3</th>';

    // Generate skeleton data rows
    const numCols = columns.length > 0 ? Math.min(columns.length, 8) : 3;
    const skeletonRows = Array(Math.min(pageSize, 5)).fill(0).map(() => {
        return `<tr>${Array(numCols).fill(0).map(() =>
            '<td><div class="fb-skeleton" style="height:1rem;width:80%;border-radius:0.25rem">&nbsp;</div></td>'
        ).join('')}</tr>`;
    }).join('');

    // Search bar skeleton (if search is enabled in binding)
    const searchEnabled = (binding.filtering as any)?.searchEnabled !== false;
    const searchHtml = searchEnabled ? `
        <div class="fb-datatable-search">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search..." disabled />
        </div>` : '';

    // Use data-react-component for React hydration (entry.tsx looks for this)
    return `<div id="${id}" class="fb-datatable" data-react-component="DataTable" data-react-props="${escapeHtml(reactPropsJson)}" data-component-id="${id}">
        <div class="fb-datatable-header">
            <h3 class="fb-datatable-title">${title}</h3>
            ${searchHtml}
        </div>
        <div class="fb-datatable-content">
            <div class="fb-datatable-scroll">
                <table class="fb-table">
                    <thead class="fb-table-header">
                        <tr>${headerCells}</tr>
                    </thead>
                    <tbody class="fb-table-body fb-loading">
                        ${skeletonRows}
                    </tbody>
                </table>
            </div>
        </div>
        ${showPagination ? `<div class="fb-datatable-pagination">
            <span class="fb-skeleton" style="width:100px;height:1rem">&nbsp;</span>
            <div class="fb-pagination-btns">
                <button disabled>← Previous</button>
                <button disabled>Next →</button>
            </div>
        </div>` : ''}
    </div>`;
}

function renderForm(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const binding = props.binding as Record<string, unknown> || {};
    const title = escapeHtml(String(props.title || 'Form'));
    const tableName = (props._tableName as string) || (binding.tableName as string) || props.tableName as string || props.table as string || '';
    const dataSourceId = (props._dataSourceId as string) || (binding.dataSourceId as string) || props.dataSourceId as string || '';
    const fieldOverrides = (props._fieldOverrides as Record<string, any>) || (binding.fieldOverrides as Record<string, any>) || props.fieldOverrides as Record<string, any> || {};
    const fieldOrder = (props._fieldOrder as string[]) || (binding.fieldOrder as string[]) || props.fieldOrder as string[] || [];
    const columns = (props._columns as any[]) || (binding.columns as any[]) || [];
    const foreignKeys = (props._foreignKeys as any[]) || (binding.foreignKeys as any[]) || [];

    // Build react props for hydration — include columns for client-side rendering
    const reactProps = {
        binding: {
            ...binding,
            columns,
            foreignKeys,
            tableName,
            dataSourceId,
            fieldOverrides,
            fieldOrder,
        },
        tableName,
        dataSourceId,
        fieldOverrides,
        fieldOrder,
        title: props.title || '',
        showCard: props.showCard !== false,
    };
    const reactPropsJson = JSON.stringify(reactProps).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    // Generate form fields from baked column data (or skeleton if no data)
    let fieldsHtml: string;
    const orderedColumns = fieldOrder.length > 0
        ? fieldOrder.map(name => columns.find((c: any) => (typeof c === 'string' ? c : c.name) === name) || name)
        : columns;

    if (orderedColumns.length > 0) {
        fieldsHtml = orderedColumns.map((col: any) => {
            const colName = typeof col === 'string' ? col : col.name;
            const colType = typeof col === 'object' ? col.type : 'text';
            const override = fieldOverrides[colName] || {};
            if (override.hidden) return '';
            const label = override.label || colName.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
            const isTextarea = colType === 'text' && !override.type;
            return `
                <div class="fb-form-field">
                    <label class="fb-form-label">${escapeHtml(label)}</label>
                    ${isTextarea
                        ? `<textarea class="fb-textarea" placeholder="${escapeHtml(label)}" disabled></textarea>`
                        : `<input class="fb-input" type="${override.type || 'text'}" placeholder="${escapeHtml(label)}" disabled />`}
                </div>`;
        }).join('');
    } else {
        // Fallback: generic skeleton fields
        fieldsHtml = Array(3).fill(0).map(() => `
            <div class="fb-form-field">
                <div class="fb-skeleton" style="height:16px;width:60px;margin-bottom:0.25rem">&nbsp;</div>
                <div class="fb-skeleton" style="height:40px;border-radius:var(--radius)">&nbsp;</div>
            </div>
        `).join('');
    }

    // Use data-react-component for React hydration (entry.tsx picks this up)
    return `<div id="${id}" class="fb-form" data-react-component="Form" data-react-props="${escapeHtml(reactPropsJson)}" data-component-id="${id}">
        <div class="fb-form-header">
            ${title ? `<h3 class="fb-form-title">${title}</h3>` : ''}
        </div>
        <div class="fb-form-content fb-loading">
            ${fieldsHtml}
        </div>
        <div class="fb-form-actions">
            <button type="submit" class="fb-button" style="padding:0.5rem 1.5rem;border-radius:var(--radius);background:hsl(var(--primary));color:hsl(var(--primary-foreground))" disabled>Submit</button>
            <button type="button" class="fb-button" style="padding:0.5rem 1rem;border-radius:var(--radius);border:1px solid hsl(var(--border))" disabled>Cancel</button>
        </div>
    </div>`;
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
    const subtitle = escapeHtml(String(props.subtitle || props.description || ''));
    const image = props.image as string || props.imageUrl as string || '';
    const icon = props.icon as string || '';
    const iconSvg = props.iconSvg as string || '';
    const iconSize = props.iconSize as string || 'md';
    const iconAlignment = props.iconAlignment as string || 'center';
    const textAlignment = props.textAlignment as string || 'center';

    const style = `border:1px solid #e5e7eb;border-radius:0.5rem;overflow:hidden;text-align:${textAlignment}`;
    const attrs = getCommonAttributes(id, 'fb-datacard', props, style, 'datacard', propsJson);

    // Check if we have children content - if so, don't show skeleton placeholders
    const hasChildren = childrenHtml && childrenHtml.trim().length > 0;

    // Render icon using the shared primitive from static.ts
    const iconAlignStyle = iconAlignment === 'center' ? 'margin:0 auto 0.75rem auto;' : iconAlignment === 'right' ? 'margin-left:auto;margin-bottom:0.75rem;' : 'margin-bottom:0.75rem;';
    const iconHtml = (icon || iconSvg) ? `
        <div style="${iconAlignStyle}">
            ${renderIconPrimitive(`${id}-icon`, { icon, iconSvg, size: iconSize, color: 'hsl(var(--primary))' })}
        </div>
    ` : '';

    // Only show skeleton placeholders when there's no title/subtitle AND no children
    const titleHtml = title
        ? `<h4 style="margin:0 0 0.25rem 0;font-weight:600">${title}</h4>`
        : (hasChildren ? '' : '<div class="fb-skeleton" style="height:1.25rem;width:60%;margin-bottom:0.5rem">&nbsp;</div>');

    const subtitleHtml = subtitle
        ? `<p style="margin:0;color:#6b7280;font-size:0.875rem">${subtitle}</p>`
        : (hasChildren ? '' : '<div class="fb-skeleton" style="height:0.875rem;width:80%">&nbsp;</div>');

    return `<div ${attrs}>
        ${image ? `<div class="fb-datacard-image" style="height:160px;background:#f3f4f6">
            <img src="${escapeHtml(image)}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" />
        </div>` : ''}
        <div class="fb-datacard-content" style="padding:1rem">
            ${iconHtml}
            ${titleHtml}
            ${subtitleHtml}
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
