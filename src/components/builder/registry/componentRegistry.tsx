/**
 * Component Registry
 * 
 * Maps component type strings to their renderer components.
 * This replaces the massive switch statement in ComponentRenderer.tsx
 * 
 * To add a new component:
 * 1. Create the renderer in appropriate renderers/ file
 * 2. Import and add to this registry
 * 3. Create properties panel in properties/ directory
 * 
 * @see memory-bank/developmentPatterns.md for detailed guide
 */

import * as BasicRenderers from '../renderers/basic';
import * as LayoutRenderers from '../renderers/layout';
import * as FormRenderers from '../renderers/form';
import * as LandingRenderers from '../renderers/landing';
import * as DataRenderers from '../renderers/data';

/**
 * Component registry mapping type strings to renderer components.
 * All renderers must accept RendererProps interface.
 */
export const COMPONENT_REGISTRY: Record<string, React.FC<any>> = {
    // Basic Components
    Button: BasicRenderers.ButtonRenderer,
    Text: BasicRenderers.TextRenderer,
    Heading: BasicRenderers.HeadingRenderer,
    Card: BasicRenderers.CardRenderer,
    Badge: BasicRenderers.BadgeRenderer,
    Image: BasicRenderers.ImageRenderer,
    Alert: BasicRenderers.AlertRenderer,
    Separator: BasicRenderers.SeparatorRenderer,
    Avatar: BasicRenderers.AvatarRenderer,
    Progress: BasicRenderers.ProgressRenderer,
    Link: BasicRenderers.LinkRenderer,
    Icon: BasicRenderers.IconRenderer,

    // Form Components
    Input: FormRenderers.InputRenderer,
    Textarea: FormRenderers.TextareaRenderer,
    Select: FormRenderers.SelectRenderer,
    Checkbox: FormRenderers.CheckboxRenderer,
    Switch: FormRenderers.SwitchRenderer,

    // Layout Components
    Container: LayoutRenderers.ContainerRenderer,
    Row: LayoutRenderers.RowRenderer,
    Column: LayoutRenderers.ColumnRenderer,
    Tabs: LayoutRenderers.TabsRenderer,
    Accordion: LayoutRenderers.AccordionRenderer,
    Breadcrumb: LayoutRenderers.BreadcrumbRenderer,

    // Landing Page Sections
    Navbar: LandingRenderers.NavbarRenderer,
    LogoCloud: LandingRenderers.LogoCloudRenderer,
    FeatureSection: LandingRenderers.FeatureSectionRenderer,
    Footer: LandingRenderers.FooterRenderer,

    // Data Components
    DataTable: DataRenderers.DataTableRenderer,
    KPICard: DataRenderers.KPICardRenderer,
    Chart: DataRenderers.ChartRenderer,
    Grid: DataRenderers.GridRenderer,
};

/**
 * Get renderer component for a given type.
 * Returns null if type is not found in registry.
 * 
 * @param type - Component type string
 * @returns Renderer component or null
 */
export function getRenderer(type: string): React.FC<any> | null {
    return COMPONENT_REGISTRY[type] || null;
}

/**
 * Check if a component type is registered.
 * 
 * @param type - Component type string
 * @returns true if type is registered
 */
export function isRegisteredComponent(type: string): boolean {
    return type in COMPONENT_REGISTRY;
}
