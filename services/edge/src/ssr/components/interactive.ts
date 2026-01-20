/**
 * Interactive Component Renderers
 * 
 * Renders components that need client-side interactivity (Button, Tabs, etc.)
 * These are rendered with hydration markers for React to take over.
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
    propsJson: string
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
                const key = k.replace(/([A-Z])/g, '-$1').toLowerCase();
                return `${key}:${v}`;
            })
            .join(';');
    }

    const finalStyle = [extraStyle, propStyleString].filter(Boolean).join(';');

    return `id="${id}" class="${className}" style="${finalStyle}" data-fb-hydrate="${hydrateType}" data-fb-props="${escapeHtml(propsJson)}"`;
}

/**
 * Render interactive components to HTML with hydration markers.
 */
export function renderInteractiveComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    childrenHtml: string
): string {
    // Serialize props for client hydration
    const propsJson = JSON.stringify(props).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    switch (type) {
        case 'Button':
            return renderButton(id, props, propsJson);

        case 'Link':
            return renderLink(id, props, propsJson);

        case 'Tabs':
            return renderTabs(id, props, childrenHtml, propsJson);

        case 'Accordion':
            return renderAccordion(id, props, childrenHtml, propsJson);

        case 'Modal':
            return renderModal(id, props, childrenHtml, propsJson);

        case 'Dropdown':
            return renderDropdown(id, props, childrenHtml, propsJson);

        case 'Toggle':
        case 'Switch':
            return renderToggle(id, props, propsJson);

        case 'Checkbox':
            return renderCheckbox(id, props, propsJson);

        case 'Radio':
            return renderRadio(id, props, propsJson);

        case 'Tooltip':
            return renderTooltip(id, props, childrenHtml, propsJson);

        default:
            // Fallback for unknown interactive components
            return `<div data-fb-id="${id}" data-fb-type="${type}" data-fb-hydrate="true" data-fb-props="${escapeHtml(propsJson)}">${childrenHtml}</div>`;
    }
}

// =============================================================================
// Individual Component Renderers
// =============================================================================

function renderButton(id: string, props: Record<string, unknown>, propsJson: string): string {
    const label = escapeHtml(String(props.label || props.text || props.children || 'Button'));
    const variant = props.variant as string || 'default';
    const size = props.size as string || 'md';
    const disabled = props.disabled as boolean || false;
    const fullWidth = props.fullWidth as boolean || false;
    const loading = props.loading as boolean || false;

    // Variant styles - matching shadcn/ui button variants
    // Uses CSS variables defined in the SSR HTML head
    const variantStyles: Record<string, string> = {
        default: 'background:hsl(var(--primary));color:hsl(var(--primary-foreground));border:none',
        primary: 'background:hsl(var(--primary));color:hsl(var(--primary-foreground));border:none',
        secondary: 'background:hsl(var(--secondary));color:hsl(var(--secondary-foreground));border:none',
        destructive: 'background:hsl(var(--destructive));color:hsl(var(--destructive-foreground));border:none',
        outline: 'background:transparent;color:hsl(var(--foreground));border:1px solid hsl(var(--border))',
        ghost: 'background:transparent;color:hsl(var(--foreground));border:none',
        link: 'background:transparent;color:hsl(var(--primary));border:none;text-decoration:underline',
    };

    // Size styles
    const sizeStyles: Record<string, string> = {
        xs: 'padding:0.25rem 0.5rem;font-size:0.75rem',
        sm: 'padding:0.375rem 0.75rem;font-size:0.875rem',
        md: 'padding:0.5rem 1rem;font-size:1rem',
        lg: 'padding:0.625rem 1.25rem;font-size:1.125rem',
        xl: 'padding:0.75rem 1.5rem;font-size:1.25rem',
    };

    const style = `${variantStyles[variant] || variantStyles.default};${sizeStyles[size] || sizeStyles.md};border-radius:0.375rem;cursor:pointer;font-weight:500;transition:all 0.15s;${fullWidth ? 'width:100%' : 'width:fit-content'};${disabled ? 'opacity:0.5;cursor:not-allowed' : ''}`;

    // Note: We use getCommonAttributes to handle className and extra styles
    const attrs = getCommonAttributes(id, `fb-button fb-button-${variant}`, props, style, 'button', propsJson);

    return `<button ${attrs} ${disabled ? 'disabled' : ''}>
        ${loading ? '<span class="fb-spinner" style="margin-right:0.5rem">⏳</span>' : ''}
        ${label}
    </button>`;
}

function renderLink(id: string, props: Record<string, unknown>, propsJson: string): string {
    const text = escapeHtml(String(props.text || props.label || props.children || 'Link'));
    const href = escapeHtml(String(props.href || props.to || '#'));
    const target = props.target as string || '_self';
    const color = props.color as string || '#3b82f6';
    const underline = props.underline !== false;

    const style = `color:${color};${underline ? 'text-decoration:underline' : 'text-decoration:none'};cursor:pointer`;
    const attrs = getCommonAttributes(id, 'fb-link', props, style, 'link', propsJson);

    return `<a ${attrs} href="${href}" target="${target}">${text}</a>`;
}

function renderTabs(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const tabs = props.tabs as Array<{ id: string; label: string; content?: string }> || [];
    const activeTab = props.activeTab as string || (tabs[0]?.id ?? '');
    const variant = props.variant as string || 'default';

    // Render tab buttons
    const tabButtons = tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const activeStyle = isActive ? 'border-bottom:2px solid #3b82f6;color:#3b82f6' : 'border-bottom:2px solid transparent;color:#6b7280';
        return `<button class="fb-tab-button" data-tab-id="${tab.id}" style="padding:0.5rem 1rem;background:none;border:none;${activeStyle};cursor:pointer;font-weight:500">${escapeHtml(tab.label)}</button>`;
    }).join('');

    // Render tab panels
    const tabPanels = tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return `<div class="fb-tab-panel" data-tab-id="${tab.id}" style="${isActive ? '' : 'display:none'};padding:1rem 0">${tab.content ? escapeHtml(String(tab.content)) : ''}</div>`;
    }).join('');

    const attrs = getCommonAttributes(id, `fb-tabs fb-tabs-${variant}`, props, '', 'tabs', propsJson);

    return `<div ${attrs}>
        <div class="fb-tabs-list" style="display:flex;border-bottom:1px solid #e5e7eb;margin-bottom:1rem">${tabButtons}</div>
        <div class="fb-tabs-content">${tabPanels}${childrenHtml}</div>
    </div>`;
}

function renderAccordion(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const items = props.items as Array<{ id: string; title: string; content?: string }> || [];
    const allowMultiple = props.allowMultiple as boolean || false;
    const openItems = (props.openItems as string[]) || [];

    const accordionItems = items.map((item) => {
        const isOpen = openItems.includes(item.id);
        return `<div class="fb-accordion-item" data-accordion-id="${item.id}" style="border:1px solid #e5e7eb;margin-bottom:-1px">
            <button class="fb-accordion-trigger" style="width:100%;padding:1rem;display:flex;justify-content:space-between;align-items:center;background:none;border:none;cursor:pointer;font-weight:500;text-align:left">
                ${escapeHtml(item.title)}
                <span style="transform:rotate(${isOpen ? '180deg' : '0deg'});transition:transform 0.2s">▼</span>
            </button>
            <div class="fb-accordion-content" style="${isOpen ? '' : 'display:none'};padding:1rem;border-top:1px solid #e5e7eb">${item.content ? escapeHtml(String(item.content)) : ''}</div>
        </div>`;
    }).join('');

    const attrs = getCommonAttributes(id, 'fb-accordion', props, '', 'accordion', propsJson);

    return `<div ${attrs} data-allow-multiple="${allowMultiple}">
        ${accordionItems}${childrenHtml}
    </div>`;
}

function renderModal(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const title = escapeHtml(String(props.title || ''));
    const isOpen = props.isOpen as boolean || false;
    const size = props.size as string || 'md';

    const sizeWidths: Record<string, string> = {
        sm: '400px',
        md: '500px',
        lg: '700px',
        xl: '900px',
        full: '95vw',
    };

    const style = `display:${isOpen ? 'flex' : 'none'};position:fixed;inset:0;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;z-index:1000`;
    const attrs = getCommonAttributes(id, 'fb-modal', props, style, 'modal', propsJson);

    return `<div ${attrs}>
        <div class="fb-modal-content" style="background:#fff;border-radius:0.5rem;width:${sizeWidths[size] || sizeWidths.md};max-height:90vh;overflow:auto">
            ${title ? `<div class="fb-modal-header" style="padding:1rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
                <h3 style="margin:0;font-size:1.125rem">${title}</h3>
                <button class="fb-modal-close" style="background:none;border:none;font-size:1.5rem;cursor:pointer;line-height:1">×</button>
            </div>` : ''}
            <div class="fb-modal-body" style="padding:1rem">${childrenHtml}</div>
        </div>
    </div>`;
}

function renderDropdown(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const label = escapeHtml(String(props.label || props.trigger || 'Menu'));
    const items = props.items as Array<{ id: string; label: string; icon?: string }> || [];

    const menuItems = items.map((item) => {
        return `<button class="fb-dropdown-item" data-item-id="${item.id}" style="width:100%;padding:0.5rem 1rem;text-align:left;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:0.5rem">
            ${item.icon ? `<span class="fb-dropdown-icon">${escapeHtml(item.icon)}</span>` : ''}
            ${escapeHtml(item.label)}
        </button>`;
    }).join('');

    const style = `position:relative;display:inline-block`;
    const attrs = getCommonAttributes(id, 'fb-dropdown', props, style, 'dropdown', propsJson);

    return `<div ${attrs}>
        <button class="fb-dropdown-trigger" style="padding:0.5rem 1rem;background:#f3f4f6;border:1px solid #d1d5db;border-radius:0.375rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem">
            ${label}
            <span>▼</span>
        </button>
        <div class="fb-dropdown-menu" style="display:none;position:absolute;top:100%;left:0;min-width:160px;background:#fff;border:1px solid #e5e7eb;border-radius:0.375rem;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:100">
            ${menuItems}${childrenHtml}
        </div>
    </div>`;
}

function renderToggle(id: string, props: Record<string, unknown>, propsJson: string): string {
    const checked = props.checked as boolean || props.value as boolean || false;
    const label = escapeHtml(String(props.label || ''));
    const disabled = props.disabled as boolean || false;

    const style = `display:inline-flex;align-items:center;gap:0.5rem;cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? '0.5' : '1'}`;
    const attrs = getCommonAttributes(id, 'fb-toggle', props, style, 'toggle', propsJson);

    return `<label ${attrs}>
        <span class="fb-toggle-track" style="position:relative;width:44px;height:24px;background:${checked ? '#3b82f6' : '#d1d5db'};border-radius:9999px;transition:background 0.2s">
            <span class="fb-toggle-thumb" style="position:absolute;top:2px;left:${checked ? '22px' : '2px'};width:20px;height:20px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span>
        </span>
        ${label ? `<span>${label}</span>` : ''}
        <input type="checkbox" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="position:absolute;opacity:0;pointer-events:none" />
    </label>`;
}

function renderCheckbox(id: string, props: Record<string, unknown>, propsJson: string): string {
    const checked = props.checked as boolean || props.value as boolean || false;
    const label = escapeHtml(String(props.label || ''));
    const disabled = props.disabled as boolean || false;

    const style = `display:inline-flex;align-items:center;gap:0.5rem;cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? '0.5' : '1'}`;
    const attrs = getCommonAttributes(id, 'fb-checkbox', props, style, 'checkbox', propsJson);

    return `<label ${attrs}>
        <span class="fb-checkbox-box" style="width:18px;height:18px;border:2px solid ${checked ? '#3b82f6' : '#d1d5db'};border-radius:0.25rem;background:${checked ? '#3b82f6' : 'transparent'};display:flex;align-items:center;justify-content:center">
            ${checked ? '<span style="color:#fff;font-size:12px">✓</span>' : ''}
        </span>
        ${label ? `<span>${label}</span>` : ''}
        <input type="checkbox" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="position:absolute;opacity:0;pointer-events:none" />
    </label>`;
}

function renderRadio(id: string, props: Record<string, unknown>, propsJson: string): string {
    const checked = props.checked as boolean || props.selected as boolean || false;
    const label = escapeHtml(String(props.label || ''));
    const name = props.name as string || 'radio-group';
    const disabled = props.disabled as boolean || false;

    const style = `display:inline-flex;align-items:center;gap:0.5rem;cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? '0.5' : '1'}`;
    const attrs = getCommonAttributes(id, 'fb-radio', props, style, 'radio', propsJson);

    return `<label ${attrs}>
        <span class="fb-radio-circle" style="width:18px;height:18px;border:2px solid ${checked ? '#3b82f6' : '#d1d5db'};border-radius:50%;display:flex;align-items:center;justify-content:center">
            ${checked ? '<span style="width:10px;height:10px;background:#3b82f6;border-radius:50%"></span>' : ''}
        </span>
        ${label ? `<span>${label}</span>` : ''}
        <input type="radio" name="${name}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="position:absolute;opacity:0;pointer-events:none" />
    </label>`;
}

function renderTooltip(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const content = escapeHtml(String(props.content || props.text || ''));
    const position = props.position as string || 'top';

    const style = `position:relative;display:inline-block`;
    const attrs = getCommonAttributes(id, 'fb-tooltip', props, style, 'tooltip', propsJson);

    // Tooltip content is hidden by default, shown on hover via CSS/JS
    return `<span ${attrs}>
        ${childrenHtml}
        <span class="fb-tooltip-content" data-position="${position}" style="display:none;position:absolute;background:#1f2937;color:#fff;padding:0.25rem 0.5rem;border-radius:0.25rem;font-size:0.75rem;white-space:nowrap;z-index:100">${content}</span>
    </span>`;
}
