/**
 * Config Route — Runtime configuration hot-reload
 *
 * Allows updating edge engine configuration without redeployment.
 * Updates process.env and reinitializes affected singletons.
 *
 * All endpoints protected by systemKeyAuth (registered in lite.ts).
 *
 * Routes:
 *   GET  /  — Get current configuration (redacted secrets)
 *   POST /  — Apply configuration update
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { SuccessResponseSchema, ErrorResponseSchema } from '../schemas';
import { getStateDbConfig, getCacheConfig, getQueueConfig, getApiKeysConfig, overrideCacheConfig, overrideQueueConfig, overrideApiKeysConfig, resetConfig } from '../config/env.js';
import { invalidateAutoToolCache } from '../engine/agent/auto-register.js';
import { encryptSecret, getVaultSystemKey } from '../config/edgeSecrets.js';
import { stateProvider } from '../storage/index.js';

const configRoute = new OpenAPIHono();

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Redact a URL/token — show first 8 and last 4 chars */
function redact(value: string | undefined): string | null {
    if (!value) return null;
    if (value.length <= 16) return '***';
    return `${value.substring(0, 8)}...${value.substring(value.length - 4)}`;
}

// ── GET / — Get current config ──────────────────────────────────────────────

const getConfigRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['System'],
    summary: 'Get current runtime configuration',
    description: 'Returns the active database, cache, and queue settings (secrets redacted)',
    responses: {
        200: {
            description: 'Current config',
            content: {
                'application/json': {
                    schema: z.object({
                        stateDb: z.object({
                            provider: z.string().nullable(),
                            url: z.string().nullable(),
                        }),
                        cache: z.object({
                            url: z.string().nullable(),
                            configured: z.boolean(),
                        }),
                        queue: z.object({
                            url: z.string().nullable(),
                            configured: z.boolean(),
                        }),
                        engineMode: z.string().nullable(),
                    }),
                },
            },
        },
    },
});

configRoute.openapi(getConfigRoute, async (c) => {
    const stateDb = getStateDbConfig();
    const cache = getCacheConfig();
    const queue = getQueueConfig();

    const apiKeys = getApiKeysConfig();

    return c.json({
        stateDb: {
            provider: stateDb.provider || 'local-sqlite',
            url: redact(stateDb.url),
        },
        cache: {
            url: redact(cache.url),
            configured: cache.provider !== 'none',
        },
        queue: {
            url: redact(queue.url),
            configured: queue.provider !== 'none',
        },
        apiKeys: {
            configured: !!(apiKeys.apiKeyHashes && apiKeys.apiKeyHashes.length > 0),
            count: apiKeys.apiKeyHashes?.length ?? 0,
        },
        engineMode: process.env.FRONTBASE_ADAPTER_PLATFORM || null,
    }, 200);
});

// ── POST / — Apply config update ────────────────────────────────────────────

const updateConfigRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['System'],
    summary: 'Update runtime configuration',
    description: 'Hot-swap database, cache, or queue configuration without redeploying. Updates process.env and reinitializes affected singletons.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        cache: z.object({
                            url: z.string().min(1),
                            token: z.string().min(1),
                        }).optional().openapi({ description: 'Redis/Upstash cache credentials' }),
                        queue: z.object({
                            url: z.string().min(1),
                            token: z.string().min(1),
                        }).optional().openapi({ description: 'QStash/queue credentials' }),
                        apiKeys: z.object({
                            systemKey: z.string().optional(),
                            apiKeyHashes: z.array(z.object({
                                prefix: z.string().optional(),
                                hash: z.string(),
                                scope: z.string().optional(),
                                expires_at: z.string().nullable().optional(),
                            })).optional(),
                        }).optional().openapi({ description: 'API key hashes for engine access control' }),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Config updated',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema.extend({
                        updated: z.array(z.string()),
                    }),
                },
            },
        },
        400: {
            description: 'Invalid config',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
});

configRoute.openapi(updateConfigRoute, async (c) => {
    const body = c.req.valid('json');
    const updated: string[] = [];

    try {
        // ── Cache (Redis/Upstash) ────────────────────────────────────────
        if (body.cache) {
            overrideCacheConfig({ provider: 'upstash', url: body.cache.url, token: body.cache.token });

            // Reinitialize Redis singleton
            try {
                const { initRedis } = await import('../cache/redis.js');
                initRedis({ url: body.cache.url, token: body.cache.token });
                updated.push('cache');
                console.log('[Config] Cache reinitialized');
            } catch (err: any) {
                console.error('[Config] Cache reinit failed:', err.message);
            }
        }

        // ── Queue ────────────────────────────────────────────────────────
        if (body.queue) {
            overrideQueueConfig({ provider: 'qstash', url: body.queue.url, token: body.queue.token });
            updated.push('queue');
            console.log('[Config] Queue config updated');
        }

        // ── API Keys ─────────────────────────────────────────────────────
        if (body.apiKeys) {
            overrideApiKeysConfig(body.apiKeys);
            updated.push('apiKeys');
            console.log(`[Config] API keys updated (${body.apiKeys.apiKeyHashes?.length ?? 0} keys)`);
        }

        // ── Invalidate auto-tool cache so agent rebuilds tools with fresh config ──
        invalidateAutoToolCache();

        return c.json({
            success: true as const,
            message: updated.length > 0
                ? `Updated: ${updated.join(', ')}`
                : 'No changes applied',
            updated,
        }, 200);
    } catch (err: any) {
        return c.json({
            error: 'ConfigError',
            message: err.message || 'Failed to apply config',
        }, 400);
    }
});

// ── POST /secrets — Push secrets to the local vault (standalone engines) ────
//
// The FastAPI control plane calls this to push engine-level infrastructure
// credentials (datasources, cache, queue, …) as a { NAME: value } map. Each
// value is AES-256-GCM encrypted with the engine's vault key and stored in the
// `edge_secrets` table; it is also written to process.env immediately so the
// change takes effect without a restart. See docs/edge-local-vault.md.

/** Allow-list for vault secret names — prevents arbitrary process.env pollution. */
const SECRET_NAME_RE = /^(FRONTBASE_[A-Z0-9_]+|SENTRY_DSN)$/;

/** Maps a pushed secret name to the lazy config singleton it invalidates. */
const SECRET_CONFIG_RESET: Record<string, 'stateDb' | 'auth' | 'apiKeys' | 'cache' | 'queue' | 'vector' | 'gpu' | 'agentProfiles'> = {
    FRONTBASE_STATE_DB: 'stateDb',
    FRONTBASE_AUTH: 'auth',
    FRONTBASE_API_KEYS: 'apiKeys',
    FRONTBASE_CACHE: 'cache',
    FRONTBASE_QUEUE: 'queue',
    FRONTBASE_VECTOR: 'vector',
    FRONTBASE_GPU: 'gpu',
    FRONTBASE_AGENT_PROFILES: 'agentProfiles',
};

const upsertSecretsRoute = createRoute({
    method: 'post',
    path: '/secrets',
    tags: ['System'],
    summary: 'Push secrets to the local vault',
    description: 'Encrypts and stores engine-level infrastructure credentials in the local vault, then applies them to the running process. Standalone/self-hosted engines only.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.record(z.string(), z.string())
                        .openapi({ description: 'Map of secret name → plaintext value (JSON strings). Names must match /^FRONTBASE_[A-Z0-9_]+$/ or be SENTRY_DSN.' }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Secrets stored',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema.extend({
                        updated: z.array(z.string()),
                        errors: z.array(z.object({ name: z.string(), error: z.string() })),
                    }),
                },
            },
        },
        400: {
            description: 'No system key / unsupported provider',
            content: { 'application/json': { schema: ErrorResponseSchema } },
        },
    },
});

configRoute.openapi(upsertSecretsRoute, async (c) => {
    const systemKey = getVaultSystemKey();
    if (!systemKey) {
        return c.json({ error: 'ConfigError', message: 'FRONTBASE_SYSTEM_KEY not configured — local vault disabled' }, 400);
    }
    if (typeof stateProvider.setEdgeSecret !== 'function') {
        return c.json({ error: 'ConfigError', message: 'State provider does not support the local vault' }, 400);
    }

    const secrets = c.req.valid('json') as Record<string, string>;
    const updated: string[] = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const [name, value] of Object.entries(secrets)) {
        if (!SECRET_NAME_RE.test(name)) {
            errors.push({ name, error: 'name must match /^FRONTBASE_[A-Z0-9_]+$/ or be SENTRY_DSN' });
            continue;
        }
        try {
            const ciphertext = await encryptSecret(value, systemKey);
            await stateProvider.setEdgeSecret(name, ciphertext);
            // Apply immediately to the running process (manual .env still wins
            // on next boot via the loader's precedence rule; a live override
            // here is intentional — the control plane is authoritative now).
            process.env[name] = value;
            updated.push(name);
        } catch (err: any) {
            errors.push({ name, error: err?.message || 'Unknown error' });
        }
    }

    // Invalidate any lazy config singletons whose backing env var changed, so
    // the next access re-parses from the freshly-set process.env.
    const resetKeys = new Set<string>();
    let cacheChanged = false;
    for (const name of updated) {
        const key = SECRET_CONFIG_RESET[name];
        if (key) {
            resetKeys.add(key);
            if (key === 'cache') cacheChanged = true;
        }
    }
    for (const key of resetKeys) resetConfig(key as any);

    // Agent tools depend on datasources/profiles — rebuild the auto-registry.
    if (updated.length > 0) {
        invalidateAutoToolCache();
    }

    // Best-effort: reconnect Redis when cache credentials changed (mirrors the
    // POST / cache hot-reload path). Failure is non-fatal — the env + singleton
    // are already updated, so a restart would pick it up.
    if (cacheChanged) {
        try {
            const { provider, url, token } = getCacheConfig();
            if (provider !== 'none' && url) {
                const { initRedis } = await import('../cache/redis.js');
                initRedis({ url, token });
                console.log('[Config] Cache reinitialized from vault secret');
            }
        } catch (err: any) {
            console.warn('[Config] Cache reinit from vault secret failed:', err?.message);
        }
    }

    return c.json({
        success: true as const,
        message: updated.length > 0
            ? `Stored ${updated.length} secret(s) in vault`
            : 'No secrets stored',
        updated,
        errors,
    }, 200);
});

// ── GET /secrets — List vault contents (metadata only, never plaintext) ─────

const listSecretsRoute = createRoute({
    method: 'get',
    path: '/secrets',
    tags: ['System'],
    summary: 'List secrets in the local vault',
    description: 'Returns the names and versions of secrets stored in the local vault. Ciphertext is never returned.',
    responses: {
        200: {
            description: 'Vault contents',
            content: {
                'application/json': {
                    schema: z.object({
                        enabled: z.boolean(),
                        secrets: z.array(z.object({
                            name: z.string(),
                            version: z.number(),
                            updatedAt: z.string().nullable(),
                        })),
                        count: z.number(),
                    }),
                },
            },
        },
    },
});

configRoute.openapi(listSecretsRoute, async (c) => {
    const listFn = stateProvider.listEdgeSecrets;
    if (!getVaultSystemKey() || typeof listFn !== 'function') {
        return c.json({ enabled: false, secrets: [], count: 0 }, 200);
    }
    try {
        const secrets = await listFn();
        return c.json({
            enabled: true,
            secrets: secrets.map((s) => ({ name: s.name, version: s.version, updatedAt: s.updatedAt })),
            count: secrets.length,
        }, 200);
    } catch (err: any) {
        return c.json({ enabled: false, secrets: [], count: 0, error: err?.message }, 200);
    }
});

export { configRoute };
