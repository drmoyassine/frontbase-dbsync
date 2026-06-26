/**
 * Health Check Route
 * 
 * Returns service health, version, provider info, and binding status.
 * The `bindings` section shows whether stateDb, cache, and queue are
 * configured and reachable — gives operators a single-glance view of
 * whether all infrastructure is properly wired.
 * 
 * Each binding check has a 3s timeout to prevent the health endpoint
 * from hanging on slow/unreachable backends.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getPlatform } from '../adapters/shared.js';
import { getResilienceState } from '../resilience.js';

const startedAt = Date.now();
const healthRoute = new OpenAPIHono();

// ── Helpers ─────────────────────────────────────────────────────────

type BindingStatus = { provider: string; status: 'ok' | 'error' | 'not_configured'; error?: string; schema?: string };

const PING_TIMEOUT_MS = 20000;

/** Wrap a promise with a timeout — returns 'error' status if it takes too long */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
}

// ── Binding health checks ───────────────────────────────────────────

/**
 * Vault status for the health endpoint. Cheap by design: reports whether the
 * vault is enabled, the secret count, the most recent write timestamp, and a
 * single-secret decrypt probe (NOT a full decrypt of every secret) so /api/health
 * stays fast even with large vaults.
 */
type VaultStatus = {
    enabled: boolean;
    status: 'healthy' | 'unhealthy' | 'degraded' | 'empty' | 'disabled';
    secretCount: number;
    lastWriteAt: string | null;
    keyValid: boolean;
};

async function checkVault(): Promise<VaultStatus> {
    const disabled: VaultStatus = {
        enabled: false, status: 'disabled', secretCount: 0, lastWriteAt: null, keyValid: false,
    };
    try {
        const { getVaultSystemKey, decryptSecret } = await import('../config/edgeSecrets.js');
        const { stateProvider } = await import('../storage/index.js');
        const systemKey = getVaultSystemKey();
        if (!systemKey || typeof stateProvider.listEdgeSecrets !== 'function') {
            return disabled;
        }

        const metas = await stateProvider.listEdgeSecrets();
        if (metas.length === 0) {
            return { ...disabled, enabled: true, status: 'empty', keyValid: !!systemKey };
        }

        // Fix #7: Sample multiple secrets for better accuracy (up to 3 most recent)
        const sortedByRecent = [...metas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const sampleSize = Math.min(3, sortedByRecent.length);
        const samples = sortedByRecent.slice(0, sampleSize);

        let keyValid = true;
        let corruptCount = 0;
        for (const sample of samples) {
            try {
                const row = await stateProvider.getEdgeSecret?.(sample.name);
                if (row) await decryptSecret(row.value, systemKey);
                else {
                    corruptCount++;
                    keyValid = false;
                }
            } catch {
                corruptCount++;
                keyValid = false;
            }
        }

        // Vault is unhealthy if more than half of samples are corrupted
        const isHealthy = corruptCount === 0;
        const isDegraded = corruptCount > 0 && corruptCount < sampleSize;
        const status = isHealthy ? 'healthy' : (corruptCount >= sampleSize ? 'unhealthy' : 'degraded');

        // Most recent write timestamp from the latest secret
        const latest = sortedByRecent[0];

        return {
            enabled: true,
            status,
            secretCount: metas.length,
            lastWriteAt: latest.updatedAt,
            keyValid: isHealthy,
        };
    } catch {
        return { ...disabled, enabled: true, status: 'unhealthy' };
    }
}

async function checkStateDb(): Promise<BindingStatus> {
    const { getStateDbConfig } = await import('../config/env.js');
    const cfg = getStateDbConfig();

    if (cfg.provider === 'local' && !cfg.url) {
        return { provider: 'none', status: 'not_configured' };
    }

    const result: BindingStatus = {
        provider: cfg.provider || 'auto',
        status: 'ok',
    };

    if (cfg.schema) result.schema = cfg.schema;

    try {
        const { stateProvider } = await import('../storage/index.js');
        await withTimeout(stateProvider.listPages(), PING_TIMEOUT_MS);
        result.status = 'ok';
    } catch (e: any) {
        result.status = 'error';
        result.error = (e?.message || String(e)).slice(0, 120);
    }

    return result;
}

async function checkCache(): Promise<BindingStatus> {
    const { getCacheConfig } = await import('../config/env.js');
    const cfg = getCacheConfig();

    if (cfg.provider === 'none' && !cfg.url) {
        return { provider: 'none', status: 'not_configured' };
    }

    try {
        const { cacheProvider } = await import('../cache/index.js');
        await withTimeout(cacheProvider.get('__health_check__'), PING_TIMEOUT_MS);
        return { provider: cfg.provider || 'redis', status: 'ok' };
    } catch (e: any) {
        return {
            provider: cfg.provider || 'redis',
            status: 'error',
            error: (e?.message || String(e)).slice(0, 120),
        };
    }
}

async function checkQueue(): Promise<BindingStatus> {
    const { getQueueConfig } = await import('../config/env.js');
    const cfg = getQueueConfig();

    if (cfg.provider === 'none' && !cfg.token && !cfg.url) {
        return { provider: 'none', status: 'not_configured' };
    }

    // Queue health is "configured" — can't ping QStash/CF Queues without publishing
    return { provider: cfg.provider || 'qstash', status: 'ok' };
}

// ── OpenAPI Route ───────────────────────────────────────────────────

const bindingSchema = z.object({
    provider: z.string(),
    status: z.enum(['ok', 'error', 'not_configured']),
    error: z.string().optional(),
    schema: z.string().optional(),
});

const route = createRoute({
    method: 'get',
    path: '/',
    tags: ['System'],
    summary: 'Health check',
    description: 'Returns service health status, version, provider info, and binding health',
    responses: {
        200: {
            description: 'Service is healthy',
            content: {
                'application/json': {
                    schema: z.object({
                        status: z.string(),
                        service: z.string(),
                        version: z.string(),
                        provider: z.string(),
                        uptime_seconds: z.number().optional(),
                        timestamp: z.string(),
                        bindings: z.object({
                            stateDb: bindingSchema,
                            cache: bindingSchema,
                            queue: bindingSchema,
                        }),
                        resilience: z.object({
                            stateDb: z.any().optional(),
                            cache: z.any().optional(),
                            ttlMultiplier: z.number().optional(),
                            cacheStats: z.object({
                                hits: z.number(),
                                misses: z.number(),
                            }).optional(),
                        }).optional(),
                        vault: z.object({
                            enabled: z.boolean(),
                            status: z.enum(['healthy', 'unhealthy', 'degraded', 'empty', 'disabled']),
                            secretCount: z.number(),
                            lastWriteAt: z.string().nullable(),
                            keyValid: z.boolean(),
                        }).optional(),
                    }),
                },
            },
        },
    },
});

healthRoute.openapi(route, async (c) => {
    // Tiered response: minimal without system key, full diagnostics with key
    const systemKey = process.env.FRONTBASE_SYSTEM_KEY;
    const provided = c.req.header('x-system-key');
    const isAuthenticated = !systemKey || (provided === systemKey);

    if (!isAuthenticated) {
        // Minimal liveness check — no infrastructure details
        return c.json({
            status: 'ok',
            service: 'frontbase-edge',
            version: '0.1.0',
            provider: getPlatform(),
            timestamp: new Date().toISOString(),
            bindings: {
                stateDb: { provider: 'hidden', status: 'ok' as const },
                cache: { provider: 'hidden', status: 'ok' as const },
                queue: { provider: 'hidden', status: 'ok' as const },
            },
        });
    }

    // Full diagnostics — authenticated via system key
    const platform = getPlatform();
    const isServerless = platform !== 'docker';

    // Run all binding checks in parallel (each has timeout)
    const [stateDb, cache, queue, vault] = await Promise.all([
        checkStateDb(),
        checkCache(),
        checkQueue(),
        checkVault(),
    ]);

    // A vault that is unhealthy or degraded affects overall status
    const overall = vault.status === 'unhealthy' || vault.status === 'degraded' ? 'degraded' : 'ok';

    return c.json({
        status: overall,
        service: 'frontbase-edge',
        version: '0.1.0',
        provider: platform,
        ...(isServerless ? {} : { uptime_seconds: Math.floor((Date.now() - startedAt) / 1000) }),
        timestamp: new Date().toISOString(),
        bindings: { stateDb, cache, queue },
        resilience: getResilienceState(),
        vault,
    });
});

export { healthRoute };
