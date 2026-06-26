/**
 * Phase 2 — HTTP integration test for the vault config routes.
 *
 * Mounts the real configRoute (systemKeyAuth is applied at the app level in
 * production, so it is intentionally omitted here — auth is covered elsewhere)
 * and drives the full lifecycle through Hono's request() against a real
 * in-memory LocalSqliteProvider + real WebCrypto.
 *
 * Primary goal: prove route ordering is correct — the static sub-paths
 * (/export, /audit, /import, /rotate) are NOT captured by the parametric
 * /secrets/:name route.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { LocalSqliteProvider } from '../storage/LocalSqliteProvider';

const TEST_KEY = 'fb_sys_route_integration_key_0123456789';

const holder = vi.hoisted(() => ({ provider: null as any }));
vi.mock('../storage/index.js', () => ({
    stateProvider: new Proxy({}, {
        get: (_t, prop: string) => {
            const fn = holder.provider?.[prop];
            return typeof fn === 'function' ? fn.bind(holder.provider) : undefined;
        },
    }),
}));
// Break the config.ts → auto-register → lite.ts → configRoute circular import
// (lite.ts mounts configRoute at module top-level). invalidateAutoToolCache is
// a side-effect helper; stubbing it is safe and keeps the route module loadable.
vi.mock('../engine/agent/auto-register.js', () => ({ invalidateAutoToolCache: () => {} }));

import { configRoute } from '../routes/config.js';

const app = new OpenAPIHono();
app.route('/api/config', configRoute);

const SYS_HEADERS = { 'content-type': 'application/json' };

async function post(body: unknown, path = '/secrets') {
    return app.request(`/api/config${path}`, {
        method: 'POST', headers: SYS_HEADERS, body: JSON.stringify(body),
    });
}
async function get(path: string) {
    return app.request(`/api/config${path}`, { method: 'GET' });
}

describe('Vault routes (HTTP integration)', () => {
    beforeAll(async () => {
        process.env.PAGES_DB_URL = ':memory:';
        process.env.FRONTBASE_API_KEYS = JSON.stringify({ systemKey: TEST_KEY });
        holder.provider = new LocalSqliteProvider();
        await holder.provider.init();
    });

    it('creates + updates a secret, then reads its metadata (GET /secrets/:name)', async () => {
        const r1 = await post({ FRONTBASE_LIFECYCLE_TEST: 'value-1' });
        expect(r1.status).toBe(200);
        expect((await r1.json()).updated).toContain('FRONTBASE_LIFECYCLE_TEST');

        await post({ FRONTBASE_LIFECYCLE_TEST: 'value-2' });

        const meta = await get('/secrets/FRONTBASE_LIFECYCLE_TEST');
        expect(meta.status).toBe(200);
        const body = await meta.json();
        expect(body.name).toBe('FRONTBASE_LIFECYCLE_TEST');
        expect(body.version).toBe(2);
        expect(body.health).toBe('healthy');
        expect(body.tier).toBe(2);
        expect(body.recentVersions.length).toBe(2);
    });

    it('routes GET /secrets/export to the export handler (not :name="export")', async () => {
        const res = await get('/secrets/export');
        expect(res.status).toBe(200);
        const bundle = await res.json();
        expect(bundle.formatVersion).toBe(1);
        expect(Array.isArray(bundle.secrets)).toBe(true);
        expect(bundle.checksum).toMatch(/^[a-f0-9]{64}$/);
        expect(bundle.secrets.some((s: any) => s.name === 'FRONTBASE_LIFECYCLE_TEST')).toBe(true);
    });

    it('routes GET /secrets/audit to the audit handler (not :name="audit")', async () => {
        const res = await get('/secrets/audit');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.total).toBeGreaterThan(0);
        const ops = body.entries.map((e: any) => e.operation);
        // The lifecycle create + the prior export are both audited cross-route.
        expect(ops).toContain('create');
        expect(ops).toContain('export');
    });

    it('lists version history via GET /secrets/:name/versions', async () => {
        const res = await get('/secrets/FRONTBASE_LIFECYCLE_TEST/versions');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.count).toBe(2);
        expect(body.versions[0].isActive).toBe(true);
        expect(body.versions[0].version).toBe(2);
    });

    it('rolls back via POST /secrets/:name/rollback and applies the restored value', async () => {
        const res = await post({ version: 1 }, '/secrets/FRONTBASE_LIFECYCLE_TEST/rollback');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.rolledBackTo).toBe(1);
        expect(body.previousVersion).toBe(2);

        // Restored value is live in process.env (append-only → now version 3).
        expect(process.env.FRONTBASE_LIFECYCLE_TEST).toBe('value-1');
        const meta = await get('/secrets/FRONTBASE_LIFECYCLE_TEST');
        expect((await meta.json()).version).toBe(3);
    });

    it('returns per-secret audit history via GET /secrets/:name/audit', async () => {
        const res = await get('/secrets/FRONTBASE_LIFECYCLE_TEST/audit');
        expect(res.status).toBe(200);
        const body = await res.json();
        // 2 creates + 1 rollback = 3 entries for this secret.
        expect(body.count).toBeGreaterThanOrEqual(3);
        expect(body.entries.some((e: any) => e.operation === 'rollback')).toBe(true);
    });

    it('refuses to delete the active version via DELETE /secrets/:name/versions/:version', async () => {
        const res = await app.request(
            '/api/config/secrets/FRONTBASE_LIFECYCLE_TEST/versions/3',
            { method: 'DELETE' },
        );
        expect(res.status).toBe(400);
    });

    it('rejects key rotation pre-flight when the old key cannot decrypt', async () => {
        const res = await post({
            oldSystemKey: 'totally-wrong-key',
            newSystemKey: 'fb_sys_brand_new_key_456',
        }, '/secrets/rotate');
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.corrupted).toContain('FRONTBASE_LIFECYCLE_TEST');
    });

    it('rotates the vault under a new key (dry-run then real)', async () => {
        const newKey = 'fb_sys_brand_new_key_789012';
        const dry = await post({ oldSystemKey: TEST_KEY, newSystemKey: newKey, dryRun: true }, '/secrets/rotate');
        expect(dry.status).toBe(200);
        expect((await dry.json()).dryRun).toBe(true);

        const real = await post({ oldSystemKey: TEST_KEY, newSystemKey: newKey }, '/secrets/rotate');
        expect(real.status).toBe(200);
        const body = await real.json();
        expect(body.success).toBe(true);
        expect(body.progress.failed).toBe(0);
    });
});
