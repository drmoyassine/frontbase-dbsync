/**
 * Shared Variables Service (Automations A7)
 *
 * Cross-execution variables scoped to a workflow ID. Persisted in the cache
 * provider with a TTL. Use cases: aggregating results across runs, persistent
 * counters, lightweight coordination between parallel executions.
 */

import { cacheProvider } from '../cache/index.js';

const SHARED_VARS_KEY = (workflowId: string) => `wf:shared:${workflowId}`;
const DEFAULT_TTL = 3600; // 1 hour

export type SharedVariables = Record<string, any>;

/**
 * Get all shared variables for a workflow.
 */
export async function getSharedVariables(
    workflowId: string,
    _ttl: number = DEFAULT_TTL,
): Promise<SharedVariables> {
    try {
        const cached = await cacheProvider.get<string>(SHARED_VARS_KEY(workflowId));
        if (!cached) return {};
        return typeof cached === 'string' ? (JSON.parse(cached) as SharedVariables) : (cached as SharedVariables);
    } catch (error) {
        console.error('[SharedVars] Get failed:', error);
        return {};
    }
}

/**
 * Get a single shared variable.
 */
export async function getSharedVariable(
    workflowId: string,
    key: string,
    ttl: number = DEFAULT_TTL,
): Promise<any> {
    const vars = await getSharedVariables(workflowId, ttl);
    return vars[key];
}

/**
 * Set a single shared variable (merges with existing).
 */
export async function setSharedVariable(
    workflowId: string,
    key: string,
    value: any,
    ttl: number = DEFAULT_TTL,
): Promise<void> {
    try {
        const vars = await getSharedVariables(workflowId, ttl);
        vars[key] = value;
        await cacheProvider.setex(SHARED_VARS_KEY(workflowId), ttl, JSON.stringify(vars));
    } catch (error) {
        console.error('[SharedVars] Set failed:', error);
    }
}

/**
 * Delete a shared variable.
 */
export async function deleteSharedVariable(
    workflowId: string,
    key: string,
    ttl: number = DEFAULT_TTL,
): Promise<void> {
    try {
        const vars = await getSharedVariables(workflowId, ttl);
        delete vars[key];
        await cacheProvider.setex(SHARED_VARS_KEY(workflowId), ttl, JSON.stringify(vars));
    } catch (error) {
        console.error('[SharedVars] Delete failed:', error);
    }
}

/**
 * Increment a numeric counter variable. Returns the new value.
 */
export async function incrementSharedVariable(
    workflowId: string,
    key: string,
    delta: number = 1,
    ttl: number = DEFAULT_TTL,
): Promise<number> {
    const current = await getSharedVariable(workflowId, key, ttl);
    const value = (typeof current === 'number' ? current : 0) + delta;
    await setSharedVariable(workflowId, key, value, ttl);
    return value;
}

/**
 * Set multiple variables at once (merges with existing).
 */
export async function setSharedVariables(
    workflowId: string,
    updates: SharedVariables,
    ttl: number = DEFAULT_TTL,
): Promise<void> {
    try {
        const existing = await getSharedVariables(workflowId, ttl);
        const merged = { ...existing, ...updates };
        await cacheProvider.setex(SHARED_VARS_KEY(workflowId), ttl, JSON.stringify(merged));
    } catch (error) {
        console.error('[SharedVars] Set multiple failed:', error);
    }
}

/**
 * Clear all shared variables for a workflow.
 */
export async function clearSharedVariables(workflowId: string): Promise<void> {
    try {
        await cacheProvider.del(SHARED_VARS_KEY(workflowId));
    } catch (error) {
        console.error('[SharedVars] Clear failed:', error);
    }
}
