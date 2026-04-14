/**
 * Curated Page Tools (Tier 2)
 * 
 * High-level tools for inspecting and modifying published pages.
 * These wrap lower-level state provider calls with LLM-friendly
 * descriptions and response shaping.
 */

import { tool } from 'ai';
import { stateProvider } from '../../../storage/index.js';
import { liteApp } from '../../lite.js';
import { objectSchema, S } from './schema-helper.js';
import type { AgentProfile } from '../../../config/env.js';

/**
 * Build page tools gated by the agent profile's permissions.
 */
export function buildPageTools(profile: AgentProfile): Record<string, any> {
    const tools: Record<string, any> = {};
    const perms = profile.permissions?.['pages.all'] || [];
    const hasRead = perms.includes('read') || perms.includes('all');
    const hasWrite = perms.includes('write') || perms.includes('all');

    if (!hasRead && !hasWrite) return tools;

    // ── Read tools ──────────────────────────────────────────────────

    if (hasRead) {
        tools['pages_list'] = tool({
            description: 'List all published pages on this engine. Returns page name, slug, and version for each page.',
            parameters: objectSchema({
                dummy: S.string('Unused, pass empty string'),
            }),
            execute: async ({ dummy }: any) => {
                try {
                    const pages = await stateProvider.listPages();
                    return {
                        count: pages.length,
                        pages: pages.map((p: any) => ({
                            name: p.name,
                            slug: p.slug,
                            version: p.version,
                        })),
                    };
                } catch (e: any) {
                    return { error: `Failed to list pages: ${e.message}` };
                }
            },
        });

        tools['pages_get'] = tool({
            description: 'Get the full structure of a published page by slug. Returns the page name, slug, version, component tree (types and IDs), and SEO metadata.',
            parameters: objectSchema({
                slug: S.string('The page slug (URL path), e.g. "about" or "pricing"'),
            }),
            execute: async ({ slug }: any) => {
                try {
                    const page = await stateProvider.getPageBySlug(slug);
                    if (!page) {
                        return { error: `Page with slug '${slug}' not found` };
                    }

                    // Summarize the component tree (don't dump the entire layout)
                    const summarizeComponents = (components: any[]): any[] => {
                        return (components || []).map((c: any) => ({
                            id: c.id,
                            type: c.type,
                            ...(c.props?.text ? { text: String(c.props.text).slice(0, 100) } : {}),
                            ...(c.props?.label ? { label: c.props.label } : {}),
                            ...(c.props?.src ? { src: c.props.src } : {}),
                            ...(c.binding?.tableName ? { boundTo: c.binding.tableName } : {}),
                            ...(c.children?.length ? { children: summarizeComponents(c.children) } : {}),
                        }));
                    };

                    const layoutData = page.layoutData;

                    return {
                        name: page.name,
                        slug: page.slug,
                        version: page.version,
                        isHomepage: page.isHomepage || false,
                        isPublic: page.isPublic !== false,
                        seo: {
                            title: page.title || page.seoData?.title || page.name,
                            description: page.description || page.seoData?.description || null,
                        },
                        components: summarizeComponents(layoutData?.content || []),
                    };
                } catch (e: any) {
                    return { error: `Failed to get page: ${e.message}` };
                }
            },
        });
    }

    // ── Write tools ─────────────────────────────────────────────────

    if (hasWrite) {
        tools['pages_updateComponent'] = tool({
            description: 'Update a single component\'s props on a published page. Changes are applied to the page in the state DB but NOT automatically published — use pages_updateAndPublish for atomic edit+publish.',
            parameters: objectSchema({
                slug: S.string('The page slug'),
                componentId: S.string('The ID of the component to update'),
                props: S.record('The prop key-value pairs to merge into the component'),
            }),
            execute: async ({ slug, componentId, props }: any) => {
                try {
                    const page = await stateProvider.getPageBySlug(slug);
                    if (!page) return { error: `Page '${slug}' not found` };

                    const layoutData = { ...page.layoutData };

                    // Recursively find and patch the component
                    let found = false;
                    const patchComponent = (components: any[]): any[] => {
                        return components.map((c: any) => {
                            if (c.id === componentId) {
                                found = true;
                                return { ...c, props: { ...(c.props || {}), ...props } };
                            }
                            if (c.children?.length) {
                                return { ...c, children: patchComponent(c.children) };
                            }
                            return c;
                        });
                    };

                    layoutData.content = patchComponent(layoutData.content || []);

                    if (!found) {
                        return { error: `Component '${componentId}' not found in page '${slug}'` };
                    }

                    // Write back
                    await stateProvider.upsertPage({ ...page, layoutData });

                    return { success: true, message: `Updated component '${componentId}' on page '${slug}'` };
                } catch (e: any) {
                    return { error: `Failed to update component: ${e.message}` };
                }
            },
        });

        tools['pages_updateAndPublish'] = tool({
            description: 'Update a component\'s props on a page AND trigger a full publish cycle (CSS rebundle + cache flush). This is the recommended way to make visible changes. It is an atomic one-shot operation.',
            parameters: objectSchema({
                slug: S.string('The page slug'),
                componentId: S.string('The ID of the component to update'),
                props: S.record('The prop key-value pairs to merge into the component'),
            }),
            execute: async ({ slug, componentId, props }: any) => {
                try {
                    // Step 1: Update the component
                    const page = await stateProvider.getPageBySlug(slug);
                    if (!page) return { error: `Page '${slug}' not found` };

                    const layoutData = { ...page.layoutData };

                    let found = false;
                    const patchComponent = (components: any[]): any[] => {
                        return components.map((c: any) => {
                            if (c.id === componentId) {
                                found = true;
                                return { ...c, props: { ...(c.props || {}), ...props } };
                            }
                            if (c.children?.length) {
                                return { ...c, children: patchComponent(c.children) };
                            }
                            return c;
                        });
                    };

                    layoutData.content = patchComponent(layoutData.content || []);
                    if (!found) {
                        return { error: `Component '${componentId}' not found in page '${slug}'` };
                    }

                    await stateProvider.upsertPage({ ...page, layoutData });

                    // Step 2: Flush the page cache so the update is visible immediately
                    try {
                        const cacheReq = new Request('http://localhost/api/cache/invalidate', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-api-key': profile.apiKey || '',
                            },
                            body: JSON.stringify({ pattern: `page:${slug}*` }),
                        });
                        await liteApp.request(cacheReq);
                    } catch {
                        // Cache flush is best-effort
                    }

                    return {
                        success: true,
                        message: `Updated component '${componentId}' on page '${slug}' and flushed cache.`,
                    };
                } catch (e: any) {
                    return { error: `Failed to update and publish: ${e.message}` };
                }
            },
        });
    }

    return tools;
}
