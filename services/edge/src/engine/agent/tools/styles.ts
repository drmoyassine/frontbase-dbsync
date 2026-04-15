// @ts-nocheck
/**
 * Curated Style Tools (Tier 2)
 * 
 * High-level tools for inspecting and modifying component styles
 * on published pages. Operates on the style values in the layout data.
 */

import { tool } from 'ai';
import { stateProvider } from '../../../storage/index.js';
import { objectSchema, S } from './schema-helper.js';
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
            parameters: objectSchema({
                slug: S.string('The page slug'),
                componentId: S.string('The component ID to inspect'),
            }),
            execute: async ({ slug, componentId }: any) => {
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
        });
    }

    // ── Write tools ─────────────────────────────────────────────────

    if (hasWrite) {
        tools['styles_update'] = tool({
            description: 'Update styles for a single component on a page. Merges the provided style values into the component\'s existing styles. Supports CSS properties like backgroundColor, fontSize, padding, margin, borderRadius, color, etc.',
            parameters: objectSchema({
                slug: S.string('The page slug'),
                componentId: S.string('The component ID to style'),
                styles: S.record('Style key-value pairs to merge, e.g. { "backgroundColor": "#1a1a2e", "fontSize": "18px" }'),
            }),
            execute: async ({ slug, componentId, styles }: any) => {
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
        });

        tools['styles_batchUpdate'] = tool({
            description: 'Update styles for multiple components on a page in a single operation. Useful for applying a theme or making coordinated visual changes across several components at once.',
            parameters: objectSchema({
                slug: S.string('The page slug'),
                updates: S.array('Array of component style updates', {
                    type: 'object',
                    properties: {
                        componentId: S.string('The component ID'),
                        styles: S.record('Style key-value pairs to merge'),
                    },
                    required: ['componentId', 'styles'],
                }),
            }),
            execute: async ({ slug, updates }: any) => {
                try {
                    const page = await stateProvider.getPageBySlug(slug);
                    if (!page) return { error: `Page '${slug}' not found` };

                    const layoutData = { ...page.layoutData };

                    const updateMap = new Map(updates.map((u: any) => [u.componentId, u.styles]));
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
                        .filter((u: any) => !applied.includes(u.componentId))
                        .map((u: any) => u.componentId);

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
        });
    }

    return tools;
}
