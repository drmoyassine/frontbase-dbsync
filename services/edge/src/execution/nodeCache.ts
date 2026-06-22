/**
 * Node-level Output Caching (Automations A8)
 *
 * Caches individual node outputs keyed by a stable input hash. Reduces redundant
 * computation for expensive read-only nodes (data_request, http_request, etc.).
 *
 * The hash is a dependency-free djb2 variant (works on Node / Bun / CF). Cache
 * invalidation uses a per-node version counter because not every cache provider
 * supports pattern-delete.
 */

import { cacheProvider } from '../cache/index.js';

const NODE_CACHE_PREFIX = 'wf:node:cache';
const DEFAULT_TTL = 300; // 5 minutes

export interface NodeCacheResult {
    cached: boolean;
    outputs?: any;
    key?: string;
}

/**
 * Dependency-free stable string hash (djb2). Returns a hex-ish 16-char key.
 */
export function hashInputs(inputs: Record<string, any>): string {
    const sorted: Record<string, any> = {};
    for (const k of Object.keys(inputs).sort()) {
        sorted[k] = inputs[k];
    }
    const str = JSON.stringify(sorted);
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // 32-bit
    }
    // Convert to unsigned hex
    return (hash >>> 0).toString(16).padStart(8, '0') + ':' + str.length.toString(16);
}

function buildCacheKey(nodeId: string, inputHash: string, version: number = 0): string {
    return `${NODE_CACHE_PREFIX}:${nodeId}:v${version}:${inputHash}`;
}

function versionKey(nodeId: string): string {
    return `${NODE_CACHE_PREFIX}:version:${nodeId}`;
}

function workflowVersionKey(workflowId: string): string {
    return `${NODE_CACHE_PREFIX}:wfversion:${workflowId}`;
}

async function getNodeVersion(nodeId: string): Promise<number> {
    try {
        const v = await cacheProvider.get<string>(versionKey(nodeId));
        return v ? parseInt(String(v), 10) || 0 : 0;
    } catch {
        return 0;
    }
}

async function getWorkflowVersion(workflowId: string): Promise<number> {
    try {
        const v = await cacheProvider.get<string>(workflowVersionKey(workflowId));
        return v ? parseInt(String(v), 10) || 0 : 0;
    } catch {
        return 0;
    }
}

/**
 * Get a cached node output if present.
 */
export async function getNodeOutput(
    nodeId: string,
    inputs: Record<string, any>,
    ttl: number = DEFAULT_TTL,
    workflowId?: string,
): Promise<NodeCacheResult> {
    try {
        const inputHash = hashInputs(inputs);
        const nodeVer = await getNodeVersion(nodeId);
        const wfVer = workflowId ? await getWorkflowVersion(workflowId) : 0;
        const key = buildCacheKey(nodeId, inputHash, nodeVer + wfVer);

        const cached = await cacheProvider.get<string>(key);
        if (cached === null || cached === undefined) {
            return { cached: false, key };
        }
        const outputs = typeof cached === 'string' ? JSON.parse(cached) : cached;
        return { cached: true, outputs, key };
    } catch (error) {
        console.error('[NodeCache] Get failed:', error);
        return { cached: false };
    }
}

/**
 * Store a node output in the cache.
 */
export async function setNodeOutput(
    nodeId: string,
    inputs: Record<string, any>,
    outputs: any,
    ttl: number = DEFAULT_TTL,
    workflowId?: string,
): Promise<void> {
    try {
        const inputHash = hashInputs(inputs);
        const nodeVer = await getNodeVersion(nodeId);
        const wfVer = workflowId ? await getWorkflowVersion(workflowId) : 0;
        const key = buildCacheKey(nodeId, inputHash, nodeVer + wfVer);
        await cacheProvider.setex(key, ttl, JSON.stringify(outputs));
    } catch (error) {
        console.error('[NodeCache] Set failed:', error);
    }
}

/**
 * Invalidate all cached outputs for a node (bumps its version counter).
 */
export async function invalidateNodeCache(nodeId: string): Promise<void> {
    try {
        const current = await getNodeVersion(nodeId);
        await cacheProvider.setex(versionKey(nodeId), 86400, String(current + 1));
    } catch (error) {
        console.error('[NodeCache] Node invalidation failed:', error);
    }
}

/**
 * Invalidate all cached outputs for a workflow (bumps its version counter).
 */
export async function invalidateWorkflowCache(workflowId: string): Promise<void> {
    try {
        const current = await getWorkflowVersion(workflowId);
        await cacheProvider.setex(workflowVersionKey(workflowId), 86400, String(current + 1));
    } catch (error) {
        console.error('[NodeCache] Workflow invalidation failed:', error);
    }
}

/**
 * Whether a node type is eligible for output caching (read-only / idempotent).
 */
export function isCacheableNodeType(nodeType: string): boolean {
    return ['data_request', 'http_request', 'transform', 'json_transform'].includes(nodeType);
}

/**
 * Default TTL (seconds) for a node type.
 */
export function getDefaultTTL(nodeType: string): number {
    const ttlMap: Record<string, number> = {
        data_request: 60,
        http_request: 300,
        transform: 600,
        json_transform: 600,
    };
    return ttlMap[nodeType] ?? DEFAULT_TTL;
}
