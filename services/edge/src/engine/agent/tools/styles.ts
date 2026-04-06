/**
 * Curated Style Tools (Tier 2)
 * 
 * High-level tools for inspecting and modifying component styles
 * on published pages. Operates on the style values in the layout data.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { stateProvider } from '../../../storage/index.js';
import type { AgentProfile } from '../../../config/env.js';

/**
 * Build style tools gated by the agent profile's permissions.
 */
export function buildStyleTools(profile: AgentProfile): Record<string, any> {
    const tools: Record<string, any> = {};
    const perms = profile.permissions?.['pages.all'] || [];
    const hasRead = perms.includes('read') || perms.includes('all');
    const hasWrite = perms.includes('write') || perms.includes('all');

    if (!hasRead && !hasWrite) return tools;

    // ── Helper: find a component recursively ────────────────────────

    const findComponent = (components: any[], id: string): any | null => {
        for (const c of components) {
            if (c.id === id) return c;
            if (c.children?.length) {
                const found = findComponent(c.children, id);
                if (found) return found;
            }
        }
        return null;
    };

    // ── Read tools ──────────────────────────────────────────────────

    if (hasRead) {
        tools['styles_get'] = tool({
            description: 'Get the current styles for a specific component on a page. Returns the style values (colors, spacing, typography, etc.) and any viewport overrides.',
            parameters: z.object({
                slug: z.string().describe('The page slug'),
                componentId: z.string().describe('The component ID to inspect'),
            }),
            execute: async ({ slug, componentId }: { slug: string; componentId: string }) => {
                try {
                    const page = await stateProvider.getPageBySlug(slug);
                    if (!page) return { error: `Page '${slug}' not found` };

                    const layoutData = page.layoutData;
                    const component = findComponent(layoutData?.content || [], componentId);
                    if (!component) return { error: `Component '${componentId}' not found` };

                    return {
                        componentId,
                        type: component.type,
                        styles: component.styles || {},
                        stylesData: component.stylesData || null,
                    };
                } catch (e: any) {
                    return { error: `Failed to get styles: ${e.message}` };
                }
            },
        } as any);
    }

    // ── Write tools ─────────────────────────────────────────────────

    if (hasWrite) {
        tools['styles_update'] = tool({
            description: 'Update styles for a single component on a page. Merges the provided style values into the component\'s existing styles. Supports CSS properties like backgroundColor, fontSize, padding, margin, borderRadius, color, etc.',
            parameters: z.object({
                slug: z.string().describe('The page slug'),
                componentId: z.string().describe('The component ID to style'),
                styles: z.record(z.any()).describe('Style key-value pairs to merge, e.g. { "backgroundColor": "#1a1a2e", "fontSize": "18px" }'),
            }),
            execute: async ({ slug, componentId, styles }: { slug: string; componentId: string; styles: Record<string, any> }) => {
                try {
                    const page = await stateProvider.getPageBySlug(slug);
                    if (!page) return { error: `Page '${slug}' not found` };

                    const layoutData = { ...page.layoutData };

                    let found = false;
                    const patchStyles = (components: any[]): any[] => {
                        return components.map((c: any) => {
                            if (c.id === componentId) {
                                found = true;
                                const existingStyles = c.styles || {};
                                return { ...c, styles: { ...existingStyles, ...styles } };
                            }
                            if (c.children?.length) {
                                return { ...c, children: patchStyles(c.children) };
                            }
                            return c;
                        });
                    };

                    layoutData.content = patchStyles(layoutData.content || []);
                    if (!found) return { error: `Component '${componentId}' not found` };

                    await stateProvider.upsertPage({ ...page, layoutData });

                    return { success: true, message: `Updated styles for '${componentId}' on page '${slug}'` };
                } catch (e: any) {
                    return { error: `Failed to update styles: ${e.message}` };
                }
            },
        } as any);

        tools['styles_batchUpdate'] = tool({
            description: 'Update styles for multiple components on a page in a single operation. Useful for applying a theme or making coordinated visual changes across several components at once.',
            parameters: z.object({
                slug: z.string().describe('The page slug'),
                updates: z.array(z.object({
                    componentId: z.string().describe('The component ID'),
                    styles: z.record(z.any()).describe('Style key-value pairs to merge'),
                })).describe('Array of component style updates'),
            }),
            execute: async ({ slug, updates }: { slug: string; updates: Array<{ componentId: string; styles: Record<string, any> }> }) => {
                try {
                    const page = await stateProvider.getPageBySlug(slug);
                    if (!page) return { error: `Page '${slug}' not found` };

                    const layoutData = { ...page.layoutData };

                    const updateMap = new Map(updates.map(u => [u.componentId, u.styles]));
                    const applied: string[] = [];

                    const patchAll = (components: any[]): any[] => {
                        return components.map((c: any) => {
                            const newStyles = updateMap.get(c.id);
                            let updated = c;
                            if (newStyles) {
                                applied.push(c.id);
                                updated = { ...c, styles: { ...(c.styles || {}), ...newStyles } };
                            }
                            if (updated.children?.length) {
                                updated = { ...updated, children: patchAll(updated.children) };
                            }
                            return updated;
                        });
                    };

                    layoutData.content = patchAll(layoutData.content || []);

                    // Check which IDs were not found
                    const notFound = updates
                        .filter(u => !applied.includes(u.componentId))
                        .map(u => u.componentId);

                    await stateProvider.upsertPage({ ...page, layoutData });

                    return {
                        success: true,
                        applied: applied.length,
                        notFound: notFound.length > 0 ? notFound : undefined,
                        message: `Updated styles for ${applied.length}/${updates.length} components on page '${slug}'`,
                    };
                } catch (e: any) {
                    return { error: `Failed to batch update styles: ${e.message}` };
                }
            },
        } as any);
    }

    return tools;
}
