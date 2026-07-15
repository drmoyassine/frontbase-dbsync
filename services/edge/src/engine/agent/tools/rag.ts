/**
 * RAG Search Tools for Agents
 *
 * Enables both Workspace and Edge agents to search document collections
 * with multi-tenant isolation (client_id filtering from file paths).
 *
 * Tools:
 *   - rag_search: Semantic search across documents with metadata filters
 *   - rag_client_search: Search scoped to a specific client (auto-extracted from path)
 *   - rag_bucket_search: Search within a specific storage bucket
 */

import { tool } from 'ai';
import { objectSchema, S } from './schema-helper.js';
import { searchRagDocuments } from '../../../services/rag/index.js';
import type { AgentProfile } from '../../../config/env.js';

/**
 * Validate that the tenant context is properly isolated.
 * Ensures agents cannot access documents outside their tenant scope.
 */
function validateTenantContext(profile: AgentProfile, targetTenantId?: string): void {
    // If profile has a tenant slug, ensure we only search within that tenant
    if (profile.tenantSlug && targetTenantId && targetTenantId !== profile.tenantSlug) {
        throw new Error(`Tenant isolation violation: profile ${profile.name} (tenant: ${profile.tenantSlug}) cannot access tenant ${targetTenantId}`);
    }
}

/**
 * Build RAG search tools gated by the agent profile's permissions.
 */
export function buildRagTools(profile: AgentProfile): Record<string, any> {
    const tools: Record<string, any> = {};
    const perms = profile.permissions?.['rag.all'] || [];
    const hasRead = perms.includes('read') || perms.includes('all');

    if (!hasRead) return tools;

    /**
     * rag_search — Semantic search across all accessible documents.
     *
     * Automatically filters by tenant_id and project_id from context.
     * Optionally filters by client_id for multi-tenant isolation.
     */
    tools['rag_search'] = tool({
        description: 'Search documents using semantic similarity. Returns relevant text chunks with their sources. Use this to find information from uploaded documents, knowledge bases, or documentation. Results are automatically scoped to the current tenant and project.',
        inputSchema: objectSchema({
            query: S.string('The search query - what information you are looking for'),
            client_id: S.string('Optional: Filter to a specific client ID (e.g., "acme-corp", "user-123"). Leave empty to search across all clients.', true),
            limit: S.number('Maximum number of results to return (default: 5, max: 20)', true),
        }),
        execute: async ({ query, client_id, limit }: any) => {
            try {
                // Tenant isolation validation
                validateTenantContext(profile, profile.tenantSlug);

                const results = await searchRagDocuments(query, {
                    tenant_id: profile.tenantSlug,
                    project_id: profile.projectId,
                    filters: client_id ? { client_id } : undefined,
                    limit: Math.min(limit || 5, 20),
                });

                return {
                    count: results.length,
                    results: results.map(r => ({
                        text: r.text,
                        score: r.score,
                        source: r.source,
                        client_id: r.metadata.client_id,
                        content_type: r.metadata.content_type,
                    })),
                };
            } catch (e: any) {
                return { error: `RAG search failed: ${e.message}` };
            }
        },
    });

    /**
     * rag_client_search — Scoped search for a specific client.
     *
     * Use when the user asks about "client X's documents" or similar.
     * Extracts client_id from the query if not explicitly provided.
     */
    tools['rag_client_search'] = tool({
        description: 'Search documents for a specific client. Use this when the user asks about a particular client, customer, or user (e.g., "What did Acme Corp request?"). Automatically extracts client ID from common patterns like "client XYZ", "customer ABC", or "user-123".',
        inputSchema: objectSchema({
            query: S.string('The search query - what information you are looking for'),
            client_identifier: S.string('The client or customer identifier (e.g., "acme-corp", "user-123"). If not provided, will attempt to extract from the query.', true),
            limit: S.number('Maximum number of results to return (default: 5, max: 20)', true),
        }),
        execute: async ({ query, client_identifier, limit }: any) => {
            try {
                // Tenant isolation validation
                validateTenantContext(profile, profile.tenantSlug);

                let clientId = client_identifier;

                // Try to extract client_id from query if not provided
                if (!clientId) {
                    const patterns = [
                        /client[:\s]+([a-zA-Z0-9_-]+)/i,
                        /customer[:\s]+([a-zA-Z0-9_-]+)/i,
                        /user[:\s]+([a-zA-Z0-9_-]+)/i,
                        /for\s+([a-zA-Z0-9_-]+)\s+request/i,
                    ];
                    for (const pattern of patterns) {
                        const match = query.match(pattern);
                        if (match && match[1]) {
                            clientId = match[1];
                            break;
                        }
                    }
                }

                if (!clientId) {
                    return { error: 'Could not identify client from query. Please provide the client_identifier parameter.' };
                }

                const results = await searchRagDocuments(query, {
                    tenant_id: profile.tenantSlug,
                    project_id: profile.projectId,
                    filters: { client_id: clientId },
                    limit: Math.min(limit || 5, 20),
                });

                return {
                    client_id: clientId,
                    count: results.length,
                    results: results.map(r => ({
                        text: r.text,
                        score: r.score,
                        source: r.source,
                        content_type: r.metadata.content_type,
                    })),
                };
            } catch (e: any) {
                return { error: `RAG client search failed: ${e.message}` };
            }
        },
    });

    /**
     * rag_bucket_search — Search within a specific storage bucket.
     *
     * Use when you want to limit search to documents from a specific bucket.
     */
    tools['rag_bucket_search'] = tool({
        description: 'Search documents within a specific storage bucket. Use this when you know the documents are in a particular bucket (e.g., "contracts", "invoices", "documentation").',
        inputSchema: objectSchema({
            query: S.string('The search query - what information you are looking for'),
            bucket: S.string('The bucket name to search within (e.g., "documents", "contracts")'),
            limit: S.number('Maximum number of results to return (default: 5, max: 20)', true),
        }),
        execute: async ({ query, bucket, limit }: any) => {
            try {
                // Tenant isolation validation
                validateTenantContext(profile, profile.tenantSlug);

                const results = await searchRagDocuments(query, {
                    tenant_id: profile.tenantSlug,
                    project_id: profile.projectId,
                    filters: { bucket },
                    limit: Math.min(limit || 5, 20),
                });

                return {
                    bucket,
                    count: results.length,
                    results: results.map(r => ({
                        text: r.text,
                        score: r.score,
                        path: r.source.path,
                        client_id: r.metadata.client_id,
                    })),
                };
            } catch (e: any) {
                return { error: `RAG bucket search failed: ${e.message}` };
            }
        },
    });

    return tools;
}
