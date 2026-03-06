/**
 * Trailing Slash Tests
 *
 * Detects the "trailing slash disease" — routes that cause 307 redirects
 * when called with or without trailing slashes.
 *
 * This is a regression guard for the issue fixed in conversation f3d56f4d.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock all heavy dependencies so we can import the app cleanly
vi.mock('../storage/index.js', () => ({
    stateProvider: {
        getWorkflowById: vi.fn().mockResolvedValue(null),
        getActiveWebhookWorkflow: vi.fn().mockResolvedValue(null),
        createExecution: vi.fn(),
        upsertWorkflow: vi.fn(),
        init: vi.fn(),
        initSettings: vi.fn(),
    },
}));

vi.mock('../cache/index.js', () => ({
    cacheProvider: {
        get: vi.fn(),
        setex: vi.fn(),
        incr: vi.fn(),
        expire: vi.fn(),
    },
}));

vi.mock('../cache/redis.js', () => ({
    rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 50 }),
}));

vi.mock('../engine/runtime', () => ({
    executeWorkflow: vi.fn().mockResolvedValue({ status: 'completed' }),
    executeSingleNode: vi.fn(),
}));

vi.mock('../engine/concurrency.js', () => ({
    acquireConcurrency: vi.fn().mockResolvedValue(true),
    releaseConcurrency: vi.fn(),
}));

vi.mock('../engine/queue.js', () => ({
    verifyQueueSignature: vi.fn().mockResolvedValue(true),
    isQStashEnabled: vi.fn().mockReturnValue(false),
    publishExecution: vi.fn(),
}));

vi.mock('../engine/debounce.js', () => ({
    shouldDebounce: vi.fn().mockResolvedValue(false),
}));

vi.mock('../middleware/auth.js', () => ({
    apiKeyAuth: vi.fn().mockImplementation(async (_c: any, next: any) => next()),
    aiApiKeyAuth: vi.fn().mockImplementation(async (_c: any, next: any) => next()),
}));

import { createLiteApp } from '../engine/lite.js';

describe('Trailing Slash Regression Guard', () => {
    const app = createLiteApp();

    const criticalApiRoutes = [
        '/api/health',
        '/api/deploy',
    ];

    for (const route of criticalApiRoutes) {
        it(`GET ${route} does not 307 redirect`, async () => {
            const res = await app.request(route);
            expect(res.status).not.toBe(307);
        });

        it(`GET ${route}/ does not 307 redirect`, async () => {
            const res = await app.request(`${route}/`);
            expect(res.status).not.toBe(307);
        });
    }

    // POST routes that accept body
    const postRoutes = [
        '/api/execute/00000000-0000-0000-0000-000000000001',
        '/api/webhook/00000000-0000-0000-0000-000000000001',
    ];

    for (const route of postRoutes) {
        it(`POST ${route} does not 307 redirect`, async () => {
            const res = await app.request(route, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            // Should be 404 (workflow not found) — NOT 307
            expect(res.status).not.toBe(307);
        });
    }

    it('no Hono route definitions contain trailing slashes', async () => {
        // Inspect the route files for trailing slash patterns
        // This is a static analysis check
        const fs = await import('fs');
        const path = await import('path');

        const routeDir = path.resolve(import.meta.dirname || '.', '../routes');

        // Only run if routes dir exists (it may not in CI without source)
        try {
            const files = fs.readdirSync(routeDir).filter((f: string) => f.endsWith('.ts'));
            for (const file of files) {
                const content = fs.readFileSync(path.join(routeDir, file), 'utf8');
                // Find route path definitions — matches like path: '/:id/' or path: '/foo/'
                const pathMatches = content.match(/path:\s*['"`]([^'"`]+)['"`]/g) || [];
                for (const m of pathMatches) {
                    const routePath = m.match(/path:\s*['"`]([^'"`]+)['"`]/)?.[1] || '';
                    if (routePath !== '/' && routePath.endsWith('/')) {
                        throw new Error(
                            `Route in ${file} has trailing slash: ${routePath}`
                        );
                    }
                }
            }
        } catch (err: any) {
            if (err.message.includes('trailing slash')) throw err;
            // If routes dir doesn't exist, skip silently
        }
    });
});
