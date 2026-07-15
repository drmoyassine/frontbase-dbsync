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
import { getStateDbConfig, getCacheConfig, getQueueConfig, getApiKeysConfig, overrideCacheConfig, overrideQueueConfig, overrideApiKeysConfig, resetConfig, clearLazySecretCache, getSecretTier } from '../config/env.js';
import { invalidateAutoToolCache } from '../engine/agent/auto-register.js';
import { encryptSecret, decryptSecret, getVaultSystemKey } from '../config/edgeSecrets.js';
import { logAuditOperation, getAuditHistory, getAuditEntries } from '../config/audit.js';
import { rotateVaultKey, verifyVaultKey } from '../config/keyRotation.js';
import { exportVault, importVault, EXPORT_FORMAT_VERSION } from '../config/export.js';
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
            const version = await stateProvider.setEdgeSecret(name, ciphertext);
            // Apply immediately to the running process (manual .env still wins
            // on next boot via the loader's precedence rule; a live override
            // here is intentional — the control plane is authoritative now).
            process.env[name] = value;
            updated.push(name);
            // Fire-and-forget audit trail (best-effort, never throws).
            void logAuditOperation({
                operation: 'create',
                secretName: name,
                version,
                status: 'success',
                initiatedBy: 'system',
            });
        } catch (err: any) {
            errors.push({ name, error: err?.message || 'Unknown error' });
            void logAuditOperation({
                operation: 'create',
                secretName: name,
                version: 0,
                status: 'failure',
                errorMessage: err?.message || 'Unknown error',
                initiatedBy: 'system',
            });
        }
    }

    // Vault contents changed — drop the on-demand lazy cache so subsequent
    // loadLazySecret() calls re-read the freshly written values.
    if (updated.length > 0) {
        clearLazySecretCache();
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

// =============================================================================
// Phase 2 routes — audit, versioning, rotation, export/import, per-secret GET.
//
// Route order matters: the static sub-paths (/export, /audit, /import, /rotate)
// MUST be registered before the parametric /secrets/:name so they are not
// captured by the {name} segment. All routes inherit systemKeyAuth (applied to
// /api/config/* in lite.ts).
// =============================================================================

// ── GET /secrets/export — Backup the vault (ciphertext bundle + checksum) ────

const exportSecretsRoute = createRoute({
    method: 'get',
    path: '/secrets/export',
    tags: ['System'],
    summary: 'Export the local vault (backup)',
    description: 'Returns every vault secret in its encrypted (ciphertext) form plus a SHA-256 checksum. The bundle is only retrievable behind system-key auth and is useless without FRONTBASE_SYSTEM_KEY — still, transport it over HTTPS and store it securely.',
    responses: {
        200: {
            description: 'Vault export bundle',
            content: {
                'application/json': {
                    schema: z.object({
                        formatVersion: z.number(),
                        exportedAt: z.string(),
                        secrets: z.array(z.object({
                            name: z.string(),
                            version: z.number(),
                            ciphertext: z.string(),
                            createdAt: z.string(),
                            updatedAt: z.string(),
                        })),
                        checksum: z.string(),
                    }),
                },
            },
        },
        400: { description: 'Vault unsupported', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
});

configRoute.openapi(exportSecretsRoute, async (c) => {
    try {
        const bundle = await exportVault();
        void logAuditOperation({
            operation: 'export',
            secretName: '*',
            version: 0,
            status: 'success',
            initiatedBy: 'api',
            metadata: { exportFormat: bundle.formatVersion, secretCount: bundle.secrets.length },
        });
        return c.json(bundle, 200);
    } catch (err: any) {
        return c.json({ error: 'VaultExportError', message: err?.message || 'Export failed' }, 400);
    }
});

// ── GET /secrets/audit — Paginated audit trail across all secrets ────────────

const listAuditRoute = createRoute({
    method: 'get',
    path: '/secrets/audit',
    tags: ['System'],
    summary: 'List vault audit entries (paginated)',
    description: 'Returns the newest audit entries across all secrets. Use ?limit and ?offset for pagination.',
    responses: {
        200: {
            description: 'Audit entries',
            content: {
                'application/json': {
                    schema: z.object({
                        entries: z.array(z.object({
                            id: z.string(),
                            operation: z.string(),
                            secretName: z.string(),
                            version: z.number(),
                            status: z.string(),
                            errorMessage: z.string().nullable(),
                            initiatedBy: z.string(),
                            timestamp: z.string(),
                            metadata: z.any().nullable(),
                        })),
                        total: z.number(),
                        limit: z.number(),
                        offset: z.number(),
                    }),
                },
            },
        },
    },
});

configRoute.openapi(listAuditRoute, async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '100', 10) || 100, 500);
    const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0);
    const result = await getAuditEntries(limit, offset);
    return c.json({ ...result, limit, offset }, 200);
});

// ── POST /secrets/import — Restore secrets from an export bundle ────────────

const importSecretsRoute = createRoute({
    method: 'post',
    path: '/secrets/import',
    tags: ['System'],
    summary: 'Import secrets from an export bundle',
    description: 'Restores secrets from a previously exported bundle. The bundle must have been encrypted with the same vault key. Existing secrets are skipped unless ?force=true. Imported secrets are applied to the running process.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        formatVersion: z.number(),
                        exportedAt: z.string(),
                        secrets: z.array(z.object({
                            name: z.string(),
                            version: z.number(),
                            ciphertext: z.string(),
                            createdAt: z.string(),
                            updatedAt: z.string(),
                        })),
                        checksum: z.string(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Import result',
            content: {
                'application/json': {
                    schema: z.object({
                        success: z.boolean(),
                        imported: z.number(),
                        skipped: z.number(),
                        failed: z.number(),
                        errors: z.array(z.object({ name: z.string(), error: z.string() })),
                    }),
                },
            },
        },
        400: { description: 'Invalid bundle / checksum mismatch', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
});

configRoute.openapi(importSecretsRoute, async (c) => {
    const bundle = c.req.valid('json');
    const force = c.req.query('force') === 'true';
    const systemKey = getVaultSystemKey();

    let result: any;
    try {
        result = await importVault(bundle, { force });
    } catch (err: any) {
        void logAuditOperation({
            operation: 'import', secretName: '*', version: 0,
            status: 'failure', errorMessage: err?.message || 'Import failed', initiatedBy: 'api',
        });
        return c.json({ error: 'VaultImportError', message: err?.message || 'Import failed' }, 400);
    }

    // Apply imported secrets to process.env + invalidate affected singletons,
    // mirroring the POST /secrets path so a restore takes effect immediately.
    // Note: importVault now decrypts before storing, so we trust the vault contents.
    const applied: string[] = [];
    if (systemKey && result.imported > 0) {
        for (const secret of bundle.secrets) {
            // Only apply secrets that were successfully imported
            // (filter by checking if they're not in errors list)
            const wasImported = !result.errors.some((e: any) => e.name === secret.name) &&
                               !result.tier3Rejected?.includes(secret.name);
            if (wasImported) {
                try {
                    const plaintext = await decryptSecret(secret.ciphertext, systemKey);
                    process.env[secret.name] = plaintext;
                    applied.push(secret.name);
                } catch {
                    // Leave as-is; a restart will load it via the boot loader.
                }
            }
        }
        const resetKeys = new Set<string>();
        for (const name of applied) {
            const key = SECRET_CONFIG_RESET[name];
            if (key) resetKeys.add(key);
        }
        for (const key of resetKeys) resetConfig(key as any);
        clearLazySecretCache();
        if (applied.length > 0) invalidateAutoToolCache();
    }

    // Fix #4: Per-secret audit entries for import
    const auditEntries = (result as any)._auditEntries as Array<{ name: string; operation: string; status: string; error?: string }> || [];
    for (const entry of auditEntries) {
        void logAuditOperation({
            operation: 'import' as any,
            secretName: entry.name,
            version: 0,
            status: entry.status as 'success' | 'failure' | 'partial',
            errorMessage: entry.error,
            initiatedBy: 'api',
        });
    }

    // Aggregate audit entry for the whole operation
    void logAuditOperation({
        operation: 'import', secretName: '*', version: 0,
        status: result.success ? 'success' : 'partial', initiatedBy: 'api',
        metadata: {
            imported: result.imported,
            skipped: result.skipped,
            failed: result.failed,
            tier3Rejected: result.tier3Rejected?.length || 0,
        },
    });

    // Clean response (remove internal _auditEntries field)
    const { _auditEntries, ...cleanResult } = result;
    return c.json(cleanResult, 200);
});

// ── POST /secrets/rotate — Re-encrypt the vault under a new system key ───────

const rotateSecretsRoute = createRoute({
    method: 'post',
    path: '/secrets/rotate',
    tags: ['System'],
    summary: 'Rotate the vault encryption key',
    description: 'Re-encrypts every vault secret from the old system key to a new one. Idempotent (safe to retry if interrupted). Use dryRun=true to pre-flight without changing anything. NOTE: switching the engine to the new FRONTBASE_SYSTEM_KEY still requires a backend key update + redeploy.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        oldSystemKey: z.string().min(1),
                        newSystemKey: z.string().min(1),
                        dryRun: z.boolean().optional(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Rotation result',
            content: {
                'application/json': {
                    schema: z.object({
                        success: z.boolean(),
                        dryRun: z.boolean().optional(),
                        totalSecrets: z.number().optional(),
                        progress: z.object({
                            total: z.number(),
                            completed: z.number(),
                            failed: z.number(),
                            failedSecrets: z.array(z.object({ name: z.string(), error: z.string() })),
                        }).optional(),
                        newKeyEncryptedWithOld: z.string().nullable().optional(),
                        rollbackArtifactWarning: z.string().optional(),
                    }),
                },
            },
        },
        400: { description: 'Invalid request / old key cannot decrypt', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
});

configRoute.openapi(rotateSecretsRoute, async (c) => {
    const { oldSystemKey, newSystemKey, dryRun } = c.req.valid('json');

    // Pre-flight: the old key must decrypt the existing vault (skip when empty).
    const preflight = await verifyVaultKey(oldSystemKey);
    if (!preflight.valid && preflight.total > 0) {
        void logAuditOperation({
            operation: 'rotate', secretName: '*', version: 0,
            status: 'failure', errorMessage: 'Old key cannot decrypt vault', initiatedBy: 'api',
            metadata: { corrupted: preflight.corrupted },
        });
        return c.json({
            error: 'RotationAborted',
            message: 'Old system key cannot decrypt the existing vault',
            corrupted: preflight.corrupted,
        }, 400);
    }

    if (dryRun) {
        return c.json({
            success: true,
            dryRun: true,
            totalSecrets: preflight.total,
            message: 'Dry run — old key verified successfully',
        }, 200);
    }

    const result = await rotateVaultKey(oldSystemKey, newSystemKey);

    void logAuditOperation({
        operation: 'rotate', secretName: '*', version: 0,
        status: result.success ? 'success' : 'partial', initiatedBy: 'api',
        metadata: { rotationProgress: result.progress },
    });

    // Drop the lazy cache — the active key is unchanged for this process, but
    // cached plaintexts are stale relative to the re-encrypted ciphertext.
    clearLazySecretCache();

    return c.json(result, 200);
});

// ── GET /secrets/:name — Metadata + health for one secret (never plaintext) ──

const getOneSecretRoute = createRoute({
    method: 'get',
    path: '/secrets/{name}',
    tags: ['System'],
    summary: 'Get metadata for a specific secret',
    description: 'Returns metadata only (version, timestamps, health, recent versions). Never returns the ciphertext or plaintext value.',
    request: {
        params: z.object({
            name: z.string().min(1),
        }),
    },
    responses: {
        200: {
            description: 'Secret metadata',
            content: {
                'application/json': {
                    schema: z.object({
                        name: z.string(),
                        version: z.number(),
                        createdAt: z.string().nullable(),
                        updatedAt: z.string().nullable(),
                        tier: z.number(),
                        health: z.enum(['healthy', 'corrupted']),
                        recentVersions: z.array(z.object({
                            version: z.number(),
                            createdAt: z.string(),
                            createdVia: z.string(),
                            isActive: z.boolean(),
                        })),
                    }),
                },
            },
        },
        400: { description: 'Invalid request', content: { 'application/json': { schema: ErrorResponseSchema } } },
        404: { description: 'Secret not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
});

configRoute.openapi(getOneSecretRoute, async (c) => {
    const { name } = c.req.valid('param');

    if (!SECRET_NAME_RE.test(name)) {
        // Fix #8: Return generic error to prevent secret name enumeration
        return c.json({
            error: 'InvalidRequest',
            message: 'Invalid secret name format',
        }, 400);
    }
    if (!getVaultSystemKey() || typeof stateProvider.getEdgeSecret !== 'function') {
        return c.json({ error: 'VaultDisabled', message: 'Vault not enabled on this engine' }, 404);
    }

    // Prefer the detail row (has createdAt); fall back to the basic read.
    const detail = await stateProvider.getEdgeSecretDetail?.(name);
    let ciphertext: string;
    let version: number;
    let createdAt: string | null;
    let updatedAt: string | null;
    if (detail) {
        ciphertext = detail.value;
        version = detail.version;
        createdAt = detail.createdAt;
        updatedAt = detail.updatedAt;
    } else {
        const basic = await stateProvider.getEdgeSecret?.(name);
        if (!basic) {
            return c.json({ error: 'NotFound', message: `Secret ${name} not found` }, 404);
        }
        ciphertext = basic.value;
        version = basic.version;
        // Fix #9: Use null for missing timestamps instead of current time
        createdAt = null;
        updatedAt = null;
    }

    // Health probe: attempt to decrypt with the active key.
    const systemKey = getVaultSystemKey()!;
    let health: 'healthy' | 'corrupted' = 'healthy';
    try {
        await decryptSecret(ciphertext, systemKey);
    } catch {
        health = 'corrupted';
    }

    let recentVersions: Array<{ version: number; createdAt: string; createdVia: string; isActive: boolean }> = [];
    if (typeof stateProvider.getSecretVersions === 'function') {
        try {
            recentVersions = (await stateProvider.getSecretVersions(name)).slice(0, 5).map((v) => ({
                version: v.version,
                createdAt: v.createdAt,
                createdVia: v.createdVia,
                isActive: v.isActive,
            }));
        } catch {
            recentVersions = [];
        }
    }

    void logAuditOperation({
        operation: 'read', secretName: name, version,
        status: 'success', initiatedBy: 'api',
    });

    return c.json({
        name,
        version,
        createdAt,
        updatedAt,
        tier: getSecretTier(name),
        health,
        recentVersions,
    }, 200);
});

// ── GET /secrets/:name/audit — Audit trail for one secret ────────────────────

const getSecretAuditRoute = createRoute({
    method: 'get',
    path: '/secrets/{name}/audit',
    tags: ['System'],
    summary: 'Get the audit trail for a specific secret',
    request: {
        params: z.object({ name: z.string().min(1) }),
    },
    responses: {
        200: {
            description: 'Audit history',
            content: {
                'application/json': {
                    schema: z.object({
                        entries: z.array(z.object({
                            id: z.string(),
                            operation: z.string(),
                            version: z.number(),
                            status: z.string(),
                            errorMessage: z.string().nullable(),
                            initiatedBy: z.string(),
                            timestamp: z.string(),
                            metadata: z.any().nullable(),
                        })),
                        count: z.number(),
                    }),
                },
            },
        },
    },
});

configRoute.openapi(getSecretAuditRoute, async (c) => {
    const { name } = c.req.valid('param');
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 500);
    const entries = await getAuditHistory(name, limit);
    return c.json({ entries, count: entries.length }, 200);
});

// ── GET /secrets/:name/versions — Version history for one secret ────────────

const getSecretVersionsRoute = createRoute({
    method: 'get',
    path: '/secrets/{name}/versions',
    tags: ['System'],
    summary: 'Get version history for a secret',
    description: 'Returns version metadata (never ciphertext). Use with POST /secrets/:name/rollback to restore a prior version.',
    request: {
        params: z.object({ name: z.string().min(1) }),
    },
    responses: {
        200: {
            description: 'Version history',
            content: {
                'application/json': {
                    schema: z.object({
                        versions: z.array(z.object({
                            id: z.string(),
                            version: z.number(),
                            createdAt: z.string(),
                            createdVia: z.string(),
                            isActive: z.boolean(),
                        })),
                        count: z.number(),
                    }),
                },
            },
        },
        400: { description: 'Not supported', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
});

configRoute.openapi(getSecretVersionsRoute, async (c) => {
    const { name } = c.req.valid('param');
    if (typeof stateProvider.getSecretVersions !== 'function') {
        return c.json({ error: 'NotSupported', message: 'Versioning not supported by this provider' }, 400);
    }
    const versions = await stateProvider.getSecretVersions(name);
    return c.json({ versions, count: versions.length }, 200);
});

// ── POST /secrets/:name/rollback — Restore a secret to a prior version ───────

const rollbackSecretRoute = createRoute({
    method: 'post',
    path: '/secrets/{name}/rollback',
    tags: ['System'],
    summary: 'Roll a secret back to a prior version',
    request: {
        params: z.object({ name: z.string().min(1) }),
        body: {
            content: {
                'application/json': {
                    schema: z.object({ version: z.number().int().min(1) }),
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Rollback successful',
            content: {
                'application/json': {
                    schema: SuccessResponseSchema.extend({
                        rolledBackTo: z.number(),
                        previousVersion: z.number(),
                    }),
                },
            },
        },
        400: { description: 'Version not found / unsupported', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
});

configRoute.openapi(rollbackSecretRoute, async (c) => {
    const { name } = c.req.valid('param');
    const { version: target } = c.req.valid('json');

    if (typeof stateProvider.rollbackSecret !== 'function') {
        return c.json({ error: 'NotSupported', message: 'Versioning not supported by this provider' }, 400);
    }
    if (!SECRET_NAME_RE.test(name)) {
        return c.json({ error: 'InvalidName', message: 'Invalid secret name' }, 400);
    }

    const before = await stateProvider.getEdgeSecret?.(name);
    const previousVersion = before?.version ?? 0;

    try {
        await stateProvider.rollbackSecret(name, target);
    } catch (err: any) {
        void logAuditOperation({
            operation: 'rollback', secretName: name, version: target,
            status: 'failure', errorMessage: err?.message || 'Rollback failed', initiatedBy: 'api',
        });
        return c.json({ error: 'RollbackFailed', message: err?.message || 'Rollback failed' }, 400);
    }

    // Reload the restored value into process.env + invalidate affected config.
    const systemKey = getVaultSystemKey();
    if (systemKey) {
        const restored = await stateProvider.getEdgeSecret?.(name);
        if (restored) {
            try {
                process.env[name] = await decryptSecret(restored.value, systemKey);
                const resetKey = SECRET_CONFIG_RESET[name];
                if (resetKey) resetConfig(resetKey as any);
            } catch {
                // Rollback still persisted in the vault; a restart will load it.
            }
        }
    }
    clearLazySecretCache();
    invalidateAutoToolCache();

    void logAuditOperation({
        operation: 'rollback', secretName: name, version: target,
        status: 'success', initiatedBy: 'api', metadata: { rollbackFrom: previousVersion },
    });

    return c.json({
        success: true as const,
        message: `Rolled back ${name} to version ${target}`,
        rolledBackTo: target,
        previousVersion,
    }, 200);
});

// ── DELETE /secrets/:name/versions/:version — Delete a non-active version ───

const deleteVersionRoute = createRoute({
    method: 'delete',
    path: '/secrets/{name}/versions/{version}',
    tags: ['System'],
    summary: 'Delete a specific (non-active) version',
    request: {
        params: z.object({
            name: z.string().min(1),
            version: z.string().min(1),
        }),
    },
    responses: {
        200: { description: 'Version deleted', content: { 'application/json': { schema: SuccessResponseSchema } } },
        400: { description: 'Cannot delete active / not found / unsupported', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
});

configRoute.openapi(deleteVersionRoute, async (c) => {
    const { name, version: versionStr } = c.req.valid('param');
    const version = parseInt(versionStr, 10);
    if (!Number.isFinite(version) || version < 1) {
        return c.json({ error: 'InvalidVersion', message: 'Version must be a positive integer' }, 400);
    }
    if (typeof stateProvider.deleteSecretVersion !== 'function') {
        return c.json({ error: 'NotSupported', message: 'Versioning not supported by this provider' }, 400);
    }

    try {
        await stateProvider.deleteSecretVersion(name, version);
    } catch (err: any) {
        return c.json({ error: 'DeleteFailed', message: err?.message || 'Delete failed' }, 400);
    }

    return c.json({
        success: true as const,
        message: `Deleted version ${version} of ${name}`,
    }, 200);
});

export { configRoute };
