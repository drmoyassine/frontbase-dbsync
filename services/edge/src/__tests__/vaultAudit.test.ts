/**
 * Phase 2 — Vault Audit Logging (provider layer, real SQLite).
 *
 * Exercises DrizzleStateProvider's audit methods directly: write, per-secret
 * history, global pagination, and per-secret count retention. Also verifies
 * the `logAuditOperation` facade is best-effort (never rejects) and honors the
 * FRONTBASE_AUDIT_LOGGING=false kill switch.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalSqliteProvider } from '../storage/LocalSqliteProvider';

// Proxy-backed stateProvider so the audit facade routes to the real provider.
const holder = vi.hoisted(() => ({ provider: null as any }));
vi.mock('../storage/index.js', () => ({
    stateProvider: new Proxy({}, {
        get: (_t, prop: string) => {
            const fn = holder.provider?.[prop];
            return typeof fn === 'function' ? fn.bind(holder.provider) : undefined;
        },
    }),
}));

import { logAuditOperation, getAuditHistory, getAuditEntries } from '../config/audit.js';

describe('Vault audit logging (DrizzleStateProvider)', () => {
    let provider: LocalSqliteProvider;

    beforeEach(async () => {
        process.env.PAGES_DB_URL = ':memory:';
        delete process.env.FRONTBASE_AUDIT_LOGGING;
        delete process.env.FRONTBASE_AUDIT_MAX_PER_SECRET;
        delete process.env.FRONTBASE_AUDIT_RETENTION_DAYS;
        provider = new LocalSqliteProvider();
        await provider.init();
        holder.provider = provider;
    });

    it('writes and reads back audit entries', async () => {
        await provider.logAudit({
            operation: 'create', secretName: 'FRONTBASE_CACHE', version: 1,
            status: 'success', initiatedBy: 'system',
        });

        const history = await provider.getAuditHistory('FRONTBASE_CACHE');
        expect(history).toHaveLength(1);
        expect(history[0].operation).toBe('create');
        expect(history[0].secretName).toBe('FRONTBASE_CACHE');
        expect(history[0].status).toBe('success');
        expect(history[0].errorMessage).toBeNull();
    });

    it('serializes + parses metadata and errorMessage round-trip', async () => {
        await provider.logAudit({
            operation: 'rotate', secretName: 'FRONTBASE_DATASOURCES', version: 4,
            status: 'failure', initiatedBy: 'api',
            errorMessage: 'decryption failed',
            metadata: { rollbackFrom: 3, rotationProgress: { total: 5, completed: 2, failed: 3 } },
        });

        const [entry] = await provider.getAuditHistory('FRONTBASE_DATASOURCES');
        expect(entry.status).toBe('failure');
        expect(entry.errorMessage).toBe('decryption failed');
        expect(entry.metadata).toEqual({
            rollbackFrom: 3,
            rotationProgress: { total: 5, completed: 2, failed: 3 },
        });
    });

    it('scopes history to the requested secret and orders newest-first', async () => {
        for (let i = 1; i <= 3; i++) {
            await provider.logAudit({
                operation: 'update', secretName: 'A', version: i,
                status: 'success', initiatedBy: 'system',
            });
        }
        await provider.logAudit({
            operation: 'create', secretName: 'B', version: 1,
            status: 'success', initiatedBy: 'system',
        });

        const aHistory = await provider.getAuditHistory('A');
        expect(aHistory).toHaveLength(3);
        // Newest first: highest version on top.
        expect(aHistory[0].version).toBeGreaterThanOrEqual(aHistory[2].version);

        const bHistory = await provider.getAuditHistory('B');
        expect(bHistory).toHaveLength(1);
    });

    it('paginates the global audit view with a total count', async () => {
        for (let i = 1; i <= 5; i++) {
            await provider.logAudit({
                operation: 'create', secretName: 'PAGINATE', version: i,
                status: 'success', initiatedBy: 'system',
            });
        }
        const page1 = await provider.getAuditEntries(2, 0);
        expect(page1.total).toBe(5);
        expect(page1.entries).toHaveLength(2);

        const page2 = await provider.getAuditEntries(2, 2);
        expect(page2.entries).toHaveLength(2);
        // No overlap between pages.
        expect(page1.entries.map((e) => e.id)).not.toEqual(
            expect.arrayContaining(page2.entries.map((e) => e.id)),
        );
    });

    it('prunes to FRONTBASE_AUDIT_MAX_PER_SECRET per secret', async () => {
        process.env.FRONTBASE_AUDIT_MAX_PER_SECRET = '5';
        for (let i = 1; i <= 12; i++) {
            await provider.logAudit({
                operation: 'read', secretName: 'PRUNE', version: i,
                status: 'success', initiatedBy: 'api',
            });
        }
        const history = await provider.getAuditHistory('PRUNE', 100);
        expect(history.length).toBeLessThanOrEqual(5);
    });
});

describe('logAuditOperation facade (best-effort + kill switch)', () => {
    let provider: LocalSqliteProvider;

    beforeEach(async () => {
        process.env.PAGES_DB_URL = ':memory:';
        delete process.env.FRONTBASE_AUDIT_LOGGING;
        provider = new LocalSqliteProvider();
        await provider.init();
        holder.provider = provider;
    });

    it('writes via the facade and is awaitable', async () => {
        await logAuditOperation({
            operation: 'export', secretName: '*', version: 0,
            status: 'success', initiatedBy: 'api',
        });
        const entries = await getAuditEntries(10, 0);
        expect(entries.total).toBe(1);
        expect(entries.entries[0].operation).toBe('export');
    });

    it('no-ops when FRONTBASE_AUDIT_LOGGING=false', async () => {
        process.env.FRONTBASE_AUDIT_LOGGING = 'false';
        await logAuditOperation({
            operation: 'create', secretName: 'X', version: 1,
            status: 'success', initiatedBy: 'api',
        });
        expect((await getAuditHistory('X')).length).toBe(0);
    });

    it('never rejects even when the provider throws', async () => {
        holder.provider = {
            logAudit: () => { throw new Error('DB exploded'); },
        };
        await expect(logAuditOperation({
            operation: 'create', secretName: 'X', version: 1,
            status: 'success', initiatedBy: 'api',
        })).resolves.toBeUndefined();
    });

    it('returns empty history gracefully when the provider lacks audit support', async () => {
        holder.provider = {}; // no getAuditHistory
        expect(await getAuditHistory('X')).toEqual([]);
        expect(await getAuditEntries(10, 0)).toEqual({ entries: [], total: 0 });
    });
});
