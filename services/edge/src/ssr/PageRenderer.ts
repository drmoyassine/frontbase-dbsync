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
import * as landing from './components/landing/index.js';
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

// Landing page section components
const LANDING_COMPONENTS = new Set([
    'Hero', 'Features', 'Pricing', 'CTA', 'Navbar', 'FAQ', 'LogoCloud', 'Footer'
]);

/**
 * Classify a component by its type.
 */
function classifyComponent(type: string): 'static' | 'interactive' | 'data' | 'layout' | 'landing' | 'unknown' {
    if (STATIC_COMPONENTS.has(type)) return 'static';
    if (INTERACTIVE_COMPONENTS.has(type)) return 'interactive';
    if (DATA_COMPONENTS.has(type)) return 'data';
    if (LAYOUT_COMPONENTS.has(type)) return 'layout';
    if (LANDING_COMPONENTS.has(type)) return 'landing';
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
            // Render layout components with proper styles
            return renderLayoutComponent(type, id, resolvedProps, component.styles || {}, childrenHtml);

        case 'landing':
            // Render landing page section components
            return renderLandingComponent(type, id, resolvedProps, component.styles);

        default:
            // Unknown component - render as a generic div with data attribute
            return `<div data-fb-component="${type}" data-fb-id="${id}" class="fb-unknown">${childrenHtml}</div>`;
    }
}

/**
 * Render landing page section components.
 */
function renderLandingComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    stylesData?: Record<string, any>
): string {
    switch (type) {
        case 'Hero':
            return landing.renderHero(id, props as any, stylesData as any);
        case 'Features':
            return landing.renderFeatures(id, props as any, stylesData as any);
        case 'Pricing':
            return landing.renderPricing(id, props as any, stylesData as any);
        case 'CTA':
            return landing.renderCTA(id, props as any, stylesData as any);
        case 'Navbar':
            return landing.renderNavbar(id, props as any, stylesData as any);
        case 'FAQ':
            return landing.renderFAQ(id, props as any, stylesData as any);
        case 'LogoCloud':
            return landing.renderLogoCloud(id, props as any, stylesData as any);
        case 'Footer':
            return landing.renderFooter(id, props as any, stylesData as any);
        default:
            return `<div data-fb-component="${type}" data-fb-id="${id}" class="fb-landing-unknown"></div>`;
    }
}

/**
 * Render layout components (Container, Section, Row, etc.)
 */
function renderLayoutComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    styles: Record<string, any>,
    childrenHtml: string
): string {
    // Build inline style from both props and styles object
    const inlineStyle = buildInlineStyles(props, styles);
    const className = buildClassName('fb-layout', type.toLowerCase(), props.className as string);

    switch (type) {
        case 'Container':
            // Add margin:0 auto for centering, text-align:center for content alignment
            return `<div id="${id}" class="${className}" style="margin:0 auto;text-align:center;${inlineStyle}">${childrenHtml}</div>`;

        case 'Section':
            return `<section id="${id}" class="${className}" style="${inlineStyle}">${childrenHtml}</section>`;

        case 'Row':
            return `<div id="${id}" class="${className} fb-row" style="display:flex;flex-direction:row;min-height:50px;${inlineStyle}">${childrenHtml}</div>`;

        case 'Column':
            return `<div id="${id}" class="${className} fb-column" style="display:flex;flex-direction:column;min-height:50px;min-width:50px;${inlineStyle}">${childrenHtml}</div>`;

        case 'Flex':
            const flexDirection = (styles.flexDirection as string) || (props.direction as string) || 'row';
            const justify = (styles.justifyContent as string) || (props.justify as string) || 'flex-start';
            const align = (styles.alignItems as string) || (props.align as string) || 'stretch';
            const gap = (styles.gap as string) || (props.gap as string) || '0';
            return `<div id="${id}" class="${className}" style="display:flex;flex-direction:${flexDirection};justify-content:${justify};align-items:${align};gap:${gap};${inlineStyle}">${childrenHtml}</div>`;

        case 'Grid':
            const columns = (props.columns as number) || 2;
            const gridGap = (styles.gap as string) || (props.gap as string) || '1rem';
            return `<div id="${id}" class="${className}" style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:${gridGap};${inlineStyle}">${childrenHtml}</div>`;

        case 'Stack':
            const stackGap = (styles.gap as string) || (props.gap as string) || '1rem';
            return `<div id="${id}" class="${className}" style="display:flex;flex-direction:column;gap:${stackGap};${inlineStyle}">${childrenHtml}</div>`;

        case 'Box':
        case 'Paper':
        case 'Panel':
        case 'Group':
        default:
            return `<div id="${id}" class="${className}" style="${inlineStyle}">${childrenHtml}</div>`;
    }
}

/**
 * Build inline styles from both props and component styles object.
 * The styles object takes precedence.
 * 
 * Supports both formats:
 * - Old flat format: { justifyContent: 'center', padding: '24px' }
 * - New stylesData format: { activeProperties: [...], values: {...}, stylingMode: 'visual' }
 */
function buildInlineStyles(props: Record<string, unknown>, styles: Record<string, any>): string {
    const cssProps: Record<string, string> = {};

    // First, apply props-based styles
    const propMap: Record<string, string> = {
        padding: 'padding',
        margin: 'margin',
        width: 'width',
        height: 'height',
        maxWidth: 'max-width',
        minWidth: 'min-width',
        backgroundColor: 'background-color',
        color: 'color',
    };

    for (const [prop, css] of Object.entries(propMap)) {
        if (props[prop] !== undefined) {
            cssProps[css] = String(props[prop]);
        }
    }

    // Handle styles object - detect which format it is
    let styleValues: Record<string, any> = {};

    if (styles && typeof styles === 'object') {
        // New stylesData format: { activeProperties: [...], values: {...}, stylingMode: '...' }
        if ('values' in styles && typeof styles.values === 'object') {
            styleValues = styles.values || {};
        }
        // Old flat format: { justifyContent: 'center', ... }
        else {
            // Filter out non-CSS keys
            const nonCssKeys = ['activeProperties', 'stylingMode'];
            for (const [key, value] of Object.entries(styles)) {
                if (!nonCssKeys.includes(key)) {
                    styleValues[key] = value;
                }
            }
        }
    }

    // Apply style values - convert camelCase to kebab-case for CSS
    for (const [key, value] of Object.entries(styleValues)) {
        if (value === undefined || value === null || value === '') continue;

        // Handle special 'size' object: { width, widthUnit, height, heightUnit }
        if (key === 'size' && typeof value === 'object') {
            const sizeObj = value as any;
            if (sizeObj.width !== undefined && sizeObj.width !== 'auto') {
                const widthUnit = sizeObj.widthUnit || 'px';
                cssProps['width'] = `${sizeObj.width}${widthUnit}`;
            }
            if (sizeObj.height !== undefined && sizeObj.height !== 'auto') {
                const heightUnit = sizeObj.heightUnit || 'px';
                cssProps['height'] = `${sizeObj.height}${heightUnit}`;
            }
            continue;
        }

        // Handle padding/margin objects: { top, right, bottom, left }
        if ((key === 'padding' || key === 'margin') && typeof value === 'object') {
            const boxObj = value as any;
            if (boxObj.top !== undefined) cssProps[`${key}-top`] = `${boxObj.top}px`;
            if (boxObj.right !== undefined) cssProps[`${key}-right`] = `${boxObj.right}px`;
            if (boxObj.bottom !== undefined) cssProps[`${key}-bottom`] = `${boxObj.bottom}px`;
            if (boxObj.left !== undefined) cssProps[`${key}-left`] = `${boxObj.left}px`;
            continue;
        }

        // Skip any remaining object values (would become [object Object])
        if (typeof value === 'object') continue;

        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        cssProps[cssKey] = String(value);
    }

    return Object.entries(cssProps)
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
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
