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
import { escapeHtml } from './components/lib/utils.js';
import type { TemplateContext } from './lib/context.js';

// Type definitions
export interface PageComponent {
    id: string;
    type: string;
    props?: Record<string, unknown>;
    styles?: Record<string, any>;
    stylesData?: Record<string, any>; // Builder stores viewportOverrides here
    binding?: Record<string, any>;
    visibility?: { mobile: boolean; tablet: boolean; desktop: boolean; };
    children?: PageComponent[];
}

export interface PageLayoutData {
    content: PageComponent[];
    root?: Record<string, unknown>;
}

// Component classification
const STATIC_COMPONENTS = new Set([
    'Text', 'Heading', 'Paragraph', 'Image', 'Badge', 'Divider', 'Spacer',
    'Icon', 'Avatar', 'Logo', 'Label', 'MarkdownContent', 'Embed'
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
    'Hero', 'Features', 'FeatureSection', 'Pricing', 'CTA', 'Navbar', 'FAQ', 'LogoCloud', 'Footer'
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
    let resolvedProps = await resolveProps(props, context);

    // Special handling for Navbar with useProjectLogo or showIcon
    if (type === 'Navbar' && resolvedProps.logo) {
        const logoProps = resolvedProps.logo as any;
        // Inject faviconUrl if either useProjectLogo or showIcon is enabled
        if (logoProps.useProjectLogo || logoProps.showIcon) {
            // Inject faviconUrl from project settings (Edge's local database)
            const { getFaviconUrl } = await import('../db/project-settings.js');
            const faviconUrl = await getFaviconUrl();

            // Inject the favicon URL into the logo imageUrl property
            resolvedProps = {
                ...resolvedProps,
                logo: {
                    ...logoProps,
                    imageUrl: faviconUrl,
                }
            };
        }
    }

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

    // Build responsive CSS for viewport-specific style overrides (font-size, colors, etc.)
    // Check both styles and stylesData (builder uses stylesData with viewportOverrides)
    const stylesForCSS = component.stylesData || component.styles;
    const responsiveCSS = stylesForCSS ? buildResponsiveCSS(id, stylesForCSS) : '';
    // Build visibility CSS for hidden viewports
    const visibilityCSS = buildVisibilityCSS(id, component.visibility);
    // Combine CSS - prepend to component HTML
    const combinedCSS = responsiveCSS + visibilityCSS;

    switch (classification) {
        case 'static':
            return combinedCSS + renderStaticComponent(type, id, resolvedProps, childrenHtml);

        case 'interactive':
            return combinedCSS + renderInteractiveComponent(type, id, resolvedProps, childrenHtml);

        case 'data':
            // Merge binding into props so renderDataComponent can access it
            if (binding) {
                resolvedProps.binding = binding;
            }
            return combinedCSS + renderDataComponent(type, id, resolvedProps, childrenHtml);

        case 'layout':
            // Render layout components with proper styles and visibility (has its own CSS handling)
            return renderLayoutComponent(type, id, resolvedProps, component.styles || {}, childrenHtml, component.visibility);

        case 'landing':
            // Render landing page section components
            return combinedCSS + renderLandingComponent(type, id, resolvedProps, component.styles);

        default:
            // Unknown component - render as a generic div with data attribute
            return combinedCSS + `<div data-fb-component="${type}" data-fb-id="${id}" class="fb-unknown">${childrenHtml}</div>`;
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
        case 'FeatureSection':
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
    childrenHtml: string,
    visibility?: { mobile: boolean; tablet: boolean; desktop: boolean; }
): string {
    // Build inline style from both props and styles object
    const inlineStyle = buildInlineStyles(props, styles);
    const className = buildClassName('fb-layout', type.toLowerCase(), props.className as string);

    // Use custom anchor slug if provided, otherwise fall back to component ID
    const elementId = (props.anchor as string) || id;

    // Generate responsive CSS media queries for viewport overrides
    const responsiveCSS = buildResponsiveCSS(id, styles);

    // Generate visibility CSS for hidden viewports
    const visibilityCSS = buildVisibilityCSS(id, visibility);

    // Combine CSS blocks
    const combinedCSS = responsiveCSS + visibilityCSS;

    // Build data-fb-props attribute if actionBindings exist (for hover tooltips, etc.)
    const actionBindings = props.actionBindings as Array<unknown> | undefined;
    const propsAttr = actionBindings && actionBindings.length > 0
        ? ` data-fb-props="${escapeHtml(JSON.stringify({ actionBindings }))}"`
        : '';

    switch (type) {
        case 'Container':
            // Check if this container uses grid layout
            const containerDisplay = styles.display || '';
            const isGridContainer = containerDisplay === 'grid';

            if (isGridContainer) {
                // Parse grid columns for responsive behavior
                const gridCols = (() => {
                    const colsStyle = styles.gridTemplateColumns || '';
                    if (typeof colsStyle === 'string') {
                        const match = colsStyle.match(/repeat\((\d+)/);
                        if (match) return parseInt(match[1], 10);
                    }
                    return 2;
                })();

                // Build responsive grid classes: 1 col on mobile, 2 on tablet, N on desktop
                const responsiveGridClass = gridCols <= 2
                    ? 'grid grid-cols-1 md:grid-cols-2'
                    : gridCols === 3
                        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                        : `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(gridCols, 4)}`;

                // Remove grid-template-columns from inline style since we use Tailwind classes
                const gridGapStyle = styles.gap ? `gap:${styles.gap};` : '';

                return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} ${responsiveGridClass}" style="margin:0 auto;width:100%;${gridGapStyle}${inlineStyle.replace(/display:\s*grid[^;]*;?/gi, '').replace(/grid-template-columns[^;]*;?/gi, '')}">${childrenHtml}</div>`;
            }

            // Non-grid container
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="margin:0 auto;width:100%;${inlineStyle}">${childrenHtml}</div>`;

        case 'Section':
            return `${combinedCSS}<section id="${elementId}"${propsAttr} class="${className}" style="${inlineStyle}">${childrenHtml}</section>`;

        case 'Row':
            // Row: flex on desktop, stack on mobile
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} fb-row flex flex-col md:flex-row" style="width:100%;min-height:50px;${inlineStyle}">${childrenHtml}</div>`;

        case 'Column':
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} fb-column" style="display:flex;flex-direction:column;min-height:50px;min-width:50px;${inlineStyle}">${childrenHtml}</div>`;

        case 'Flex':
            const flexDirection = (styles.flexDirection as string) || (props.direction as string) || 'row';
            const justify = (styles.justifyContent as string) || (props.justify as string) || 'flex-start';
            const align = (styles.alignItems as string) || (props.align as string) || 'stretch';
            const gap = (styles.gap as string) || (props.gap as string) || '0';
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="display:flex;flex-direction:${flexDirection};justify-content:${justify};align-items:${align};gap:${gap};${inlineStyle}">${childrenHtml}</div>`;

        case 'Grid':
            const columns = (props.columns as number) || 2;
            const gridGap = (styles.gap as string) || (props.gap as string) || '1rem';
            // Responsive grid: 1 col mobile, 2 col tablet, N col desktop
            const gridResponsiveClass = columns <= 2
                ? 'grid grid-cols-1 md:grid-cols-2'
                : columns === 3
                    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                    : `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(columns, 4)}`;
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className} ${gridResponsiveClass}" style="gap:${gridGap};${inlineStyle}">${childrenHtml}</div>`;

        case 'Stack':
            const stackGap = (styles.gap as string) || (props.gap as string) || '1rem';
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="display:flex;flex-direction:column;gap:${stackGap};${inlineStyle}">${childrenHtml}</div>`;

        case 'Box':
        case 'Paper':
        case 'Panel':
        case 'Group':
        default:
            return `${combinedCSS}<div id="${elementId}"${propsAttr} class="${className}" style="${inlineStyle}">${childrenHtml}</div>`;
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

        // Handle horizontalAlign: converts to margin-left/right auto
        if (key === 'horizontalAlign' && typeof value === 'string') {
            if (value === 'center') {
                cssProps['margin-left'] = 'auto';
                cssProps['margin-right'] = 'auto';
            } else if (value === 'right') {
                cssProps['margin-left'] = 'auto';
                cssProps['margin-right'] = '0';
            } else {
                cssProps['margin-left'] = '0';
                cssProps['margin-right'] = 'auto';
            }
            continue;
        }

        // Skip any remaining object values (would become [object Object])
        if (typeof value === 'object') continue;

        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();

        // Auto-append px to numeric values for length properties
        let cssValue = String(value);
        const unitlessProps = [
            'opacity', 'z-index', 'flex', 'flex-grow', 'flex-shrink', 'order',
            'line-height', 'font-weight',
            'grid-column', 'grid-row', 'grid-area', 'grid-column-start', 'grid-column-end',
            'grid-row-start', 'grid-row-end', 'column-count', 'fill-opacity', 'stroke-opacity'
        ];
        if (/^-?\d+(\.\d+)?$/.test(cssValue) && !unitlessProps.includes(cssKey)) {
            cssValue += 'px';
        }

        cssProps[cssKey] = cssValue;
    }

    return Object.entries(cssProps)
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
}

/**
 * Build responsive CSS media queries for viewport-specific style overrides.
 * Returns a <style> tag with media queries for tablet and mobile.
 * 
 * Breakpoints (mobile-first order for cascade):
 * - Desktop: no media query (base styles via inline)
 * - Tablet: @media (max-width: 1024px)
 * - Mobile: @media (max-width: 640px)
 */
function buildResponsiveCSS(componentId: string, styles: Record<string, any>): string {
    if (!styles || !styles.viewportOverrides) {
        return '';
    }

    const viewportOverrides = styles.viewportOverrides;
    const cssRules: string[] = [];

    // Helper to convert style values to CSS properties
    const valuesToCSS = (values: Record<string, any>): string => {
        const props: string[] = [];
        for (const [key, value] of Object.entries(values)) {
            if (value === undefined || value === null || value === '') continue;

            // Helper to append !important
            const withImp = (val: string | number) => `${val} !important`;

            // Handle special 'size' object
            if (key === 'size' && typeof value === 'object') {
                const sizeObj = value as any;
                if (sizeObj.width !== undefined && sizeObj.width !== 'auto') {
                    const widthUnit = sizeObj.widthUnit || 'px';
                    props.push(`width:${withImp(sizeObj.width + widthUnit)}`);
                }
                if (sizeObj.height !== undefined && sizeObj.height !== 'auto') {
                    const heightUnit = sizeObj.heightUnit || 'px';
                    props.push(`height:${withImp(sizeObj.height + heightUnit)}`);
                }
                continue;
            }

            // Handle padding/margin objects
            if ((key === 'padding' || key === 'margin') && typeof value === 'object') {
                const boxObj = value as any;
                if (boxObj.top !== undefined) props.push(`${key}-top:${withImp(boxObj.top + 'px')}`);
                if (boxObj.right !== undefined) props.push(`${key}-right:${withImp(boxObj.right + 'px')}`);
                if (boxObj.bottom !== undefined) props.push(`${key}-bottom:${withImp(boxObj.bottom + 'px')}`);
                if (boxObj.left !== undefined) props.push(`${key}-left:${withImp(boxObj.left + 'px')}`);
                continue;
            }

            // Handle horizontalAlign
            if (key === 'horizontalAlign' && typeof value === 'string') {
                if (value === 'center') {
                    props.push(`margin-left:${withImp('auto')}`, `margin-right:${withImp('auto')}`);
                } else if (value === 'right') {
                    props.push(`margin-left:${withImp('auto')}`, `margin-right:${withImp(0)}`);
                } else {
                    props.push(`margin-left:${withImp(0)}`, `margin-right:${withImp('auto')}`);
                }
                continue;
            }

            // Skip object values
            if (typeof value === 'object') continue;

            const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();

            // Auto-append px to numeric values for length properties
            let cssValue = String(value);
            const unitlessProps = [
                'opacity', 'z-index', 'flex', 'flex-grow', 'flex-shrink', 'order',
                'line-height', 'font-weight',
                'grid-column', 'grid-row', 'grid-area', 'grid-column-start', 'grid-column-end',
                'grid-row-start', 'grid-row-end', 'column-count', 'fill-opacity', 'stroke-opacity'
            ];
            if (/^-?\d+(\.\d+)?$/.test(cssValue) && !unitlessProps.includes(cssKey)) {
                cssValue += 'px';
            }

            props.push(`${cssKey}:${withImp(cssValue)}`);
        }
        return props.join(';');
    };

    // Tablet overrides (max-width: 1024px)
    if (viewportOverrides.tablet && Object.keys(viewportOverrides.tablet).length > 0) {
        const tabletCSS = valuesToCSS(viewportOverrides.tablet);
        if (tabletCSS) {
            cssRules.push(`@media(max-width:1024px){[id="${componentId}"]{${tabletCSS}}}`);
        }
    }

    // Mobile overrides (max-width: 640px)
    if (viewportOverrides.mobile && Object.keys(viewportOverrides.mobile).length > 0) {
        const mobileCSS = valuesToCSS(viewportOverrides.mobile);
        if (mobileCSS) {
            cssRules.push(`@media(max-width:640px){[id="${componentId}"]{${mobileCSS}}}`);
        }
    }

    if (cssRules.length === 0) {
        return '';
    }

    return `<style>${cssRules.join('')}</style>`;
}

/**
 * Build CSS media queries for per-viewport visibility.
 * Generates display:none rules for viewports where component is hidden.
 * 
 * Default visibility is true (visible) for all viewports.
 */
function buildVisibilityCSS(componentId: string, visibility: any): string {
    if (!visibility) return '';

    const { mobile = true, tablet = true, desktop = true } = visibility;

    // If all visible, no CSS needed
    if (mobile && tablet && desktop) return '';

    const cssRules: string[] = [];

    // Desktop hidden (min-width: 1025px)
    if (!desktop) {
        cssRules.push(`@media(min-width:1025px){[id="${componentId}"]{display:none!important}}`);
    }

    // Tablet hidden (641px - 1024px)
    if (!tablet) {
        cssRules.push(`@media(min-width:641px) and (max-width:1024px){[id="${componentId}"]{display:none!important}}`);
    }

    // Mobile hidden (max-width: 640px)
    if (!mobile) {
        cssRules.push(`@media(max-width:640px){[id="${componentId}"]{display:none!important}}`);
    }

    if (cssRules.length === 0) return '';

    return `<style>${cssRules.join('')}</style>`;
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
