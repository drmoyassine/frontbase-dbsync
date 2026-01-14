/**
 * Static Component Renderers
 * 
 * Pure HTML renderers for static components that don't need interactivity.
 * These components render identically on server and client.
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
 * Helper to build common attributes (id, class, style)
 */
function getCommonAttributes(id: string, baseClass: string, props: Record<string, unknown>, extraStyle: string = ''): string {
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
                if (value !== undefined && value !== null && value !== '' && prop !== 'className') {
                    // Convert camelCase to kebab-case for CSS
                    const cssKey = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                    styleParts.push(`${cssKey}:${value}`);
                }
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
                // Convert camelCase to kebab-case if needed, or just trust input
                const key = k.replace(/([A-Z])/g, '-$1').toLowerCase();
                return `${key}:${v}`;
            })
            .join(';');
    }

    const finalStyle = [extraStyle, propStyleString].filter(Boolean).join(';');

    return `id="${id}" class="${className}" style="${finalStyle}"`;
}

/**
 * Render static components to HTML.
 */
export function renderStaticComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    childrenHtml: string
): string {
    switch (type) {
        case 'Text':
            return renderText(id, props);

        case 'Heading':
            return renderHeading(id, props);

        case 'Paragraph':
            return renderParagraph(id, props);

        case 'Image':
            return renderImage(id, props);

        case 'Badge':
            return renderBadge(id, props);

        case 'Divider':
            return renderDivider(id, props);

        case 'Spacer':
            return renderSpacer(id, props);

        case 'Icon':
            return renderIcon(id, props);

        case 'Avatar':
            return renderAvatar(id, props);

        case 'Label':
            return renderLabel(id, props);

        case 'MarkdownContent':
            return renderMarkdown(id, props);

        default:
            // Fallback for unknown static components
            return `<div ${getCommonAttributes(id, 'fb-unknown', props)} data-fb-type="${type}">${childrenHtml}</div>`;
    }
}

// =============================================================================
// Individual Component Renderers
// =============================================================================

function renderText(id: string, props: Record<string, unknown>): string {
    const content = escapeHtml(String(props.content || props.text || props.value || ''));
    const size = props.size as string || 'base';
    const weight = props.weight as string || 'normal';
    const color = props.color as string || 'inherit';
    const align = props.align as string || 'left';

    const style = `font-size:var(--fb-text-${size}, 1rem);font-weight:${weight};color:${color};text-align:${align}`;
    const attrs = getCommonAttributes(id, `fb-text fb-text-${size}`, props, style);

    return `<span ${attrs}>${content}</span>`;
}

function renderHeading(id: string, props: Record<string, unknown>): string {
    const content = escapeHtml(String(props.content || props.text || ''));
    const level = Math.min(Math.max(Number(props.level) || 2, 1), 6);
    const align = props.align as string || 'left';
    const color = props.color as string || 'inherit';

    const style = `text-align:${align};color:${color}`;
    const tag = `h${level}`;
    const attrs = getCommonAttributes(id, `fb-heading fb-heading-${level}`, props, style);

    return `<${tag} ${attrs}>${content}</${tag}>`;
}

function renderParagraph(id: string, props: Record<string, unknown>): string {
    const content = escapeHtml(String(props.content || props.text || ''));
    const align = props.align as string || 'left';
    const color = props.color as string || 'inherit';

    const style = `text-align:${align};color:${color}`;
    const attrs = getCommonAttributes(id, 'fb-paragraph', props, style);

    return `<p ${attrs}>${content}</p>`;
}

function renderImage(id: string, props: Record<string, unknown>): string {
    const src = props.src as string || props.url as string || '';
    const alt = escapeHtml(String(props.alt || ''));
    const width = props.width as string || 'auto';
    const height = props.height as string || 'auto';
    const objectFit = props.objectFit as string || 'cover';
    const borderRadius = props.borderRadius as string || '0';

    const style = `width:${width};height:${height};object-fit:${objectFit};border-radius:${borderRadius}`;
    const attrs = getCommonAttributes(id, 'fb-image', props, style);

    if (!src) {
        return `<div ${attrs} class="fb-image-placeholder" style="${style};background:#e5e5e5;display:flex;align-items:center;justify-content:center;">
            <span style="color:#999">No image</span>
        </div>`;
    }

    return `<img ${attrs} src="${escapeHtml(src)}" alt="${alt}" loading="lazy" />`;
}

function renderBadge(id: string, props: Record<string, unknown>): string {
    const content = escapeHtml(String(props.content || props.text || props.label || ''));
    const variant = props.variant as string || 'default';
    const size = props.size as string || 'sm';

    // Color mapping for variants
    const variantStyles: Record<string, string> = {
        default: 'background:#e5e5e5;color:#333',
        primary: 'background:#3b82f6;color:#fff',
        success: 'background:#22c55e;color:#fff',
        warning: 'background:#f59e0b;color:#fff',
        error: 'background:#ef4444;color:#fff',
        info: 'background:#0ea5e9;color:#fff',
    };

    const sizeStyles: Record<string, string> = {
        xs: 'font-size:0.65rem;padding:0.1rem 0.3rem',
        sm: 'font-size:0.75rem;padding:0.15rem 0.4rem',
        md: 'font-size:0.875rem;padding:0.2rem 0.5rem',
        lg: 'font-size:1rem;padding:0.25rem 0.6rem',
    };

    const style = `${variantStyles[variant] || variantStyles.default};${sizeStyles[size] || sizeStyles.sm};border-radius:9999px;display:inline-flex;align-items:center`;
    const attrs = getCommonAttributes(id, `fb-badge fb-badge-${variant}`, props, style);

    return `<span ${attrs}>${content}</span>`;
}

function renderDivider(id: string, props: Record<string, unknown>): string {
    const orientation = props.orientation as string || 'horizontal';
    const color = props.color as string || '#e5e5e5';
    const thickness = props.thickness as string || '1px';
    const margin = props.margin as string || '1rem 0';

    if (orientation === 'vertical') {
        const style = `width:${thickness};background:${color};margin:${margin};height:100%`;
        const attrs = getCommonAttributes(id, 'fb-divider fb-divider-vertical', props, style);
        return `<div ${attrs}></div>`;
    }

    const style = `border:none;height:${thickness};background:${color};margin:${margin}`;
    const attrs = getCommonAttributes(id, 'fb-divider', props, style);
    return `<hr ${attrs} />`;
}

function renderSpacer(id: string, props: Record<string, unknown>): string {
    const height = props.height as string || props.size as string || '1rem';
    const width = props.width as string || 'auto';

    const style = `height:${height};width:${width}`;
    const attrs = getCommonAttributes(id, 'fb-spacer', props, style);

    return `<div ${attrs} aria-hidden="true"></div>`;
}

function renderIcon(id: string, props: Record<string, unknown>): string {
    const name = props.name as string || props.icon as string || 'circle';
    const size = props.size as string || '1.5rem';
    const color = props.color as string || 'currentColor';

    // For now, render as a placeholder - in production this would use an icon library
    const style = `width:${size};height:${size};color:${color};display:inline-flex;align-items:center;justify-content:center`;
    const attrs = getCommonAttributes(id, 'fb-icon', props, style);

    return `<span ${attrs} data-icon="${escapeHtml(name)}">
        <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
        </svg>
    </span>`;
}

function renderAvatar(id: string, props: Record<string, unknown>): string {
    const src = props.src as string || props.image as string;
    const name = props.name as string || props.alt as string || '';
    const size = props.size as string || '40px';
    const shape = props.shape as string || 'circle';

    const borderRadius = shape === 'circle' ? '50%' : (shape === 'rounded' ? '8px' : '0');
    const baseStyle = `width:${size};height:${size};border-radius:${borderRadius};overflow:hidden;display:flex;align-items:center;justify-content:center`;

    // Note: getCommonAttributes will append to baseStyle if we passed it, but we might want to override or merge.
    // Here we pass baseStyle as extraStyle.

    if (src) {
        const attrs = getCommonAttributes(id, 'fb-avatar', props, baseStyle);
        return `<div ${attrs}>
            <img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" style="width:100%;height:100%;object-fit:cover" />
        </div>`;
    }

    // Fallback to initials
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const style = `${baseStyle};background:#6366f1;color:#fff;font-weight:600;font-size:calc(${size} * 0.4)`;
    const attrs = getCommonAttributes(id, 'fb-avatar fb-avatar-initials', props, style);

    return `<div ${attrs}>
        ${escapeHtml(initials)}
    </div>`;
}

function renderLabel(id: string, props: Record<string, unknown>): string {
    const content = escapeHtml(String(props.content || props.text || ''));
    const htmlFor = props.for as string || props.htmlFor as string || '';
    const required = props.required as boolean;

    const style = `display:block;font-weight:500;margin-bottom:0.25rem`;
    const attrs = getCommonAttributes(id, 'fb-label', props, style);
    const forAttr = htmlFor ? `for="${htmlFor}"` : '';

    return `<label ${attrs} ${forAttr}>
        ${content}${required ? '<span style="color:#ef4444;margin-left:0.25rem">*</span>' : ''}
    </label>`;
}

function renderMarkdown(id: string, props: Record<string, unknown>): string {
    const content = String(props.content || props.markdown || '');
    const attrs = getCommonAttributes(id, 'fb-markdown', props);

    return `<div ${attrs} data-fb-hydrate="markdown">
        <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(content)}</pre>
    </div>`;
}
