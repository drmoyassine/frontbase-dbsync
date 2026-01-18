/**
 * Page Renderer - SSR Component Tree Renderer
 * 
 * Recursively renders page components to HTML string.
 * Supports static, interactive, and data-driven components.
 * Uses LiquidJS for template variable resolution.
 */

import { VariableStore } from './store.js';
import { renderStaticComponent } from './components/static.js';
import { renderInteractiveComponent } from './components/interactive.js';
import { renderDataComponent } from './components/data.js';
import { liquid } from './lib/liquid.js';
import type { TemplateContext } from './lib/context.js';

// Type definitions
export interface PageComponent {
    id: string;
    type: string;
    props?: Record<string, unknown>;
    styles?: Record<string, any>;
    binding?: Record<string, any>;
    children?: PageComponent[];
}

export interface PageLayoutData {
    content: PageComponent[];
    root?: Record<string, unknown>;
}

// Component classification
const STATIC_COMPONENTS = new Set([
    'Text', 'Heading', 'Paragraph', 'Image', 'Badge', 'Divider', 'Spacer',
    'Icon', 'Avatar', 'Logo', 'Label', 'MarkdownContent'
]);

const INTERACTIVE_COMPONENTS = new Set([
    'Button', 'Link', 'Tabs', 'Accordion', 'Modal', 'Dropdown', 'Tooltip',
    'Toggle', 'Checkbox', 'Radio', 'Switch'
]);

const DATA_COMPONENTS = new Set([
    'DataTable', 'Form', 'InfoList', 'Chart', 'Grid', 'List',
    'Card', 'Repeater', 'DataCard'
]);

const LAYOUT_COMPONENTS = new Set([
    'Container', 'Section', 'Row', 'Column', 'Flex', 'Grid',
    'Stack', 'Group', 'Box', 'Paper', 'Panel'
]);

/**
 * Classify a component by its type.
 */
function classifyComponent(type: string): 'static' | 'interactive' | 'data' | 'layout' | 'unknown' {
    if (STATIC_COMPONENTS.has(type)) return 'static';
    if (INTERACTIVE_COMPONENTS.has(type)) return 'interactive';
    if (DATA_COMPONENTS.has(type)) return 'data';
    if (LAYOUT_COMPONENTS.has(type)) return 'layout';
    return 'unknown';
}

/**
 * Resolve dynamic props that contain LiquidJS template expressions.
 * Supports: {{ variable }}, {{ var | filter }}, {% if %}...{% endif %}, {% for %}...{% endfor %}
 * NOW ASYNC due to LiquidJS.
 */
async function resolveProps(
    props: Record<string, unknown> | undefined,
    context: TemplateContext
): Promise<Record<string, unknown>> {
    if (!props) return {};

    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(props)) {
        if (typeof value === 'string' && (value.includes('{{') || value.includes('{%'))) {
            // Use LiquidJS for template rendering
            try {
                resolved[key] = await liquid.parseAndRender(value, context);
            } catch (error) {
                console.error(`Template error in prop "${key}":`, error);
                resolved[key] = value; // Fallback to original value
            }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Recursively resolve nested objects
            resolved[key] = await resolveProps(value as Record<string, unknown>, context);
        } else {
            resolved[key] = value;
        }
    }

    return resolved;
}

/**
 * Render a single component to HTML.
 * NOW ASYNC due to LiquidJS template resolution.
 */
async function renderComponent(
    component: PageComponent,
    context: TemplateContext,
    depth: number = 0
): Promise<string> {
    const { id, type, props, styles, children, binding } = component;
    const resolvedProps = await resolveProps(props, context);

    // Inject styles and className from component definition into resolvedProps
    if (styles) {
        resolvedProps.style = styles;
    }

    // Ensure className is passed through
    if (props && props.className) {
        resolvedProps.className = props.className;
    }

    const classification = classifyComponent(type);

    // Render children recursively (async)
    const childrenHtml = children
        ? (await Promise.all(children.map(child => renderComponent(child, context, depth + 1)))).join('')
        : '';

    switch (classification) {
        case 'static':
            return renderStaticComponent(type, id, resolvedProps, childrenHtml);

        case 'interactive':
            return renderInteractiveComponent(type, id, resolvedProps, childrenHtml);

        case 'data':
            // Merge binding into props so renderDataComponent can access it
            if (binding) {
                resolvedProps.binding = binding;
            }
            return renderDataComponent(type, id, resolvedProps, childrenHtml);

        case 'layout':
            // Fallback for layout if function missing, or use static
            return renderStaticComponent(type, id, resolvedProps, childrenHtml);

        default:
            // Unknown component - render as a generic div with data attribute
            return `<div data-fb-component="${type}" data-fb-id="${id}" class="fb-unknown">${childrenHtml}</div>`;
    }
}

/**
 * Render layout components (Container, Section, Row, etc.)
 */
function renderLayoutComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    childrenHtml: string
): string {
    const style = buildStyleString(props);
    const className = buildClassName('fb-layout', type.toLowerCase(), props.className as string);

    switch (type) {
        case 'Container':
            return `<div id="${id}" class="${className}" style="${style}">${childrenHtml}</div>`;

        case 'Section':
            return `<section id="${id}" class="${className}" style="${style}">${childrenHtml}</section>`;

        case 'Row':
            return `<div id="${id}" class="${className} fb-row" style="display:flex;flex-direction:row;${style}">${childrenHtml}</div>`;

        case 'Column':
            return `<div id="${id}" class="${className} fb-column" style="display:flex;flex-direction:column;${style}">${childrenHtml}</div>`;

        case 'Flex':
            const flexDirection = (props.direction as string) || 'row';
            const justify = (props.justify as string) || 'flex-start';
            const align = (props.align as string) || 'stretch';
            const gap = (props.gap as string) || '0';
            return `<div id="${id}" class="${className}" style="display:flex;flex-direction:${flexDirection};justify-content:${justify};align-items:${align};gap:${gap};${style}">${childrenHtml}</div>`;

        case 'Grid':
            const columns = (props.columns as number) || 2;
            const gridGap = (props.gap as string) || '1rem';
            return `<div id="${id}" class="${className}" style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:${gridGap};${style}">${childrenHtml}</div>`;

        case 'Stack':
            const stackGap = (props.gap as string) || '1rem';
            return `<div id="${id}" class="${className}" style="display:flex;flex-direction:column;gap:${stackGap};${style}">${childrenHtml}</div>`;

        case 'Box':
        case 'Paper':
        case 'Panel':
        case 'Group':
        default:
            return `<div id="${id}" class="${className}" style="${style}">${childrenHtml}</div>`;
    }
}

/**
 * Build inline style string from props.
 */
function buildStyleString(props: Record<string, unknown>): string {
    const styleProps: Record<string, string> = {};

    // Map common props to CSS
    const propMap: Record<string, string> = {
        padding: 'padding',
        margin: 'margin',
        width: 'width',
        height: 'height',
        maxWidth: 'max-width',
        minWidth: 'min-width',
        maxHeight: 'max-height',
        minHeight: 'min-height',
        background: 'background',
        backgroundColor: 'background-color',
        color: 'color',
        border: 'border',
        borderRadius: 'border-radius',
        boxShadow: 'box-shadow',
        opacity: 'opacity',
        overflow: 'overflow',
    };

    for (const [prop, css] of Object.entries(propMap)) {
        if (props[prop] !== undefined) {
            styleProps[css] = String(props[prop]);
        }
    }

    // Handle custom style object
    if (props.style && typeof props.style === 'object') {
        Object.assign(styleProps, props.style);
    }

    return Object.entries(styleProps)
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
}

/**
 * Build className string from multiple sources.
 */
function buildClassName(...classes: (string | undefined)[]): string {
    return classes.filter(Boolean).join(' ');
}

/**
 * Main entry point: Render a page layout to HTML.
 * NOW ASYNC due to LiquidJS template resolution.
 */
export async function renderPage(
    layoutData: PageLayoutData,
    context: TemplateContext
): Promise<string> {
    if (!layoutData || !layoutData.content) {
        return '<div class="fb-empty">No content</div>';
    }

    // Apply root styles if present
    const rootProps = layoutData.root || {};

    // Extract containerStyles from root (builder format)
    const containerStyles = (rootProps as any).containerStyles;
    let rootStyle = '';
    let rootClass = (rootProps as any).className as string || '';

    if (containerStyles) {
        // Handle NEW StylesData format: { activeProperties: [...], values: {...} }
        if ('values' in containerStyles && containerStyles.values) {
            const { values } = containerStyles;
            const styleParts: string[] = [];

            // Apply ALL styles from values (not just activeProperties)
            for (const [prop, value] of Object.entries(values)) {
                if (value !== undefined && value !== null && value !== '' && prop !== 'className') {
                    // Convert camelCase to kebab-case for CSS
                    const cssKey = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                    styleParts.push(`${cssKey}:${value}`);
                }
            }

            // Also check for className in values
            if (values.className) {
                rootClass = buildClassName(rootClass, String(values.className));
            }

            rootStyle = styleParts.join(';');
        }
        // Handle OLD ContainerStyles format (direct properties)
        else {
            rootStyle = buildStyleString(containerStyles as Record<string, unknown>);
        }
    } else {
        // Fallback to direct root properties
        rootStyle = buildStyleString(rootProps as Record<string, unknown>);
    }

    // Render all top-level components (async) - wrapped for proper block layout
    const contentHtml = (await Promise.all(
        layoutData.content.map(component => renderComponent(component, context))
    )).join('');

    return `<div class="fb-page ${rootClass}" style="${rootStyle}">${contentHtml}</div>`;
}

export { renderComponent, resolveProps, classifyComponent };
export type { TemplateContext };
